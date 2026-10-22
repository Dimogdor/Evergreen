import fs from 'node:fs';
import { parse } from 'yaml';

export const locales = ['el', 'en', 'fr', 'es', 'it', 'ru', 'de', 'pt'] as const;
export type Lang = (typeof locales)[number];
export const defaultLang: Lang = 'el';

export const localeNames: Record<Lang, string> = {
  el: 'Ελληνικά', en: 'English', fr: 'Français', es: 'Español',
  it: 'Italiano', ru: 'Русский', de: 'Deutsch', pt: 'Português',
};

// Interface texts (menus, buttons, labels) are edited in /admin → Settings → Interface texts.
// Read at build time; a missing translation falls back to English, then Greek.
const ui: Record<string, Record<string, string>> = parse(fs.readFileSync('src/content/settings/ui.yml', 'utf8'));
export const t = (lang: Lang) => (key: string): string => ui[lang]?.[key] || ui.en?.[key] || ui.el?.[key] || key;
