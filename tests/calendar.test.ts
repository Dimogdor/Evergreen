// Run: npm test — checks the time-zone conversion and the .ics output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { athensToUtc, span, ics, googleUrl } from '../src/calendar.ts';

test('Athens time → UTC across summer and winter time', () => {
  assert.equal(athensToUtc('2026-07-17', '10:00').toISOString(), '2026-07-17T07:00:00.000Z'); // UTC+3
  assert.equal(athensToUtc('2026-12-01', '10:00').toISOString(), '2026-12-01T08:00:00.000Z'); // UTC+2
  assert.equal(athensToUtc('2026-10-25', '12:00').toISOString(), '2026-10-25T10:00:00.000Z'); // DST ended 04:00 that day
  assert.equal(athensToUtc('2026-03-29', '00:30').toISOString(), '2026-03-28T22:30:00.000Z'); // before the spring jump
});

test('all-day events use an exclusive end date', () => {
  assert.deepEqual(span({ id: 'a', title: 't', url: 'u', start: '2026-10-15', end: '2026-11-08' }), { allDay: true, from: '20261015', to: '20261109' });
  assert.deepEqual(span({ id: 'b', title: 't', url: 'u', start: '2026-12-31' }), { allDay: true, from: '20261231', to: '20270101' });
});

test('timed events and calendar output', () => {
  const e = { id: 'x', title: 'Yoga, tea; and more', url: 'https://example.org/e', start: '2026-11-28', end: '2026-12-05', startTime: '17:00', endTime: '12:00' };
  assert.deepEqual(span(e), { allDay: false, from: '20261128T150000Z', to: '20261205T100000Z' });
  const out = ics([e], 'Evergreen');
  assert.ok(out.includes('SUMMARY:Yoga\\, tea\\; and more\r\n'));
  assert.match(out, /DTSTART:20261128T150000Z/);
  assert.ok(out.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
  assert.match(googleUrl(e), /dates=20261128T150000Z%2F20261205T100000Z/);
});
