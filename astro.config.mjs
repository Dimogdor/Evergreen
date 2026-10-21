import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const locales = ['el', 'en', 'fr', 'es', 'it', 'ru', 'de', 'pt'];

export default defineConfig({
  // Change via the SITE_URL env var (or here) once the final domain is known.
  site: process.env.SITE_URL || 'https://evergreen-project.pages.dev',
  base: process.env.BASE_PATH || '/', // e.g. /Evergreen for GitHub Pages
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin/'),
      i18n: { defaultLocale: 'el', locales: Object.fromEntries(locales.map((l) => [l, l])) },
    }),
  ],
});
