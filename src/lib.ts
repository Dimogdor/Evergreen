import { getCollection } from 'astro:content';
import type { ImageMetadata } from 'astro';
import { marked } from 'marked';
import type { Lang } from './i18n';

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

// CMS files store every language under its code (el:, en:, …). Fallback order: lang → English → Greek.
export const localize = (data: any, lang: Lang) => merge(merge(data?.el ?? {}, data?.en), data?.[lang]);

export async function list(name: string, lang: Lang): Promise<any[]> {
  const entries = await getCollection(name as any);
  return entries.map((e: any) => ({ id: e.id, ...localize(e.data, lang) }));
}
export const one = async (name: string, id: string, lang: Lang) =>
  (await list(name, lang)).find((e) => e.id === id) ?? {};

export async function events(lang: Lang) {
  return (await list('events', lang))
    .filter((e) => e.start && !e.draft)
    .map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end || e.start) }))
    .sort((a, b) => +a.start - +b.start);
}

// Uploaded images are referenced by path in the CMS; resolve them by file name so Astro can optimise them.
const files = import.meta.glob<{ default: ImageMetadata }>('/src/assets/uploads/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP}', { eager: true });
const byName = Object.fromEntries(Object.entries(files).map(([k, v]) => [k.split('/').pop()!.toLowerCase(), v.default]));
export const img = (path?: string): ImageMetadata | undefined => (path ? byName[path.split('/').pop()!.toLowerCase()] : undefined);

export const md = (s?: string) => (s ? (marked.parse(s, { async: false }) as string) : '');

export const href = (lang: Lang, path = '') => `/${lang}/${path ? path.replace(/^\/|\/?$/g, '') + '/' : ''}`;

export const dateRange = (start: Date, end: Date, lang: Lang) =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatRange(start, end);

export function videoEmbed(url = '') {
  const yt = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1];
  if (yt) return { src: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`, thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
  if (vimeo) return { src: `https://player.vimeo.com/video/${vimeo}?autoplay=1&dnt=1`, thumb: '' };
  return undefined;
}
