// Run: npm test — the admin sign-in popup and the testimonial endpoint, with GitHub mocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const env = {
  GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'secret', GITHUB_TOKEN: 'tok', REPO: 'o/r', BRANCH: 'main',
  ALLOWED_ORIGINS: 'https://site.example', SITE_URL: 'https://site.example/sub',
};
const call = (path: string, init?: RequestInit) => worker.fetch(new Request('https://api.example' + path, init), env);

function mockGitHub() {
  const calls: { url: string; method: string; body: any }[] = [];
  globalThis.fetch = (async (url: string, init: any = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method || 'GET', body });
    const sha = { sha: 'x' + calls.length };
    if (url.includes('/git/ref/heads/')) return Response.json({ object: { sha: 'parent' } });
    if (url.includes('/git/commits/parent')) return Response.json({ tree: { sha: 'tree0' } });
    if (url.includes('access_token')) return Response.json({ access_token: 'gho_abc' });
    return Response.json(sha, { status: 201 });
  }) as any;
  return calls;
}

function form(fields: Record<string, string | Blob>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return { method: 'POST', body: f };
}
const valid = () => ({ name: 'Ana Silva', country: 'Portugal', project: 'ESC 2025', quote: 'Five months in the forest changed how I live.', consent: 'yes', t: String(Date.now() - 60_000), return: 'https://site.example/sub/en/stories/' });

test('sign-in: redirects to GitHub with a state cookie, rejects a forged callback', async () => {
  const r = await call('/auth?provider=github&site_id=x');
  assert.equal(r.status, 302);
  assert.match(r.headers.get('Location')!, /^https:\/\/github\.com\/login\/oauth\/authorize\?client_id=cid&scope=public_repo&state=/);
  assert.match(r.headers.get('Set-Cookie')!, /oauth_state=[\w-]+; HttpOnly; Secure/);
  const bad = await (await call('/callback?code=c&state=forged', { headers: { Cookie: 'oauth_state=real' } })).text();
  assert.match(bad, /authorization:github:error:/);
});

test('sign-in: token is only posted back to allowed origins', async () => {
  mockGitHub();
  const html = await (await call('/callback?code=c&state=s1', { headers: { Cookie: 'oauth_state=s1' } })).text();
  assert.match(html, /authorization:github:success:/);
  assert.match(html, /gho_abc/);
  assert.match(html, /allowed\.includes\(e\.origin\)/);
  assert.ok(html.includes('["https://site.example"]'));
});

test('story: honeypot and too-fast submissions are dropped silently', async () => {
  const calls = mockGitHub();
  for (const extra of [{ website: 'spam' }, { t: String(Date.now()) }]) {
    const r = await call('/testimonial', form({ ...valid(), ...extra }));
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('Location'), 'https://site.example/sub/en/stories/?story=sent#share');
  }
  assert.equal(calls.length, 0);
});

test('story: saved unpublished in one commit, admins notified by an issue', async () => {
  const calls = mockGitHub();
  const jpg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' });
  const r = await call('/testimonial', form({ ...valid(), photo: new File([jpg], 'me.jpg', { type: 'image/jpeg' }) }));
  assert.equal(r.headers.get('Location'), 'https://site.example/sub/en/stories/?story=sent#share');
  const tree = calls.find((c) => c.url.endsWith('/git/trees'))!.body.tree;
  assert.deepEqual(tree.map((t: any) => t.path.replace(/\d{4}-\d\d-\d\d-ana-silva-\w{4}/, 'ID')),
    ['src/assets/uploads/story-ID.jpg', 'src/content/testimonials/ID.yml']);
  const yml = calls.filter((c) => c.url.endsWith('/git/blobs'))[1].body.content;
  const entry = JSON.parse(Buffer.from(yml, 'base64').toString());
  assert.equal(entry.published, false);
  assert.equal(entry.name, 'Ana Silva');
  assert.equal(calls.find((c) => c.url.endsWith('/refs/heads/main'))!.method, 'PATCH');
  assert.match(calls.find((c) => c.url.endsWith('/issues'))!.body.title, /waiting for your approval/);
});

test('story: rejects fake images, missing consent and foreign return URLs', async () => {
  const calls = mockGitHub();
  const fake = new File(['<svg onload=alert(1)>'], 'x.jpg', { type: 'image/jpeg' });
  assert.match((await call('/testimonial', form({ ...valid(), photo: fake }))).headers.get('Location')!, /story=error/);
  assert.match((await call('/testimonial', form({ ...valid(), consent: '' }))).headers.get('Location')!, /story=error/);
  const r = await call('/testimonial', form({ ...valid(), consent: '', return: 'https://evil.example/' }));
  assert.equal(r.status, 400); // no open redirect
  assert.equal(calls.length, 0);
});

test('story: rate-limited visitors and @mentions cannot spam', async () => {
  const calls = mockGitHub();
  const limited = { ...env, LIMITER: { limit: async () => ({ success: false }) } };
  const r = await worker.fetch(new Request('https://api.example/testimonial', form(valid())), limited);
  assert.match(r.headers.get('Location')!, /story=error/);
  assert.equal(calls.length, 0);
  await call('/testimonial', form({ ...valid(), quote: 'Thanks @octocat for these months in the forest!' }));
  assert.ok(!/@octocat/.test(calls.find((c) => c.url.endsWith('/issues'))!.body.body));
});
