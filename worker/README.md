# evergreen-api (Cloudflare Worker, free plan)

One worker so that **Katerina, Kostas and the other admins never need a GitHub account**:

- **Admin sign-in with e-mail + password** (the admin panel's sign-in button opens a small login window).
- **Storage relay**: the admin panel saves through the worker, which holds the only key to the content repository.
- **Visitors' stories**: saved unpublished, the team is notified, an admin ticks “Published”.
- **Writing help** (optional, `ANTHROPIC_API_KEY`): a “✓ Correct” button next to the text being edited proposes a corrected
  version, and every save translates the new or changed texts from the admin's language (Greek, English or French) into the 7 others.

## 1. Create the key to the content repository (once)
GitHub → Settings → Developer settings → **Fine-grained tokens → Generate new token**
- Repository access: **only** `Dimogdor/Evergreen` · Expiration: **No expiration** (offered for personal accounts; otherwise the longest allowed — the admin panel warns 30 days before)
- Permissions: **Contents: Read and write**, **Issues: Read and write** (nothing else)

## 2. Deploy the worker
Recommended (also turns on the limit of 3 attempts per minute per visitor, for logins and stories):
```bash
cd worker
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN    # from step 1
npx wrangler secret put SESSION_KEY     # any long random text, e.g. from: openssl rand -base64 32
npx wrangler secret put ADMINS          # katerina@mail.gr=a-good-password;kostas@mail.gr=another-password
npx wrangler secret put ANTHROPIC_API_KEY  # optional: proofreading + automatic translation (key from platform.claude.com, set a monthly limit there)
npx wrangler secret put DEPLOY_HOOK        # once the site is on Cloudflare Pages: its deploy hook, for the nightly rebuild
```
(Run `npm install` once at the root of the repository first: the worker uses the `yaml` and `@anthropic-ai/sdk` packages.)
The worker needs the terminal deploy above (it bundles two packages); pasting `index.js` in the Cloudflare dashboard no longer works.

**Add / remove an admin or change a password:** edit the `ADMINS` secret (one `email=password` per admin, separated by `;`).
Removing someone signs them out immediately. Sessions last 30 days.

## 3. Connect the admin panel and the site
- `/admin` → **Settings → Site, contact & bank → Website API address**: the worker address. This one setting turns on the
  admins' e-mail sign-in (the build writes it into the admin configuration, see `src/admin/config.ts`) and the stories form.
- `ALLOWED_ORIGINS` in `wrangler.toml`: every address the site is served from (add the own domain when there is one).

## 4. Notifications for new stories
- With the site's own domain on Cloudflare: turn on **Email Routing**, verify `evergreenecovillage@gmail.com` as a destination,
  then uncomment the `send_email` block in `wrangler.toml` (and set `MAIL_FROM` / `MAIL_TO`) → a plain e-mail for each story.
- Until then, each story opens an issue in the repository (an e-mail goes to whoever watches it — e.g. the developer).
- The admins can always open `/admin` → **Stories → ⏳ Waiting for approval**.

## Writing help: how it behaves
- **Translation on save**: for each content file saved, texts that are new or changed in the admin's language (sent by the admin
  panel as `X-Evergreen-Lang`: el, en or fr) are translated into the 7 other languages in the same save. A language the admin edited by hand in that save is never overwritten,
  internal links follow the language (`/el/…` → `/fr/…`), names, prices, dates and formatting are kept. The admin panel
  then shows “Translated into 7 languages” and refreshes. If the translation service fails, the save goes through untranslated and the admin sees a notice.
- **Key expiry**: when the content-repository key expires in less than 30 days, the admins see a warning at each save.
- **Correction**: the “✓ Correct” button sends the text of the focused field and shows the corrections; nothing changes until
  the admin clicks “Apply”. For rich text with bold or links, the corrected text is copied instead, so no formatting is lost.
- Model: `claude-opus-5-5` (change with the `AI_MODEL` variable). Cost: roughly a few cents per saved page.

## Optional: Cloudflare Turnstile (stronger anti-spam)
Cloudflare → Turnstile → Add site. **Site key** → `/admin` → Settings → “Anti-spam site key”; **secret key** → `TURNSTILE_SECRET`.

## Leaving GitHub completely (later)
The content is plain YAML files and photos; GitHub is only the storage behind the worker.
- **Hosting**: Cloudflare Pages (see the main README) — the repository can then be made private.
- **Storage elsewhere** (GitLab, Forgejo/Codeberg…): change `backend` in `src/admin/config.yml` (Sveltia supports `gitlab`
  and `gitea`), and the two GitHub functions at the bottom of `index.js` (`gh`, `commit`) plus the relay target.

Tests: `npm test` (root of the repository).
