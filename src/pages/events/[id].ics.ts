// One .ics file per event (Apple Calendar, Outlook, Thunderbird…).
import type { APIRoute } from 'astro';
import { events, toCal } from '../../lib';
import { ics } from '../../calendar';

export async function getStaticPaths() {
  return (await events('en')).map((e) => ({ params: { id: e.id }, props: { e } }));
}

export const GET: APIRoute = ({ props, site }) =>
  new Response(ics([toCal(props.e, site!)], 'The Evergreen Project'), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
