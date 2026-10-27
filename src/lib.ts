import fs from 'node:fs';
import { parse } from 'yaml';
import { getCollection } from 'astro:content';
import type { ImageMetadata } from 'astro';
import { marked } from 'marked';
import { locales, type Lang } from './i18n';
import { fmtTime, ymd, type CalEvent } from './calendar';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && Object.getPrototypeOf(v) === Object.prototype;
const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

// Deep merge that skips empty values, so an untranslated field falls back to the base language.
function merge(base: any, over: any): any {
  if (empty(over)) return base;
  if (Array.isArray(base) && Array.isArray(over))
    return Array.from({ length: Math.max(base.length, over.length) }, (_, i) => merge(base[i], over[i]));
  if (isObj(base) && isObj(over)) {
    const out: Record<string, unknown> = { ...base };
    for (const k in over) out[k] = merge(base[k], over[k]);
    return out;
  }
  return over;
}

// CMS files store every language under its code (el:, en:, …). Fallback order: lang → English → Greek → any other
// language, so a text written in one language only still shows everywhere. Single-language collections
// (testimonials) have no language keys and are returned as is.
export const localize = (data: any, lang: Lang) =>
  data && locales.some((l) => data[l])
    ? [...locales.filter((l) => !['el', 'en', lang].includes(l)), 'el', 'en', lang].reduce((acc, l) => merge(acc, data[l]), {})
    : data;

export async function list(name: string, lang: Lang): Promise<any[]> {
  // Collections that start empty (stories, extra pages) are skipped instead of logging a warning on every page.
  if (!fs.readdirSync(`src/content/${name}`).some((f) => f.endsWith('.yml'))) return [];
  const entries = await getCollection(name as any);
  return entries.map((e: any) => ({ id: e.id, ...localize(e.data, lang) }));
}
export const one = async (name: string, id: string, lang: Lang) =>
  (await list(name, lang)).find((e) => e.id === id) ?? {};

// Visitors' stories: only those an admin has ticked "Published", newest first.
export async function stories() {
  return (await list('testimonials', 'en')).filter((s) => s.published && s.quote).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function events(lang: Lang) {
  return (await list('events', lang))
    .filter((e) => e.start && !e.draft)
    .map((e) => ({ ...e, startDay: ymd(e.start), endDay: ymd(e.end || e.start), start: new Date(ymd(e.start)), end: new Date(ymd(e.end || e.start)) }))
    .sort((a, b) => +a.start - +b.start);
}

// Uploaded images are referenced by path in the CMS; resolve them by file name so Astro can optimise them.
const files = import.meta.glob<{ default: ImageMetadata }>('/src/assets/uploads/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP}', { eager: true });
const byName = Object.fromEntries(Object.entries(files).map(([k, v]) => [k.split('/').pop()!.toLowerCase(), v.default]));
export const img = (path?: string): ImageMetadata | undefined => (path ? byName[path.split('/').pop()!.toLowerCase()] : undefined);

// Site prefix when hosted in a sub-folder (GitHub Pages: /Evergreen), '' otherwise.
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');

// Internal links written in the CMS (/en/contact/) get the prefix too.
export const md = (s?: string) => (s ? (marked.parse(s, { async: false }) as string).replaceAll('href="/', `href="${base}/`) : '');

// JSON for <script type="application/ld+json">, safe against "</script>" in CMS text.
export const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');

export const href = (lang: Lang, path = '') => `${base}/${lang}/${path ? path.replace(/^\/|\/?$/g, '') + '/' : ''}`;

export const dateRange = (start: Date, end: Date, lang: Lang) =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatRange(start, end);

export function videoEmbed(url = '') {
  const yt = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1];
  if (yt) return { src: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`, thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
  if (vimeo) return { src: `https://player.vimeo.com/video/${vimeo}?autoplay=1&dnt=1`, thumb: '' };
  return undefined;
}

// Settings read directly, for code that runs outside pages (calendar files).
const siteFile = parse(fs.readFileSync('src/content/settings/site.yml', 'utf8'));

// Event → calendar entry ("Add to calendar" links and .ics files).
export const toCal = (e: any, site: URL, lang: Lang = 'en'): CalEvent => ({
  id: e.id, title: e.title, summary: e.summary, location: e.location || localize(siteFile, lang).address || 'The Evergreen Project',
  url: new URL(href(lang, 'calendar') + '#' + e.id, site).href,
  start: e.startDay, end: e.endDay, startTime: fmtTime(e.startTime), endTime: fmtTime(e.endTime),
});
