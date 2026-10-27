import fs from 'node:fs';
import { parse } from 'yaml';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const locales = ['el', 'en', 'fr', 'es', 'it', 'ru', 'de', 'pt'];

// The stories form posts to the Cloudflare Worker set in /admin → Settings ("Website API address").
const settings = parse(fs.readFileSync('src/content/settings/site.yml', 'utf8')).el ?? {};
const origin = (u) => { try { return new URL(u).origin; } catch { return ''; } };
const api = origin(settings.apiUrl);

export default defineConfig({
  // Set by the deploy workflow (GitHub Pages: SITE_URL=https://dimogdor.github.io, BASE_PATH=/Evergreen).
  site: process.env.SITE_URL || 'https://dimogdor.github.io',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  markdown: { syntaxHighlight: false },
  integrations: [
    sitemap({
      // Not the admin, nor the address without language (it only sends visitors to their language).
      filter: (page) => !page.includes('/admin/') && new URL(page).pathname !== (process.env.BASE_PATH || '/').replace(/\/?$/, '/'),
      i18n: { defaultLocale: 'el', locales: Object.fromEntries(locales.map((l) => [l, l])) },
    }),
  ],
  // Content-Security-Policy (as a <meta> tag, works on any host): every inline script/style is hashed at build time.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://i.ytimg.com",
        "media-src 'self'",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.openstreetmap.org https://challenges.cloudflare.com",
        `form-action 'self' https://api.web3forms.com${api ? ' ' + api : ''}`,
        "base-uri 'self'",
        "object-src 'none'",
      ],
      scriptDirective: { resources: ["'self'", 'https://challenges.cloudflare.com'] },
      styleDirective: { resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }] },
    },
  },
});
