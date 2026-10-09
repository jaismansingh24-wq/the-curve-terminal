/* Time for the journal. Every trade is stored in UTC and shown in New York
   time first, with the reader's own in brackets. A time typed in any zone
   (ET, CT, London, the reader's own...) is converted exactly, daylight
   saving included, using the zone rules built into Windows.

   Trading days: CME Globex runs Sunday to Friday, 6:00 pm to 5:00 pm ET,
   with an hour's maintenance break from 5:00 pm (CME Group's contract
   specifications, checked 9 October 2026). So by default a trade closed at
   7:00 pm ET on Tuesday belongs to Wednesday's trading day. The boundary is
   a setting, because moving it changes every daily figure. */

export const ET = 'America/New_York';
export const LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/* the zones offered when typing a time, ET first */
export function zoneChoices() {
  const base = [
    { id: ET, label: 'New York (ET)' },
    { id: 'America/Chicago', label: 'Chicago (CT)' },
    { id: 'Europe/London', label: 'London' },
    { id: 'UTC', label: 'UTC' },
  ];
  if (!base.some((z) => z.id === LOCAL)) base.splice(1, 0, { id: LOCAL, label: 'Your time (' + LOCAL.replace(/_/g, ' ') + ')' });
  return base;
}

const PARTS = new Map();
function partsIn(zone, ms) {
  if (!PARTS.has(zone)) {
    PARTS.set(zone, new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }));
  }
  const o = {};
  for (const p of PARTS.get(zone).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: o.weekday };
}

/* the zone's offset from UTC at an instant, in ms */
function offsetAt(zone, ms) {
  const p = partsIn(zone, ms);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/* "2026-10-09T09:41" read as a wall-clock time in `zone` -> UTC ms */
export function wallToUtc(value, zone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value || '');
  if (!m) return NaN;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  let t = wall - offsetAt(zone, wall);
  t = wall - offsetAt(zone, t); /* a second pass settles daylight saving edges */
  return t;
}

/* UTC ms -> "2026-10-09T09:41" in `zone`, for a datetime-local input */
export function utcToWall(ms, zone) {
  if (!Number.isFinite(ms)) return '';
  const p = partsIn(zone, ms);
  const z = (n) => String(n).padStart(2, '0');
  return p.y + '-' + z(p.mo) + '-' + z(p.d) + 'T' + z(p.h) + ':' + z(p.mi);
}

const HM = new Map();
function hm(zone, ms) {
  if (!HM.has(zone)) HM.set(zone, new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }));
  return HM.get(zone).format(new Date(ms)).replace(/\s?(am|pm)$/i, (x, p) => ' ' + p.toLowerCase());
}
const DAY = new Map();
function day(zone, ms, opts) {
  const k = zone + JSON.stringify(opts);
  if (!DAY.has(k)) DAY.set(k, new Intl.DateTimeFormat('en-GB', { timeZone: zone, ...opts }));
  return DAY.get(k).format(new Date(ms));
}

/* "9:41 am ET" */
export function timeET(ms) { return hm(ET, ms) + ' ET'; }

/* "9:41 am ET (7:11 pm your time)", naming the day when the two differ */
export function timeBoth(ms) {
  const et = hm(ET, ms), lo = hm(LOCAL, ms);
  if (LOCAL === ET) return et + ' ET';
  const sameDay = day(ET, ms, { day: 'numeric' }) === day(LOCAL, ms, { day: 'numeric' });
  return et + ' ET (' + lo + (sameDay ? '' : ' ' + day(LOCAL, ms, { weekday: 'long' })) + ' your time)';
}

/* "Fri 9 Oct" and "Friday 9 October 2026", in New York */
export function shortDateET(ms) {
  return day(ET, ms, { weekday: 'short' }) + ' ' + day(ET, ms, { day: 'numeric' }) + ' ' + day(ET, ms, { month: 'short' });
}
export function longDateET(ms) {
  return day(ET, ms, { weekday: 'long' }) + ' ' + day(ET, ms, { day: 'numeric' }) + ' ' + day(ET, ms, { month: 'long' }) + ' ' + day(ET, ms, { year: 'numeric' });
}

/* "12 min", "1 h 05 min", "2 days 3 h" */
export function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.round(ms / 60000);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return h + ' h ' + String(r).padStart(2, '0') + ' min';
  return Math.floor(h / 24) + ' days ' + (h % 24) + ' h';
}

/* ------------------------------------------------------------ trading days */

/* The trading day a moment belongs to, as "2026-10-09". `startHour` is the
   ET hour the trading day begins: 18 for CME Globex, 0 for midnight. */
export function tradingDay(ms, startHour = 18) {
  const p = partsIn(ET, ms);
  let d = Date.UTC(p.y, p.mo - 1, p.d);
  if (startHour > 0 && p.h >= startHour) d += 864e5;
  return new Date(d).toISOString().slice(0, 10);
}

/* Monday of the trading day's week, as "2026-10-05" */
export function weekOf(dayKey) {
  const d = new Date(dayKey + 'T00:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - wd * 864e5).toISOString().slice(0, 10);
}

export const monthOf = (dayKey) => dayKey.slice(0, 7);

/* plain words for the boundary, shown next to every daily figure */
export function boundaryText(startHour) {
  return startHour === 18
    ? 'Days run 6:00 pm to 5:00 pm ET, the CME Globex trading day.'
    : 'Days run midnight to midnight ET.';
}
