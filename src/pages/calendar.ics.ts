// Subscribable feed of all dates (webcal://…/calendar.ics) — calendars refresh it automatically.
import type { APIRoute } from 'astro';
import { events, toCal } from '../lib';
import { ics } from '../calendar';

export const GET: APIRoute = async ({ site }) =>
  new Response(ics((await events('en')).map((e) => toCal(e, site!)), 'The Evergreen Project'), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
