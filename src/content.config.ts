import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// ponytail: no zod schemas on purpose — the CMS writes these files and a strict schema
// would turn an empty field into a failed deploy. Normalisation lives in src/i18n.ts.
const yml = (dir: string) => defineCollection({ loader: glob({ pattern: '*.yml', base: `./src/content/${dir}` }) });

export const collections = {
  settings: yml('settings'),
  pages: yml('pages'),
  programs: yml('programs'),
  events: yml('events'),
  inhabitants: yml('inhabitants'),
  albums: yml('albums'),
};
