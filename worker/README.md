# evergreen-api (Cloudflare Worker, free plan)

One worker so that **Katerina, Kostas and the other admins never need a GitHub account**:

- **Admin sign-in with e-mail + password** (the admin panel's sign-in button opens a small login window).
- **Storage relay**: the admin panel saves through the worker, which holds the only key to the content repository.
- **Visitors' stories**: saved unpublished, the team is notified, an admin ticks “Published”.

## 1. Create the key to the content repository (once)
GitHub → Settings → Developer settings → **Fine-grained tokens → Generate new token**
- Repository access: **only** `Dimogdor/Evergreen` · Expiration: the longest allowed (set a reminder to renew it)
- Permissions: **Contents: Read and write**, **Issues: Read and write** (nothing else)

## 2. Deploy the worker
Recommended (also turns on the limit of 3 attempts per minute per visitor, for logins and stories):
```bash
cd worker
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN    # from step 1
npx wrangler secret put SESSION_KEY     # any long random text, e.g. from: openssl rand -base64 32
npx wrangler secret put ADMINS          # katerina@mail.gr=a-good-password;kostas@mail.gr=another-password
```
Without a terminal: Cloudflare dashboard → **Workers & Pages → Create → Worker** `evergreen-api` → **Edit code**, paste
`index.js`, Deploy, then add the same secrets and the variables of `wrangler.toml` in **Settings → Variables and secrets**
(no rate limit this way: turn on Turnstile below).

**Add / remove an admin or change a password:** edit the `ADMINS` secret (one `email=password` per admin, separated by `;`).
Removing someone signs them out immediately. Sessions last 30 days.

## 3. Connect the admin panel and the site
- `public/admin/config.yml`: uncomment `base_url` and `api_root` with the worker address (one-time edit).
- `/admin` → **Settings → Site, contact & bank → Website API address**: the worker address (turns on the stories form).
- `ALLOWED_ORIGINS` in `wrangler.toml`: every address the site is served from (add the own domain when there is one).

## 4. Notifications for new stories
- With the site's own domain on Cloudflare: turn on **Email Routing**, verify `evergreenecovillage@gmail.com` as a destination,
  then uncomment the `send_email` block in `wrangler.toml` (and set `MAIL_FROM` / `MAIL_TO`) → a plain e-mail for each story.
- Until then, each story opens an issue in the repository (an e-mail goes to whoever watches it — e.g. the developer).
- The admins can always open `/admin` → **Stories → ⏳ Waiting for approval**.

## Optional: Cloudflare Turnstile (stronger anti-spam)
Cloudflare → Turnstile → Add site. **Site key** → `/admin` → Settings → “Anti-spam site key”; **secret key** → `TURNSTILE_SECRET`.

## Leaving GitHub completely (later)
The content is plain YAML files and photos; GitHub is only the storage behind the worker.
- **Hosting**: Cloudflare Pages (see the main README) — the repository can then be made private.
- **Storage elsewhere** (GitLab, Forgejo/Codeberg…): change `backend` in `public/admin/config.yml` (Sveltia supports `gitlab`
  and `gitea`), and the two GitHub functions at the bottom of `index.js` (`gh`, `commit`) plus the relay target.

Tests: `npm test` (root of the repository).
