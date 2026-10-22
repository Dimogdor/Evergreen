// "Add to calendar" helpers. Event dates/times are entered in Greek local time (Europe/Athens)
// and converted to UTC here, so every visitor's calendar shows them in their own time zone.

export const TZ = 'Europe/Athens';

export type CalEvent = {
  id: string; title: string; summary?: string; location?: string; url: string;
  start: string; end?: string; startTime?: string; endTime?: string; // YYYY-MM-DD, HH:mm
};

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d ?? '')).slice(0, 10);

// Athens wall-clock time → UTC Date (handles summer/winter time).
export function athensToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const offset = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(t).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
  };
  const guess = wall - offset(wall);
  return new Date(wall - offset(guess));
}

const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261015T070000Z

// Returns [start, end] as calendar strings: all-day (YYYYMMDD, end exclusive) or UTC date-times.
export function span(e: CalEvent): { allDay: boolean; from: string; to: string } {
  const end = e.end || e.start;
  if (!e.startTime) return { allDay: true, from: e.start.replace(/-/g, ''), to: addDays(end, 1).replace(/-/g, '') };
  const from = athensToUtc(e.start, e.startTime);
  let to = athensToUtc(end, e.endTime || e.startTime);
  if (+to <= +from) to = new Date(+from + 2 * 3600e3);
  return { allDay: false, from: stamp(from), to: stamp(to) };
}

export function googleUrl(e: CalEvent) {
  const s = span(e);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${s.from}/${s.to}`, details: `${e.summary ?? ''}\n\n${e.url}`.trim(), location: e.location ?? '', ctz: TZ });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// RFC 5545: escape text and fold lines at 75 octets.
const esc = (s = '') => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = []; let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function ics(events: CalEvent[], name: string, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Evergreen Project//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`, `X-WR-TIMEZONE:${TZ}`];
  for (const e of events) {
    const s = span(e);
    lines.push('BEGIN:VEVENT', `UID:${e.id}@evergreenproject`, `DTSTAMP:${stamp(now)}`,
      s.allDay ? `DTSTART;VALUE=DATE:${s.from}` : `DTSTART:${s.from}`,
      s.allDay ? `DTEND;VALUE=DATE:${s.to}` : `DTEND:${s.to}`,
      `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(`${e.summary ?? ''}\n\n${e.url}`.trim())}`, `LOCATION:${esc(e.location)}`, `URL:${e.url}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export const fmtTime = (t?: string) => (t && /^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, '0') : '');
