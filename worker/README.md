# evergreen-api (Cloudflare Worker, free plan)

Two jobs: **admin sign-in** ("Sign in with GitHub" in `/admin`) and **visitors' stories** (testimonials).

## 1. Create the GitHub OAuth app (sign-in)
GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**
- Homepage URL: `https://dimogdor.github.io/Evergreen/`
- Authorization callback URL: `https://evergreen-api.<your-account>.workers.dev/callback`

Copy the **Client ID** and generate a **Client secret**.

## 2. Create the token used to save stories
GitHub → Settings → Developer settings → **Fine-grained tokens → Generate new token**
- Repository access: **only** `Dimogdor/Evergreen`
- Permissions: **Contents: Read and write**, **Issues: Read and write** (nothing else)

## 3. Deploy the worker
Recommended (also turns on the anti-flood limit of 3 stories per minute per visitor from `wrangler.toml`):
`npx wrangler deploy` in this folder, then `npx wrangler secret put GITHUB_CLIENT_ID` (same for the other secrets below).

Without a terminal: Cloudflare dashboard → **Workers & Pages → Create → Worker** → name it `evergreen-api` → Deploy →
**Edit code**, paste `index.js`, Deploy (no rate limit this way: turn on Turnstile below). Then **Settings → Variables and secrets**:

| Name | Type | Value |
|---|---|---|
| `GITHUB_CLIENT_ID` | Secret | from step 1 |
| `GITHUB_CLIENT_SECRET` | Secret | from step 1 |
| `GITHUB_TOKEN` | Secret | from step 2 |
| `REPO` | Text | `Dimogdor/Evergreen` |
| `BRANCH` | Text | `main` |
| `SITE_URL` | Text | `https://dimogdor.github.io/Evergreen` (or the final domain) |
| `ALLOWED_ORIGINS` | Text | `https://dimogdor.github.io` (comma-separated; add the final domain later) |
| `TURNSTILE_SECRET` | Secret | optional, see below |

## 4. Connect the site
In `/admin` → **Settings → Site & contact → Website API address**, paste `https://evergreen-api.<your-account>.workers.dev`,
and in `public/admin/config.yml` set `base_url:` to the same address (one-time edit on GitHub).

## Optional: Cloudflare Turnstile (stronger anti-spam)
Cloudflare → Turnstile → Add site (your domain). Put the **site key** in `/admin` → Settings → "Anti-spam site key"
and the **secret key** as the `TURNSTILE_SECRET` secret of the worker.

## How stories are moderated
A story is committed as `src/content/testimonials/<id>.yml` with `published: false` (+ the photo if any), and a GitHub
issue "New story from … — waiting for your approval" is opened: everyone watching the repository gets an e-mail.
Admins open `/admin` → **Stories**, read it, tick **Published** and save (or delete it). Unpublished stories never
appear on the site — but the repository is public, so a refused story should be deleted (it then stays only in the git history).

Tests: `npm test` (root of the repo).
