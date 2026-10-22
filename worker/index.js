// Evergreen API — one free Cloudflare Worker, two jobs:
//   GET  /auth, /callback  "Sign in with GitHub" for the admin panel (Sveltia CMS OAuth popup)
//   POST /testimonial      a visitor's story → saved UNPUBLISHED in the repo + a GitHub issue that
//                          e-mails the admins; it goes online only when an admin ticks "Published".
// Setup: worker/README.md. Settings (Worker → Settings → Variables and secrets):
//   secrets  GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (OAuth app), GITHUB_TOKEN (fine-grained, this repo only:
//            Contents + Issues read/write), optional TURNSTILE_SECRET (anti-spam)
//   vars     REPO ("Dimogdor/Evergreen"), BRANCH ("main"), ALLOWED_ORIGINS ("https://dimogdor.github.io,…"), SITE_URL

const PHOTO_MAX = 6 * 1024 * 1024;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (req.method === 'GET' && url.pathname === '/auth') return auth(url, env);
      if (req.method === 'GET' && url.pathname === '/callback') return await callback(req, url, env);
      if (req.method === 'POST' && url.pathname === '/testimonial') return await testimonial(req, env);
      return new Response('Not found', { status: 404 });
    } catch (e) {
      console.error(e);
      return new Response('Server error', { status: 500 });
    }
  },
};

const allowedOrigins = (env) => (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const script = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// ───────────── Admin sign-in (same protocol as sveltia-cms-auth) ─────────────

function auth(url, env) {
  if (url.searchParams.get('provider') !== 'github') return new Response('Unsupported provider', { status: 400 });
  const state = crypto.randomUUID();
  // ponytail: public_repo is enough while the repository is public; set SCOPE=repo if it becomes private.
  const q = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, scope: env.SCOPE || 'public_repo', state });
  return new Response(null, {
    status: 302,
    headers: { Location: `https://github.com/login/oauth/authorize?${q}`, 'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600` },
  });
}

async function callback(req, url, env) {
  const cookie = /(?:^|;\s*)oauth_state=([\w-]+)/.exec(req.headers.get('Cookie') || '')?.[1];
  const code = url.searchParams.get('code');
  if (!code || !cookie || url.searchParams.get('state') !== cookie) return popup(env, { error: 'Sign-in expired, please try again.' });
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  });
  const data = await r.json().catch(() => ({}));
  return popup(env, data.access_token ? { token: data.access_token } : { error: data.error_description || 'Sign-in failed.' });
}

// The popup hands the token only to the admin page of an allowed site (never to any other opener).
function popup(env, result) {
  const msg = `authorization:github:${result.token ? 'success' : 'error'}:${JSON.stringify({ provider: 'github', ...result })}`;
  const html = `<!doctype html><meta charset="utf-8"><title>Signing in…</title><p>Signing in…</p><script>
const allowed = ${script(allowedOrigins(env))}, msg = ${script(msg)};
addEventListener('message', (e) => {
  if (e.source === window.opener && allowed.includes(e.origin) && e.data === 'authorizing:github') window.opener.postMessage(msg, e.origin);
});
if (window.opener) window.opener.postMessage('authorizing:github', '*');
</script>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'",
      'Set-Cookie': 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    },
  });
}

// ───────────── Testimonials ─────────────

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
const slug = (s) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_-]+/g, '-').slice(0, 30) || 'guest';

function looksLike(type, b) {
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (type === 'image/webp') return String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
  return false;
}

function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function testimonial(req, env) {
  const form = await req.formData();
  const ret = String(form.get('return') || '');
  const back = allowedOrigins(env).some((o) => ret.startsWith(o + '/')) ? ret.split(/[?#]/)[0] : '';
  const reply = (status) => (back
    ? new Response(null, { status: 303, headers: { Location: `${back}?story=${status}#share` } })
    : Response.json({ status }, { status: status === 'sent' ? 200 : 400 }));

  // Anti-spam: per-IP rate limit (wrangler.toml), hidden field filled by bots, form sent faster than a human can type, optional Turnstile.
  if (env.LIMITER && !(await env.LIMITER.limit({ key: req.headers.get('CF-Connecting-IP') || '' })).success) return reply('error');
  const started = Number(form.get('t'));
  if (form.get('website') || !started || Date.now() - started < 4000) return reply('sent');
  if (env.TURNSTILE_SECRET) {
    const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(form.get('cf-turnstile-response') || '') }),
    }).then((r) => r.json()).catch(() => ({}));
    if (!v.success) return reply('error');
  }

  const entry = {
    name: clean(form.get('name'), 80),
    country: clean(form.get('country'), 60),
    project: clean(form.get('project'), 80),
    quote: clean(form.get('quote'), 2500),
    video: clean(form.get('video'), 200),
    date: new Date().toISOString().slice(0, 10),
    published: false,
  };
  if (!entry.name || entry.quote.length < 20 || form.get('consent') !== 'yes') return reply('error');
  if (!/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com)\//.test(entry.video)) entry.video = '';

  const id = `${entry.date}-${slug(entry.name)}-${crypto.randomUUID().slice(0, 4)}`;
  const files = [];
  const photo = form.get('photo');
  if (photo && typeof photo === 'object' && photo.size > 0) {
    const ext = PHOTO_TYPES[photo.type];
    if (!ext || photo.size > PHOTO_MAX) return reply('error');
    const bytes = new Uint8Array(await photo.arrayBuffer());
    if (!looksLike(photo.type, bytes)) return reply('error');
    entry.photo = `/src/assets/uploads/story-${id}.${ext}`;
    files.push({ path: `src/assets/uploads/story-${id}.${ext}`, content: base64(bytes) });
  }
  // JSON is valid YAML, and the CMS rewrites the file in its own style when an admin saves it.
  files.push({ path: `src/content/testimonials/${id}.yml`, content: base64(new TextEncoder().encode(JSON.stringify(entry, null, 2) + '\n')) });

  await commit(env, files, `New story from ${entry.name} (waiting for approval)`);
  const site = (env.SITE_URL || '').replace(/\/$/, '');
  const quiet = (v) => v.replace(/@/g, '@\u200b'); // no @mentions: visitors can't make GitHub notify strangers
  await gh(env, `/repos/${env.REPO}/issues`, {
    title: quiet(`New story from ${entry.name} — waiting for your approval`),
    body: quiet(`**${entry.name}**${entry.country ? ` (${entry.country})` : ''}${entry.project ? ` · ${entry.project}` : ''}\n\n> ${entry.quote.replace(/\n/g, '\n> ')}\n\n`)
      + `To publish it: open ${site}/admin/#/collections/testimonials/entries/${id}, tick **Published** and save. To refuse it, delete the entry.\n\nThen close this issue.`,
    labels: ['testimonial'],
  }).catch((e) => console.error('issue', e)); // the story is saved even if the notification fails
  return reply('sent');
}

// ───────────── GitHub API ─────────────

async function gh(env, path, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'evergreen-api', 'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw Object.assign(new Error(`GitHub ${method} ${path} → ${r.status}`), { status: r.status });
  return r.json();
}

// All files in one commit (one site rebuild); retried if someone pushed at the same moment.
async function commit(env, files, message) {
  const repo = env.REPO, branch = env.BRANCH || 'main';
  const blobs = await Promise.all(files.map((f) => gh(env, `/repos/${repo}/git/blobs`, { content: f.content, encoding: 'base64' })));
  for (let attempt = 0; ; attempt++) {
    const parent = (await gh(env, `/repos/${repo}/git/ref/heads/${branch}`)).object.sha;
    const baseTree = (await gh(env, `/repos/${repo}/git/commits/${parent}`)).tree.sha;
    const tree = await gh(env, `/repos/${repo}/git/trees`, {
      base_tree: baseTree, tree: files.map((f, i) => ({ path: f.path, mode: '100644', type: 'blob', sha: blobs[i].sha })),
    });
    const c = await gh(env, `/repos/${repo}/git/commits`, { message, tree: tree.sha, parents: [parent] });
    try {
      return await gh(env, `/repos/${repo}/git/refs/heads/${branch}`, { sha: c.sha }, 'PATCH');
    } catch (e) {
      if (e.status !== 422 || attempt >= 2) throw e; // 422 = branch moved meanwhile
    }
  }
}
