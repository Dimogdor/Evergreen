// Builds the admin panel configuration in the admin's language (see src/admin/config.yml for the source).
import fs from 'node:fs';
import { parse, stringify } from 'yaml';

export const ADMIN_LANGS = ['el', 'en', 'fr'] as const;
export type AdminLang = (typeof ADMIN_LANGS)[number];
const TEXT_KEYS = new Set(['label', 'label_singular', 'hint', 'description']);
const read = (p: string) => parse(fs.readFileSync(p, 'utf8')) ?? {};

export function adminConfig(lang: AdminLang, siteUrl: string) {
  const cfg = read('src/admin/config.yml');
  const labels: Record<string, Partial<Record<AdminLang, string>>> = read('src/admin/labels.yml');
  const ui: Record<string, Record<string, string>> = read('src/content/settings/ui.yml');
  const tr = (s: string) => labels[s]?.[lang] || s;

  const walk = (o: any): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    // The admin only has to fill in their own language; the others are translated when they save.
    if (o.widget && o.i18n === true && o.required !== false && !Array.isArray(o.required)) o.required = [lang];
    for (const [k, v] of Object.entries(o)) {
      if (TEXT_KEYS.has(k) && typeof v === 'string') o[k] = tr(v);
      else if (k === 'pattern' && Array.isArray(v)) o[k] = [v[0], tr(v[1])];
      else walk(v);
    }
  };
  walk(cfg.collections);

  // Fields that are the same in every language (dates, photos, links…) are shown and editable in every language too,
  // so the admin finds everything in their own column.
  const shared = (fields: any[] = []) => fields.forEach((f) => { if (f.i18n === undefined) f.i18n = 'duplicate'; });
  for (const c of cfg.collections) if (c.i18n) { shared(c.fields); for (const f of c.files ?? []) shared(f.fields); }

  // One field per small text of the website, labelled with the text itself in the admin's language.
  const uiFile = cfg.collections.find((c: any) => c.name === 'settings').files.find((f: any) => f.name === 'ui');
  uiFile.fields = Object.keys(ui.en).map((name) => {
    const text = ui[lang]?.[name] || ui.en[name];
    return { name, label: text.length > 70 ? `${text.slice(0, 70)}…` : text, widget: text.length > 60 ? 'text' : 'string', i18n: true, required: [lang] };
  });

  // The admin's language is the panel's main language: its column holds every field.
  cfg.i18n.default_locale = lang;
  Object.assign(cfg, { site_url: siteUrl, display_url: siteUrl });
  return stringify(cfg, { aliasDuplicateObjects: false, lineWidth: 0 });
}
