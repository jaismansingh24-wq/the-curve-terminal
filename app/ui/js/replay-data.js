/* Replay's bars: read from the reader's own export, kept on this computer.

   Reading a file:
     - each line is a bar: a date and time, then open, high, low, close and
       volume. MotiveWave's export ("20250101 000000,21219.75,...") is read
       as it is; so are dates written 2025-01-01 or 01/01/2025, a separate
       date and time column, and semicolons or tabs between fields. A first
       line of headings is skipped.
     - the times in a file are wall-clock times in some time zone, which the
       file does not say. CME's equity index futures stop every weekday at
       5:00 pm ET for an hour, so the zone is found by asking in which zone
       the file's daily break falls at 5:00 pm ET. The reader sees the
       result and can change it.
     - the same break says whether a bar's time is when it opened (the last
       bar before the break is 4:59 pm) or when it closed (5:00 pm). Bars
       are kept by the time they opened.
   Kept as: minutes since 1970 in UTC, and prices in whole ticks. */

import { invoke, invokeRaw, isNative } from '../shared/js/native.js';

export const LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const ET = 'America/New_York';
export const ZONES = [...new Map([
  [LOCAL, 'This computer\'s time zone (' + LOCAL + ')'],
  [ET, 'New York time (ET)'],
  ['America/Chicago', 'Chicago time (CT)'],
  ['Europe/London', 'London time'],
  ['UTC', 'UTC'],
]).entries()];

/* ------------------------------------------------------------ zones, fast */

const FMT = new Map();
function parts(zone, ms) {
  if (!FMT.has(zone)) FMT.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' }));
  const o = {};
  for (const p of FMT.get(zone).formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}
/* the zone's offset from UTC, in minutes, at a UTC minute; cached by the hour */
const OFF = new Map();
export function offset(zone, utcMin) {
  const hour = Math.floor(utcMin / 60);
  const key = zone + '|' + hour;
  let v = OFF.get(key);
  if (v === undefined) {
    const p = parts(zone, hour * 3600000);
    v = (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) / 60000) - hour * 60;
    OFF.set(key, v);
    if (OFF.size > 200000) OFF.clear();
  }
  return v;
}
/* a wall-clock minute in a zone (counted as if UTC) to a UTC minute */
export function wallToUtc(wall, zone) {
  let t = wall - offset(zone, wall);
  t = wall - offset(zone, t);
  return t;
}
/* a UTC minute as a wall-clock minute in New York */
export const toET = (utc) => utc + offset(ET, utc);

/* ------------------------------------------------------------ reading a file */

const pad = (n) => String(n).padStart(2, '0');
/* the wall-clock minute of a date-and-time field, or NaN */
function stamp(s) {
  let m = /^(\d{4})(\d{2})(\d{2})[ T](\d{2})(\d{2})(\d{2})?$/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(s);
  if (m) {
    let h = +m[4];
    if (m[7]) h = (h % 12) + (/pm/i.test(m[7]) ? 12 : 0);
    return Date.UTC(+m[3], +m[1] - 1, +m[2], h, +m[5]) / 60000;
  }
  return NaN;
}

/* text -> { wall, o, h, l, c, v } (arrays), or throws with a plain reason */
export function parse(text) {
  const n0 = (text.match(/\n/g) || []).length + 1;
  const wall = new Float64Array(n0), o = new Float64Array(n0), h = new Float64Array(n0), l = new Float64Array(n0), c = new Float64Array(n0), v = new Float64Array(n0);
  let n = 0, start = 0, delim = null, bad = 0, firstBad = '';
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    let line = text.slice(start, end);
    start = end + 1;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (!line.trim()) continue;
    if (!delim) delim = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
    const f = line.split(delim).map((x) => x.trim());
    if (!/^\d/.test(f[0])) continue; /* a line of headings */
    let t, k;
    if (f.length >= 7 && /^\d{1,2}:\d{2}/.test(f[1])) { t = stamp(f[0].replace(/\./g, '-') + ' ' + f[1]); k = 2; }
    else if (f.length >= 7 && /^\d{4,6}$/.test(f[1])) { t = stamp(f[0] + ' ' + f[1].padStart(6, '0')); k = 2; }
    else { t = stamp(f[0]); k = 1; }
    const nums = [f[k], f[k + 1], f[k + 2], f[k + 3], f[k + 4]].map(Number);
    if (!Number.isFinite(t) || nums.slice(0, 4).some((x) => !Number.isFinite(x))) { bad++; if (!firstBad) firstBad = line.slice(0, 80); continue; }
    wall[n] = t; o[n] = nums[0]; h[n] = nums[1]; l[n] = nums[2]; c[n] = nums[3]; v[n] = Number.isFinite(nums[4]) ? nums[4] : 0;
    n++;
  }
  if (!n) throw new Error('No bars could be read from this file. Each line should hold a date and time, then open, high, low, close and volume' + (firstBad ? '. The first line that could not be read was: ' + firstBad : '.'));
  const cut = (a) => a.slice(0, n);
  const out = { wall: cut(wall), o: cut(o), h: cut(h), l: cut(l), c: cut(c), v: cut(v), n, bad, firstBad };
  /* oldest first, one bar per minute */
  for (let i = 1; i < n; i++) if (out.wall[i] < out.wall[i - 1]) { sortBars(out); break; }
  return out;
}
function sortBars(d) {
  const idx = [...Array(d.n).keys()].sort((a, b) => d.wall[a] - d.wall[b]);
  for (const k of ['wall', 'o', 'h', 'l', 'c', 'v']) { const src = d[k].slice(); idx.forEach((j, i) => { d[k][i] = src[j]; }); }
}

/* the bar length in minutes: the commonest gap between bars */
export function barMinutes(wall) {
  const count = new Map();
  for (let i = 1; i < Math.min(wall.length, 20000); i++) { const d = wall[i] - wall[i - 1]; if (d > 0 && d <= 1440) count.set(d, (count.get(d) || 0) + 1); }
  let best = 1, most = 0;
  for (const [d, k] of count) if (k > most) { best = d; most = k; }
  return best;
}

/* Which zone puts the daily break at 5:00 pm ET? Returns every candidate's
   score, best first: { zone, label, hits, of, stamping: 'open' | 'close' }. */
export function detectZone(wall, base) {
  const gaps = [];
  for (let i = 0; i + 1 < wall.length; i++) {
    const d = wall[i + 1] - wall[i];
    if (d >= 45 && d <= 300) gaps.push(wall[i] + base);
  }
  const of = gaps.length;
  return ZONES.map(([zone, label]) => {
    let open = 0, close = 0;
    for (const g of gaps) {
      const et = toET(wallToUtc(g, zone));
      const mod = ((et % 1440) + 1440) % 1440;
      if (mod === 17 * 60) open++;
      else if (mod === 17 * 60 + base) close++;
    }
    return { zone, label, hits: Math.max(open, close), of, stamping: close > open ? 'close' : 'open' };
  }).sort((a, b) => b.hits - a.hits);
}

/* the arrays a replay runs on: UTC minutes when each bar opened, and ticks */
export function build(p, { zone, stamping, base, tick }) {
  const n = p.n;
  const t = new Int32Array(n), o = new Int32Array(n), h = new Int32Array(n), l = new Int32Array(n), c = new Int32Array(n), v = new Uint32Array(n);
  const shift = stamping === 'close' ? base : 0;
  let off = 0;
  const q = (x) => { const r = Math.round(x / tick); if (Math.abs(r * tick - x) > tick * 1e-6) off++; return r; };
  for (let i = 0; i < n; i++) {
    t[i] = wallToUtc(p.wall[i], zone) - shift;
    o[i] = q(p.o[i]); h[i] = q(p.h[i]); l[i] = q(p.l[i]); c[i] = q(p.c[i]);
    v[i] = Math.max(0, Math.min(4294967295, Math.round(p.v[i])));
    if (h[i] < Math.max(o[i], c[i])) h[i] = Math.max(o[i], c[i]);
    if (l[i] > Math.min(o[i], c[i])) l[i] = Math.min(o[i], c[i]);
  }
  if (off) throw new Error(off + ' prices in this file are not whole ticks of ' + tick + '. Check the instrument chosen for it.');
  return { n, t, o, h, l, c, v, base, tick };
}

/* ------------------------------------------------------------ the compact copy */

export function encode(d) {
  const buf = new ArrayBuffer(24 + d.n * 24);
  const dv = new DataView(buf);
  [0x43, 0x54, 0x52, 0x50].forEach((b, i) => dv.setUint8(i, b)); /* "CTRP" */
  dv.setUint32(4, 1, true);
  dv.setUint32(8, d.n, true);
  dv.setUint32(12, d.base, true);
  dv.setFloat64(16, d.tick, true);
  let at = 24;
  for (const k of ['t', 'o', 'h', 'l', 'c', 'v']) { new Uint8Array(buf, at, d.n * 4).set(new Uint8Array(d[k].buffer, d[k].byteOffset, d.n * 4)); at += d.n * 4; }
  return buf;
}
export function decode(buf) {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'CTRP') throw new Error('This replay file is not one the app made.');
  const n = dv.getUint32(8, true), base = dv.getUint32(12, true), tick = dv.getFloat64(16, true);
  const at = (k) => 24 + k * n * 4;
  return { n, base, tick, t: new Int32Array(buf, at(0), n), o: new Int32Array(buf, at(1), n), h: new Int32Array(buf, at(2), n), l: new Int32Array(buf, at(3), n), c: new Int32Array(buf, at(4), n), v: new Uint32Array(buf, at(5), n) };
}

/* ------------------------------------------------------------ the files the reader has loaded */

let index = [];
const memory = new Map(); /* the design preview keeps bars in memory only */
export async function loadIndex() {
  if (!isNative) return index;
  const text = await invoke('replay_read_json', { name: 'index' });
  try { index = text ? JSON.parse(text).files || [] : []; } catch (e) { index = []; }
  return index;
}
export const files = () => index.slice().sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''));
async function saveIndex() {
  if (isNative) await invoke('replay_write_json', { name: 'index', json: JSON.stringify({ files: index }, null, 1) });
}
export async function keep(meta, data) {
  const id = crypto.randomUUID();
  if (isNative) await invokeRaw('replay_save_bin', encode(data), { 'x-replay-id': id });
  else memory.set(id, data);
  index.push({ ...meta, id, n: data.n, first: data.t[0], last: data.t[data.n - 1], importedAt: new Date().toISOString() });
  await saveIndex();
  return id;
}
export async function open(id) {
  if (memory.has(id)) return memory.get(id);
  const buf = await invoke('replay_load_bin', { id });
  return decode(buf instanceof ArrayBuffer ? buf : new Uint8Array(buf).buffer);
}
export async function forget(id) {
  index = index.filter((f) => f.id !== id);
  memory.delete(id);
  if (isNative) await invoke('replay_delete', { id });
  await saveIndex();
}

/* ------------------------------------------------------------ bars of a longer timeframe */

/* the trading day (CME, 6:00 pm ET) a UTC minute belongs to, as a day number */
export function tradingDayNo(utc) {
  const et = toET(utc);
  let day = Math.floor(et / 1440);
  if (et - day * 1440 >= 18 * 60) day++;
  const wd = new Date(day * 864e5).getUTCDay();
  if (wd === 6) day += 2; else if (wd === 0) day += 1;
  return day;
}

/* Bars of tf minutes (or 'D' for the CME trading day) built from the base
   bars: full arrays, with the base-bar range each one covers, so a replay can
   show the last one still forming. */
export function aggregate(d, tf) {
  if (tf === d.base) {
    const idx = new Int32Array(d.n).map((_, i) => i);
    return { ...d, from: idx, to: idx, of: idx };
  }
  const key = tf === 'D' ? (i) => tradingDayNo(d.t[i])
    : tf >= 240 ? (i) => Math.floor((toET(d.t[i]) - 18 * 60) / tf)
      : (i) => Math.floor(d.t[i] / tf);
  const n = d.n;
  const t = new Int32Array(n), o = new Int32Array(n), h = new Int32Array(n), l = new Int32Array(n), c = new Int32Array(n), v = new Uint32Array(n), from = new Int32Array(n), to = new Int32Array(n), of = new Int32Array(n);
  let m = -1, last = null;
  for (let i = 0; i < n; i++) {
    const k = key(i);
    if (k !== last) { m++; last = k; t[m] = d.t[i]; o[m] = d.o[i]; h[m] = d.h[i]; l[m] = d.l[i]; v[m] = 0; from[m] = i; }
    if (d.h[i] > h[m]) h[m] = d.h[i];
    if (d.l[i] < l[m]) l[m] = d.l[i];
    c[m] = d.c[i]; v[m] += d.v[i]; to[m] = i; of[i] = m;
  }
  m++;
  return { n: m, base: d.base, tick: d.tick, t: t.subarray(0, m), o: o.subarray(0, m), h: h.subarray(0, m), l: l.subarray(0, m), c: c.subarray(0, m), v: v.subarray(0, m), from: from.subarray(0, m), to: to.subarray(0, m), of };
}

/* the first base bar at or after a UTC minute */
export function indexAt(d, utc) {
  let lo = 0, hi = d.n - 1;
  if (utc <= d.t[0]) return 0;
  if (utc > d.t[hi]) return hi;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (d.t[mid] < utc) lo = mid + 1; else hi = mid; }
  return lo;
}

export { pad };
