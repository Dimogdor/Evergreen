// Run: npm test — admin sign-in, the storage relay and the testimonial endpoint, with the repository API mocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const env = {
  ADMINS: 'katerina@example.gr=forest-2026; kostas@example.gr=other', SESSION_KEY: 'k'.repeat(40), GITHUB_TOKEN: 'ghp_server_secret', REPO: 'o/r', BRANCH: 'main',
  ALLOWED_ORIGINS: 'https://site.example', SITE_URL: 'https://site.example/sub',
};
const call = (path: string, init?: RequestInit) => worker.fetch(new Request('https://api.example' + path, init), env);

function mockGitHub() {
  const calls: { url: string; method: string; body: any }[] = [];
  globalThis.fetch = (async (url: string, init: any = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ url, method: init.method || 'GET', body });
    const sha = { sha: 'x' + calls.length };
    if (url.includes('/git/ref/heads/')) return Response.json({ object: { sha: 'parent' } });
    if (url.includes('/git/commits/parent')) return Response.json({ tree: { sha: 'tree0' } });
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

const signIn = async (email: string, password: string) => {
  const f = new FormData(); f.append('email', email); f.append('password', password);
  return call('/auth?provider=github&site_id=x', { method: 'POST', body: f });
};
const tokenOf = (html: string) => JSON.parse(html.match(/msg = ("authorization:github:success:.*?");/)![1]).split('success:')[1];

test('sign-in: e-mail + password form, wrong password refused', async () => {
  assert.match(await (await call('/auth?provider=github')).text(), /type="password"/);
  const bad = await signIn('katerina@example.gr', 'nope');
  assert.equal(bad.status, 401);
  assert.doesNotMatch(await bad.text(), /authorization:github:success/);
  assert.equal((await signIn('stranger@example.gr', 'forest-2026')).status, 401);
});

test('sign-in: session is only posted back to allowed origins', async () => {
  const html = await (await signIn(' Katerina@Example.gr ', 'forest-2026')).text();
  assert.match(html, /allowed\.includes\(e\.origin\)/);
  assert.ok(html.includes('["https://site.example"]'));
  assert.ok(!html.includes('ghp_server_secret'), 'the repository token never reaches the browser');
});

test('relay: forwards admin calls with the server token, rejects forged sessions', async () => {
  const calls = mockGitHub();
  const token = JSON.parse(tokenOf(await (await signIn('katerina@example.gr', 'forest-2026')).text())).token;
  const headers = { Authorization: `token ${token}`, Origin: 'https://site.example' };
  const r = await call('/api/v3/repos/o/r/contents/x.yml?ref=main', { headers });
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://site.example');
  assert.equal(calls[0].url, 'https://api.github.com/repos/o/r/contents/x.yml?ref=main');
  await call('/api/graphql', { method: 'POST', headers, body: '{"query":"{viewer{login}}"}' });
  assert.equal(calls[1].url, 'https://api.github.com/graphql');
  const forged = token.replace(/.$/, (c: string) => (c === 'A' ? 'B' : 'A'));
  assert.equal((await call('/api/v3/user', { headers: { ...headers, Authorization: `token ${forged}` } })).status, 401);
  const removed = await worker.fetch(new Request('https://api.example/api/v3/user', { headers }), { ...env, ADMINS: 'kostas@example.gr=other' });
  assert.equal(removed.status, 401);
  assert.equal(calls.length, 2);
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
    ['public/uploads/stories/ID.jpg', 'src/content/testimonials/ID.yml']);
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
