// Evergreen API — one free Cloudflare Worker, so the admins never need a GitHub account:
//   GET/POST /auth                    admin sign-in with e-mail + password (popup used by the admin panel)
//   *        /api/v3/*, /api/graphql  the admin panel's storage calls, relayed to the content repository
//                                     with the server-side token once the admin's session is checked
//   POST     /ai/proofread            "✓ Correct" button of the admin panel (see ai.js; saves are also auto-translated there)
//   POST     /testimonial             a visitor's story → saved UNPUBLISHED + e-mail to the team;
//                                     it goes online only when an admin ticks "Published".
// Setup: worker/README.md. Settings (Worker → Settings → Variables and secrets):
//   secrets  ADMINS ("katerina@mail.gr=password;kostas@mail.gr=password"), SESSION_KEY (long random text),
//            GITHUB_TOKEN (fine-grained, content repository only: Contents + Issues read/write),
//            optional ANTHROPIC_API_KEY (proofreading + automatic translation), optional TURNSTILE_SECRET
//   vars     REPO, BRANCH, ALLOWED_ORIGINS ("https://dimogdor.github.io,…"), SITE_URL,
//            optional MAIL_FROM + MAIL_TO with the MAIL send_email binding (e-mail notifications)

import { i18nFields, proofread, SOURCES, translateFile } from './ai.js';
import YAML from 'yaml';

const PHOTO_MAX = 6 * 1024 * 1024;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SESSION_DAYS = 30;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/auth') return req.method === 'POST' ? await login(req, env) : page(loginForm(''));
      if (url.pathname.startsWith('/api/')) return await relay(req, url, env);
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
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const limited = async (req, env) =>
  !!env.LIMITER && !(await env.LIMITER.limit({ key: req.headers.get('CF-Connecting-IP') || '' })).success;

// ───────────── Admin sign-in (same popup protocol as sveltia-cms-auth) ─────────────

const page = (body, status = 200) => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evergreen — Admin</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#f4f0e6;color:#17231a;display:grid;place-items:center;min-height:100vh;margin:0}
form{display:grid;gap:12px;width:min(320px,90vw)}input,button{font:inherit;padding:10px;border:1px solid #17231a;border-radius:6px;width:100%;box-sizing:border-box}button{background:#22402a;color:#fff;cursor:pointer}.err{color:#a3341f}</style>${body}</html>`, {
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'" },
});

const loginForm = (error) => `<form method="post">
<h1 style="margin:0;font-weight:500">Evergreen · Admin</h1>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<label>Email<input name="email" type="email" required autocomplete="username"></label>
<label>Κωδικός · Password<input name="password" type="password" required autocomplete="current-password"></label>
<button>Σύνδεση · Sign in</button></form>`;

// ADMINS secret: "email=password;email=password" (kept in Cloudflare's encrypted secrets, never in the repository).
const admins = (env) => new Map(String(env.ADMINS || '').split(/[;\n]/).map((l) => l.trim().split('=')).filter(([e, p]) => e && p).map(([e, p]) => [e.toLowerCase(), p]));

async function login(req, env) {
  if (await limited(req, env)) return page(loginForm('Too many attempts — wait a minute.'), 429);
  const form = await req.formData();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const expected = admins(env).get(email);
  // Compare HMACs so the check takes the same time whatever the password.
  const ok = expected !== undefined && (await sign(env, `pw:${form.get('password')}`)) === (await sign(env, `pw:${expected}`));
  if (!ok) return page(loginForm('Wrong e-mail or password.'), 401);
  const payload = `${email}|${Date.now() + SESSION_DAYS * 864e5}`;
  return popup(env, `${btoa(payload)}.${await sign(env, payload)}`);
}

// The popup hands the session only to the admin page of an allowed site (never to any other opener).
function popup(env, token) {
  const msg = `authorization:github:success:${JSON.stringify({ provider: 'github', token })}`;
  return page(`<p>Signing in…</p><script>
const allowed = ${script(allowedOrigins(env))}, msg = ${script(msg)};
addEventListener('message', (e) => {
  if (e.source === window.opener && allowed.includes(e.origin) && e.data === 'authorizing:github') window.opener.postMessage(msg, e.origin);
});
if (window.opener) window.opener.postMessage('authorizing:github', '*');
</script>`);
}

async function sign(env, text) {
  if (!env.SESSION_KEY) throw new Error('SESSION_KEY secret missing');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function session(env, header) {
  const [b64, mac] = String(header || '').replace(/^(Bearer|token) /i, '').split('.');
  if (!b64 || !mac) return null;
  let payload;
  try { payload = atob(b64); } catch { return null; }
  const [email, exp] = payload.split('|');
  if (mac !== (await sign(env, payload)) || !(Date.now() < Number(exp)) || !admins(env).has(email)) return null;
  return email; // removing someone from ADMINS ends their sessions at once
}

// ───────────── Storage relay for the admin panel ─────────────

async function relay(req, url, env) {
  const origin = req.headers.get('Origin') || '';
  const cors = allowedOrigins(env).includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, If-None-Match, X-Evergreen-Lang', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE', 'Access-Control-Expose-Headers': 'ETag, Link, X-Evergreen-Translated, X-Evergreen-Notice', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
    : {};
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!(await session(env, req.headers.get('Authorization')))) return Response.json({ message: 'Bad credentials' }, { status: 401, headers: cors });

  if (url.pathname === '/api/ai/proofread') {
    if (!env.ANTHROPIC_API_KEY) return Response.json({ message: 'Proofreading is not set up' }, { status: 501, headers: cors });
    const { text = '' } = await req.json().catch(() => ({}));
    if (!String(text).trim() || text.length > 12000) return Response.json({ message: 'Text missing or too long' }, { status: 400, headers: cors });
    return Response.json(await proofread(env, String(text)), { headers: cors });
  }

  // /api/v3/x → https://api.github.com/x, /api/graphql → https://api.github.com/graphql
  const path = url.pathname === '/api/graphql' ? '/graphql' : url.pathname.replace(/^\/api\/v3/, '');
  let body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();
  const notices = [];
  // The admin writes in the language chosen when opening the panel; the other languages follow.
  const source = SOURCES.includes(req.headers.get('X-Evergreen-Lang')) ? req.headers.get('X-Evergreen-Lang') : 'el';
  const translated = path === '/graphql' && env.ANTHROPIC_API_KEY
    ? await translateSave(env, body, undefined, source).catch((e) => (console.error('translate', e), notices.push('translate-failed'), null))
    : null;
  if (translated) body = translated.body;

  const headers = new Headers({ Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'evergreen-api', Accept: req.headers.get('Accept') || 'application/vnd.github+json' });
  if (req.headers.get('Content-Type')) headers.set('Content-Type', req.headers.get('Content-Type'));
  const r = await fetch(`https://api.github.com${path}${url.search}`, { method: req.method, headers, body });
  const out = new Headers(r.headers);
  for (const [k, v] of Object.entries(cors)) out.set(k, v);
  // Warn the admins a month before the repository key expires (GitHub sends its expiry date with every answer).
  const expires = Date.parse(String(r.headers.get('github-authentication-token-expiration')).replace(' UTC', 'Z').replace(' ', 'T'));
  const days = Math.floor((expires - Date.now()) / 864e5);
  if (days < 30) notices.push(`key-expires:${Math.max(days, 0)}`);
  if (notices.length) out.set('X-Evergreen-Notice', notices.join(','));
  if (!translated || !r.ok) return new Response(r.body, { status: r.status, headers: out });

  // The admin panel remembers each saved file by its fingerprint: give back the fingerprint of what it sent, so it
  // notices the translated version and loads it on the next refresh (instead of trusting its own copy forever).
  const data = await r.json();
  const commit = data?.data?.createCommitOnBranch?.commit;
  for (const [alias, original] of Object.entries(translated.aliases)) if (commit?.[alias]) commit[alias].oid = original;
  out.set('X-Evergreen-Translated', String(translated.count));
  out.delete('Content-Length');
  return Response.json(data, { status: r.status, headers: out });
}

const utf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
export async function blobOid(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length); all.set(head); all.set(bytes, head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', all))].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function raw(env, path) {
  const r = await fetch(`https://api.github.com/repos/${env.REPO}/contents/${path}?ref=${env.BRANCH || 'main'}`, {
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.raw', 'User-Agent': 'evergreen-api' },
  });
  return r.ok ? r.text() : null;
}

// A save from the admin panel: translate the texts that are new or changed in every content file of the commit.
export async function translateSave(env, body, translate, source = 'el') {
  const json = JSON.parse(body || '{}');
  const input = json.variables?.input;
  if (!String(json.query).includes('createCommitOnBranch') || !input?.fileChanges?.additions) return null;
  const files = input.fileChanges.additions.filter((a) => /^src\/content\/(?!testimonials\/).+\.ya?ml$/.test(a.path));
  if (!files.length) return null;
  const config = YAML.parse((await raw(env, 'src/admin/config.yml')) || '{}');
  const aliases = {}, paths = Object.fromEntries([...String(json.query).matchAll(/(file_\d+): file\(path: ("(?:[^"\\]|\\.)*")\)/g)].map(([, a, p]) => [JSON.parse(p), a]));
  let count = 0;
  for (const a of files) {
    const text = await translateFile(env, { text: utf8(a.contents), previous: await raw(env, a.path), fields: i18nFields(config, a.path), source }, translate);
    if (!text) continue;
    if (paths[a.path]) aliases[paths[a.path]] = await blobOid(a.contents);
    a.contents = base64(new TextEncoder().encode(text));
    count++;
  }
  return count ? { body: JSON.stringify(json), aliases, count } : null;
}

// ───────────── Testimonials ─────────────

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
const slug = (s) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_-]+/g, '-').slice(0, 30) || 'guest';
const quiet = (v) => v.replace(/@/g, '@​'); // no @mentions in repository issues: visitors can't notify strangers

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
  if (await limited(req, env)) return reply('error');
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
    // Served as is, never processed by the build: a damaged photo can't stop the site from being published.
    entry.photo = `/uploads/stories/${id}.${ext}`;
    files.push({ path: `public/uploads/stories/${id}.${ext}`, content: base64(bytes) });
  }
  // JSON is valid YAML, and the CMS rewrites the file in its own style when an admin saves it.
  files.push({ path: `src/content/testimonials/${id}.yml`, content: base64(new TextEncoder().encode(JSON.stringify(entry, null, 2) + '\n')) });

  await commit(env, files, `New story from ${entry.name} (waiting for approval)`);
  const site = (env.SITE_URL || '').replace(/\/$/, '');
  const subject = `New story from ${entry.name} — waiting for your approval`;
  const text = `${entry.name}${entry.country ? ` (${entry.country})` : ''}${entry.project ? ` · ${entry.project}` : ''}\n\n> ${entry.quote.replace(/\n/g, '\n> ')}\n\n`
    + `To publish it: open ${site}/admin/#/collections/testimonials/entries/${id}, tick “Published” and save. To refuse it, delete the entry.`;
  await notify(env, id, subject, text).catch((e) => console.error('notify', e)); // the story is saved even if the notification fails
  return reply('sent');
}

// E-mail through Cloudflare (MAIL send_email binding, needs the domain on Cloudflare); otherwise a repository issue.
async function notify(env, id, subject, text) {
  if (env.MAIL && env.MAIL_FROM && env.MAIL_TO) {
    const { EmailMessage } = await import('cloudflare:email');
    const b64 = (s) => base64(new TextEncoder().encode(s));
    const raw = [`From: Evergreen website <${env.MAIL_FROM}>`, `To: ${env.MAIL_TO}`, `Subject: =?UTF-8?B?${b64(subject)}?=`,
      `Message-ID: <${id}@${env.MAIL_FROM.split('@')[1]}>`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(text)].join('\r\n');
    return env.MAIL.send(new EmailMessage(env.MAIL_FROM, env.MAIL_TO, raw));
  }
  return gh(env, `/repos/${env.REPO}/issues`, { title: quiet(subject), body: `${quiet(text)}\n\nThen close this issue.`, labels: ['testimonial'] });
}

// ───────────── Content repository (GitHub API, used only by this worker — swap here to migrate) ─────────────

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
