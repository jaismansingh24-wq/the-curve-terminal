/* Replay's data: read from the reader's own exports, kept on this computer.

   Two kinds of file:
     bars    each line a date and time, then open, high, low, close and
             volume (MotiveWave's bar export, and common variants);
     trades  each line a date and time, then price, bid, ask and size
             (MotiveWave's tick export). A trade at or above the ask is
             counted as a buy, at or below the bid as a sell. That is an
             inference from the quote beside each trade, not something the
             exchange reports, and the pages say so.
   The times in a file are wall-clock times in a zone the file does not
   name. CME's equity index futures stop every weekday at 5:00 pm ET for an
   hour, so the zone is the one that puts the file's daily break there; the
   reader sees the result and can change it.

   Kept as: UTC (minutes for bars, seconds for trades) and prices in whole
   ticks, in a compact binary copy in the app's folder. Trade files can be
   joined: exports of the latest N trades overlap, so a later export takes
   over from its first second onwards. */

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
  if (!FMT.has(zone)) FMT.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }));
  const o = {};
  for (const p of FMT.get(zone).formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}
/* the zone's offset from UTC in minutes, at a UTC minute; cached by the hour */
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

/* the wall-clock second of a date-and-time text, or NaN */
function stampSec(s) {
  let m = /^(\d{4})(\d{2})(\d{2})[ T](\d{2})(\d{2})(\d{2})?$/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1000;
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1000;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(s);
  if (m) {
    let h = +m[4];
    if (m[7]) h = (h % 12) + (/pm/i.test(m[7]) ? 12 : 0);
    return Date.UTC(+m[3], +m[1] - 1, +m[2], h, +m[5], +(m[6] || 0)) / 1000;
  }
  return NaN;
}
const joined = (f) => /^\d{8}\s\d{4,6}$/.test(f) || /[ T]\d{1,2}:\d{2}/.test(f);
/* how many leading fields hold the date and time */
function dateFields(f) {
  if (joined(f[0])) return 1;
  if (f.length > 1 && (/^\d{1,2}:\d{2}/.test(f[1]) || (/^\d{4,6}$/.test(f[1]) && /^\d{8}$|^\d{4}[-.]\d{2}[-.]\d{2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/.test(f[0])))) return 2;
  return 1;
}
function lines(text, each) {
  let start = 0, delim = null;
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
    if (each(f, line) === false) break;
  }
}

/* 'bars' or 'trades', from the first lines */
export function kindOf(text) {
  let kind = 'bars';
  lines(text.slice(0, 20000), (f) => {
    const k = dateFields(f);
    kind = f.length - k === 4 ? 'trades' : 'bars';
    return false;
  });
  return kind;
}

/* text -> wall-clock seconds and the numbers after them, or throws */
function parseRows(text, cols, what) {
  const n0 = (text.match(/\n/g) || []).length + 1;
  const wall = new Float64Array(n0);
  const out = Array.from({ length: cols }, () => new Float64Array(n0));
  let n = 0, bad = 0, firstBad = '';
  lines(text, (f, line) => {
    const k = dateFields(f);
    const t = k === 2 ? stampSec(f[0].replace(/\./g, '-') + ' ' + (/^\d{4,6}$/.test(f[1]) ? f[1].padStart(6, '0') : f[1])) : stampSec(f[0]);
    const nums = [];
    for (let j = 0; j < cols; j++) nums.push(Number(f[k + j]));
    if (!Number.isFinite(t) || nums.slice(0, cols - 1).some((x) => !Number.isFinite(x))) { bad++; if (!firstBad) firstBad = line.slice(0, 80); return; }
    wall[n] = t;
    for (let j = 0; j < cols; j++) out[j][n] = Number.isFinite(nums[j]) ? nums[j] : 0;
    n++;
  });
  if (!n) throw new Error('No ' + what + ' could be read from this file' + (firstBad ? '. The first line that could not be read was: ' + firstBad : '.'));
  return { n, bad, firstBad, wall: wall.slice(0, n), cols: out.map((a) => a.slice(0, n)) };
}

/* bars: { wall (minutes), o, h, l, c, v } */
export function parse(text) {
  const r = parseRows(text, 5, 'bars');
  const d = { kind: 'bars', n: r.n, bad: r.bad, firstBad: r.firstBad, wall: r.wall.map((s) => Math.floor(s / 60)), o: r.cols[0], h: r.cols[1], l: r.cols[2], c: r.cols[3], v: r.cols[4] };
  for (let i = 1; i < d.n; i++) if (d.wall[i] < d.wall[i - 1]) { sortBy(d, ['wall', 'o', 'h', 'l', 'c', 'v']); break; }
  return d;
}
/* trades: { wall (seconds), p, b, a, s }, kept in file order within a second */
export function parseTrades(text) {
  const r = parseRows(text, 4, 'trades');
  const d = { kind: 'trades', n: r.n, bad: r.bad, firstBad: r.firstBad, wall: r.wall, p: r.cols[0], b: r.cols[1], a: r.cols[2], s: r.cols[3] };
  for (let i = 1; i < d.n; i++) if (d.wall[i] < d.wall[i - 1]) { sortBy(d, ['wall', 'p', 'b', 'a', 's']); break; }
  return d;
}
function sortBy(d, keys) {
  const idx = [...Array(d.n).keys()].sort((a, b) => d.wall[a] - d.wall[b] || a - b);
  for (const k of keys) { const src = d[k].slice(); idx.forEach((j, i) => { d[k][i] = src[j]; }); }
}

/* the bar length in minutes: the commonest gap between bars */
export function barMinutes(wall) {
  const count = new Map();
  for (let i = 1; i < Math.min(wall.length, 20000); i++) { const d = wall[i] - wall[i - 1]; if (d > 0 && d <= 1440) count.set(d, (count.get(d) || 0) + 1); }
  let best = 1, most = 0;
  for (const [d, k] of count) if (k > most) { best = d; most = k; }
  return best;
}

/* Which zone puts the daily break at 5:00 pm ET? Every candidate's score,
   best first: { zone, label, hits, of, stamping: 'open' | 'close' }.
   For bars, `ends` are the minute after each last bar before a break; for
   trades, the minute after each last trade. */
function score(ends, base) {
  const of = ends.length;
  return ZONES.map(([zone, label]) => {
    let open = 0, close = 0;
    for (const g of ends) {
      const et = toET(wallToUtc(g, zone));
      const mod = ((et % 1440) + 1440) % 1440;
      if (mod === 17 * 60) open++;
      else if (base && mod === 17 * 60 + base) close++;
    }
    return { zone, label, hits: Math.max(open, close), of, stamping: close > open ? 'close' : 'open' };
  }).sort((a, b) => b.hits - a.hits);
}
export function detectZone(wall, base) {
  const ends = [];
  for (let i = 0; i + 1 < wall.length; i++) { const d = wall[i + 1] - wall[i]; if (d >= 45 && d <= 300) ends.push(wall[i] + base); }
  return score(ends, base);
}
export function detectZoneTrades(wall) {
  const ends = [];
  for (let i = 0; i + 1 < wall.length; i++) if (wall[i + 1] - wall[i] >= 45 * 60) ends.push(Math.ceil((wall[i] + 1) / 60));
  return score(ends, 0);
}

/* bars to run on: UTC minutes when each bar opened, prices in ticks */
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
  return { kind: 'bars', n, t, o, h, l, c, v, base, tick };
}

/* trades to run on: UTC seconds, prices in ticks, size, and side (+1 at or
   above the ask, a buy; -1 at or below the bid, a sell; 0 when unknown) */
export function buildTrades(p, { zone, tick }) {
  const n = p.n;
  const t = new Int32Array(n), pr = new Int32Array(n), s = new Uint32Array(n), side = new Int8Array(n);
  let off = 0;
  const q = (x) => { const r = Math.round(x / tick); if (Math.abs(r * tick - x) > tick * 1e-6) off++; return r; };
  for (let i = 0; i < n; i++) {
    const w = p.wall[i], m = Math.floor(w / 60);
    t[i] = wallToUtc(m, zone) * 60 + (w - m * 60);
    pr[i] = q(p.p[i]);
    s[i] = Math.max(1, Math.round(p.s[i]));
    const b = p.b[i] > 0 ? Math.round(p.b[i] / tick) : null, a = p.a[i] > 0 ? Math.round(p.a[i] / tick) : null;
    side[i] = a !== null && pr[i] >= a ? 1 : b !== null && pr[i] <= b ? -1 : 0;
  }
  if (off) throw new Error(off + ' prices in this file are not whole ticks of ' + tick + '. Check the instrument chosen for it.');
  return { kind: 'trades', n, t, p: pr, s, side, tick };
}

/* Join two trade sets that may overlap: the earlier set up to and including
   the later set's first second, then all of the later set. A later export
   starts with a second that may be cut short, which this leaves to the
   earlier set. Returns the joined set and what happened. */
export function joinTrades(A, B) {
  if (B.t[0] < A.t[0]) [A, B] = [B, A];
  if (A.t[A.n - 1] >= B.t[B.n - 1]) return { data: A, added: 0, note: 'The second file lies inside the first, so nothing was added.' };
  const cut = B.t[0];
  let k = A.n;
  while (k > 0 && A.t[k - 1] > cut) k--;
  /* trades of B in that first second that A already has are A's */
  let j = 0;
  if (A.t[A.n - 1] >= cut) while (j < B.n && B.t[j] === cut) j++;
  const n = k + (B.n - j);
  const out = { kind: 'trades', n, tick: A.tick, t: new Int32Array(n), p: new Int32Array(n), s: new Uint32Array(n), side: new Int8Array(n) };
  for (const key of ['t', 'p', 's', 'side']) { out[key].set(A[key].subarray(0, k), 0); out[key].set(B[key].subarray(j), k); }
  const gap = A.t[A.n - 1] < cut;
  return { data: out, added: n - A.n, note: gap ? 'The files do not overlap: there is a gap between them, which the replay keeps.' : 'The files overlapped; the later one takes over from its first full second.' };
}

/* ------------------------------------------------------------ the compact copy */

function magic(dv) { return String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)); }
export function encode(d) {
  const trades = d.kind === 'trades';
  const cols = trades ? ['t', 'p', 's'] : ['t', 'o', 'h', 'l', 'c', 'v'];
  const extra = trades ? Math.ceil(d.n / 4) * 4 : 0;
  const buf = new ArrayBuffer(24 + d.n * 4 * cols.length + extra);
  const dv = new DataView(buf);
  [...(trades ? 'CTRT' : 'CTRP')].forEach((ch, i) => dv.setUint8(i, ch.charCodeAt(0)));
  dv.setUint32(4, 1, true);
  dv.setUint32(8, d.n, true);
  dv.setUint32(12, d.base || 0, true);
  dv.setFloat64(16, d.tick, true);
  let at = 24;
  for (const k of cols) { new Uint8Array(buf, at, d.n * 4).set(new Uint8Array(d[k].buffer, d[k].byteOffset, d.n * 4)); at += d.n * 4; }
  if (trades) new Int8Array(buf, at, d.n).set(d.side);
  return buf;
}
export function decode(buf) {
  const dv = new DataView(buf);
  const m = magic(dv);
  if (m !== 'CTRP' && m !== 'CTRT') throw new Error('This replay file is not one the app made.');
  const n = dv.getUint32(8, true), base = dv.getUint32(12, true), tick = dv.getFloat64(16, true);
  const at = (k) => 24 + k * n * 4;
  if (m === 'CTRT') return { kind: 'trades', n, tick, t: new Int32Array(buf, at(0), n), p: new Int32Array(buf, at(1), n), s: new Uint32Array(buf, at(2), n), side: new Int8Array(buf, at(3), n) };
  return { kind: 'bars', n, base, tick, t: new Int32Array(buf, at(0), n), o: new Int32Array(buf, at(1), n), h: new Int32Array(buf, at(2), n), l: new Int32Array(buf, at(3), n), c: new Int32Array(buf, at(4), n), v: new Uint32Array(buf, at(5), n) };
}

/* ------------------------------------------------------------ the files the reader has loaded */

let index = [];
const memory = new Map(); /* the design preview keeps files in memory only */
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
const span = (d) => (d.kind === 'trades' ? [Math.floor(d.t[0] / 60), Math.floor(d.t[d.n - 1] / 60)] : [d.t[0], d.t[d.n - 1]]);
export async function keep(meta, data, replaceId = null) {
  const id = replaceId || crypto.randomUUID();
  if (isNative) await invokeRaw('replay_save_bin', encode(data), { 'x-replay-id': id });
  else memory.set(id, data);
  const [first, last] = span(data);
  const entry = { ...meta, id, kind: data.kind, n: data.n, first, last, importedAt: meta.importedAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  index = index.filter((f) => f.id !== id);
  index.push(entry);
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

/* ------------------------------------------------------------ bars of any length */

/* the trading day (CME, 6:00 pm ET) a UTC minute belongs to, as a day number */
export function tradingDayNo(utc) {
  const et = toET(utc);
  let day = Math.floor(et / 1440);
  if (et - day * 1440 >= 18 * 60) day++;
  const wd = new Date(day * 864e5).getUTCDay();
  if (wd === 6) day += 2; else if (wd === 0) day += 1;
  return day;
}

/* One-minute bars from trades, each with its delta (buys less sells) and
   the range of trades it holds; `of` maps a trade to its bar. */
export function barsFromTrades(T) {
  const n = T.n;
  const t = new Int32Array(n), o = new Int32Array(n), h = new Int32Array(n), l = new Int32Array(n), c = new Int32Array(n), v = new Uint32Array(n), dl = new Int32Array(n), from = new Int32Array(n), to = new Int32Array(n), of = new Int32Array(n);
  let m = -1, last = null;
  for (let i = 0; i < n; i++) {
    const k = Math.floor(T.t[i] / 60);
    if (k !== last) { m++; last = k; t[m] = k; o[m] = h[m] = l[m] = T.p[i]; v[m] = 0; dl[m] = 0; from[m] = i; }
    const p = T.p[i];
    if (p > h[m]) h[m] = p;
    if (p < l[m]) l[m] = p;
    c[m] = p; v[m] += T.s[i]; dl[m] += T.side[i] * T.s[i]; to[m] = i; of[i] = m;
  }
  m++;
  return { kind: 'bars', fromTrades: true, n: m, base: 1, tick: T.tick, t: t.slice(0, m), o: o.slice(0, m), h: h.slice(0, m), l: l.slice(0, m), c: c.slice(0, m), v: v.slice(0, m), dl: dl.slice(0, m), from: from.slice(0, m), to: to.slice(0, m), of };
}

/* Bars of tf minutes (or 'D' for the CME trading day) from base bars, with
   the base-bar range each covers. */
export function aggregate(d, tf) {
  if (tf === d.base) {
    const idx = new Int32Array(d.n).map((_, i) => i);
    return { ...d, from: idx, to: idx, of: idx, baseFrom: d.from, baseTo: d.to };
  }
  const key = tf === 'D' ? (i) => tradingDayNo(d.t[i])
    : tf >= 240 ? (i) => Math.floor((toET(d.t[i]) - 18 * 60) / tf)
      : (i) => Math.floor(d.t[i] / tf);
  const n = d.n;
  const t = new Int32Array(n), o = new Int32Array(n), h = new Int32Array(n), l = new Int32Array(n), c = new Int32Array(n), v = new Uint32Array(n), dl = new Int32Array(n), from = new Int32Array(n), to = new Int32Array(n), of = new Int32Array(n);
  let m = -1, last = null;
  for (let i = 0; i < n; i++) {
    const k = key(i);
    if (k !== last) { m++; last = k; t[m] = d.t[i]; o[m] = d.o[i]; h[m] = d.h[i]; l[m] = d.l[i]; v[m] = 0; dl[m] = 0; from[m] = i; }
    if (d.h[i] > h[m]) h[m] = d.h[i];
    if (d.l[i] < l[m]) l[m] = d.l[i];
    c[m] = d.c[i]; v[m] += d.v[i]; if (d.dl) dl[m] += d.dl[i]; to[m] = i; of[i] = m;
  }
  m++;
  return { kind: 'bars', n: m, base: d.base, tick: d.tick, t: t.subarray(0, m), o: o.subarray(0, m), h: h.subarray(0, m), l: l.subarray(0, m), c: c.subarray(0, m), v: v.subarray(0, m), dl: d.dl ? dl.subarray(0, m) : null, from: from.subarray(0, m), to: to.subarray(0, m), of };
}

/* the first index at or after a value in a sorted array */
export function lowerBound(arr, n, x) {
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}
/* the first base bar at or after a UTC minute */
export function indexAt(d, utc) { return Math.min(d.n - 1, lowerBound(d.t, d.n, utc)); }

/* ------------------------------------------------------------ volume at price */

/* Volume at each price row (rowTicks ticks to a row) over a range, as
   { lo (row of the lowest), rows, vol, buy, sell } with arrays by row.
   From trades the split into buys and sells is the inferred side; from bars
   there is no split, and a bar's volume is spread evenly over its range,
   which is an approximation the page states. */
export function levelsFromTrades(T, i0, i1, rowTicks = 1) {
  if (i1 < i0) return null;
  let lo = Infinity, hi = -Infinity;
  for (let i = i0; i <= i1; i++) { const r = Math.floor(T.p[i] / rowTicks); if (r < lo) lo = r; if (r > hi) hi = r; }
  const rows = hi - lo + 1;
  const vol = new Float64Array(rows), buy = new Float64Array(rows), sell = new Float64Array(rows);
  for (let i = i0; i <= i1; i++) {
    const r = Math.floor(T.p[i] / rowTicks) - lo, s = T.s[i];
    vol[r] += s;
    if (T.side[i] > 0) buy[r] += s; else if (T.side[i] < 0) sell[r] += s;
  }
  return { lo, rows, rowTicks, vol, buy, sell, split: true };
}
export function levelsFromBars(B, i0, i1, rowTicks = 1, last = null) {
  if (i1 < i0) return null;
  const get = (k, i) => (last && i === i1 ? last[k] : B[k][i]);
  let lo = Infinity, hi = -Infinity;
  for (let i = i0; i <= i1; i++) { const a = Math.floor(get('l', i) / rowTicks), b = Math.floor(get('h', i) / rowTicks); if (a < lo) lo = a; if (b > hi) hi = b; }
  const rows = hi - lo + 1;
  const vol = new Float64Array(rows);
  for (let i = i0; i <= i1; i++) {
    const a = Math.floor(get('l', i) / rowTicks) - lo, b = Math.floor(get('h', i) / rowTicks) - lo, v = get('v', i);
    const each = v / (b - a + 1);
    for (let r = a; r <= b; r++) vol[r] += each;
  }
  return { lo, rows, rowTicks, vol, buy: null, sell: null, split: false };
}

/* the point of control and the value area (pct of the volume, built out
   from the point of control a row at a time, the larger side first) */
export function valueArea(L, pct = 70) {
  if (!L || !L.rows) return null;
  let poc = 0, total = 0;
  for (let r = 0; r < L.rows; r++) { total += L.vol[r]; if (L.vol[r] > L.vol[poc]) poc = r; }
  let a = poc, b = poc, sum = L.vol[poc];
  const want = total * pct / 100;
  while (sum < want && (a > 0 || b < L.rows - 1)) {
    const down = a > 0 ? L.vol[a - 1] : -1, up = b < L.rows - 1 ? L.vol[b + 1] : -1;
    if (up >= down) { b++; sum += L.vol[b]; } else { a--; sum += L.vol[a]; }
  }
  return { poc, vaLo: a, vaHi: b, total };
}

/* ------------------------------------------------------------ sessions and TPO */

/* Sessions of base bars, in time order, as { key, kind, from, to, startET,
   dayET }. Modes:
     'rth'   the regular session, 9:30 am to 4:00 pm ET;
     'day'   the CME trading day, from 6:00 pm ET the evening before.
   dayET is the New York date the session is labelled with (the regular
   session's day, or the trading day). */
export function sessionsOf(B, n, opts = {}) {
  const mode = opts.mode || (opts.rth === false ? 'day' : 'rth');
  const out = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    const et = toET(B.t[i]), day = Math.floor(et / 1440), mod = et - day * 1440;
    const inRth = mod >= 570 && mod < 960;
    let key, kind, startET, dayET;
    if (mode === 'rth') {
      if (!inRth) { if (cur) { out.push(cur); cur = null; } continue; }
      key = 'R' + day; kind = 'rth'; startET = day * 1440 + 570; dayET = day * 1440;
    } else {
      const td = tradingDayNo(B.t[i]);
      key = 'D' + td; kind = 'day'; startET = (td - 1) * 1440 + 18 * 60; dayET = td * 1440;
    }
    if (!cur || cur.key !== key) { if (cur) out.push(cur); cur = { key, kind, from: i, to: i, startET, dayET }; }
    cur.to = i;
  }
  if (cur) out.push(cur);
  return out;
}

/* TPO blocks of base bars, in time order, as { key, from, to, startET,
   len, dayET }. Each trading day (from 6:00 pm ET) is cut into blocks of
   len minutes counted from its start: 30 minutes gives 6:00 pm, 6:30 pm
   and so on; 4 hours gives 6:00 pm, 10:00 pm, 2:00 am, 6:00 am, 10:00 am
   and 2:00 pm; a day (1,440) gives the whole trading day. A block holds
   the bars that traded in it, and one with none is left out. */
export function tpoBlocksOf(B, n, len) {
  const out = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    const td = tradingDayNo(B.t[i]), start = (td - 1) * 1440 + 18 * 60;
    const k = len >= 1440 ? 0 : Math.floor(Math.max(0, toET(B.t[i]) - start) / len);
    const key = td + ':' + k;
    if (!cur || cur.key !== key) { if (cur) out.push(cur); cur = { key, from: i, to: i, startET: start + k * len, len: Math.min(len, 1440), dayET: td * 1440 }; }
    cur.to = i;
  }
  if (cur) out.push(cur);
  return out;
}

/* A TPO block as time-price opportunities: each period (a set number of
   minutes from the block's start) a letter, set at every price row the
   market traded in that period. Letters follow the clock, so a period with
   no trading leaves its letter out. Built from one-minute bars, so a
   period's rows are the bars' ranges.
   Also: single prints (runs of two or more rows where only one period
   traded) and the initial balance (the range of the hour from 9:30 am ET),
   when the block holds that whole hour. */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function tpoOf(B, sess, { period = 30, rowTicks = 4, vaPct = 70, last = null, lastIndex = -1 } = {}) {
  const get = (k, i) => (last && i === lastIndex ? last[k] : B[k][i]);
  let lo = Infinity, hi = -Infinity;
  const to = lastIndex >= 0 ? Math.min(sess.to, lastIndex) : sess.to;
  for (let i = sess.from; i <= to; i++) { const a = Math.floor(get('l', i) / rowTicks), b = Math.floor(get('h', i) / rowTicks); if (a < lo) lo = a; if (b > hi) hi = b; }
  const rows = hi - lo + 1;
  const marks = Array.from({ length: rows }, () => []);
  /* the block's whole run of periods (to the 5:00 pm ET halt at most), so
     shading by period holds still while it builds */
  let periods = Math.max(1, Math.ceil((Math.min(sess.startET + sess.len, sess.dayET + 17 * 60) - sess.startET) / period));
  for (let i = sess.from; i <= to; i++) {
    const pIdx = Math.floor((toET(B.t[i]) - sess.startET) / period);
    if (pIdx >= periods) periods = pIdx + 1;
    const a = Math.floor(get('l', i) / rowTicks) - lo, b = Math.floor(get('h', i) / rowTicks) - lo;
    for (let r = a; r <= b; r++) { const m = marks[r]; if (m[m.length - 1] !== pIdx) m.push(pIdx); }
  }
  const singles = [];
  let run = -1;
  for (let r = 0; r <= rows; r++) {
    const one = r < rows && marks[r].length === 1;
    if (one && run < 0) run = r;
    if (!one && run >= 0) { if (r - run >= 2) singles.push([run, r - 1]); run = -1; }
  }
  let ib = null;
  const ibAt = sess.dayET + 570;
  if (ibAt >= sess.startET && ibAt + 60 <= sess.startET + sess.len) {
    let a = Infinity, b = -Infinity;
    for (let i = sess.from; i <= to; i++) {
      const et = toET(B.t[i]);
      if (et < ibAt) continue;
      if (et >= ibAt + 60) break;
      a = Math.min(a, Math.floor(get('l', i) / rowTicks) - lo);
      b = Math.max(b, Math.floor(get('h', i) / rowTicks) - lo);
    }
    if (a <= b) ib = { lo: a, hi: b };
  }
  const vol = Float64Array.from(marks, (m) => m.length);
  const va = valueArea({ rows, vol }, vaPct);
  return {
    lo, rows, rowTicks, marks, periods, poc: va ? va.poc : 0, vaLo: va ? va.vaLo : 0, vaHi: va ? va.vaHi : 0,
    open: get('o', sess.from), close: get('c', to), from: sess.from, to, singles, ib, startET: sess.startET, len: sess.len, dayET: sess.dayET,
  };
}
