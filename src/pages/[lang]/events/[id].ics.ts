// One .ics file per event and language (Apple Calendar, Outlook, Thunderbird…).
import type { APIRoute } from 'astro';
import { events, toCal } from '../../../lib';
import { ics } from '../../../calendar';
import { locales } from '../../../i18n';

export async function getStaticPaths() {
  return (await Promise.all(locales.map(async (lang) => (await events(lang)).map((e) => ({ params: { lang, id: e.id }, props: { e, lang } }))))).flat();
}

export const GET: APIRoute = ({ props, site }) =>
  new Response(ics([toCal(props.e, site!, props.lang)], 'The Evergreen Project'), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
