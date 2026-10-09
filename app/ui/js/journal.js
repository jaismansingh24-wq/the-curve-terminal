/* The journal: the entries, where they are kept, and what each one adds up to.

   Entries are kept in one file on this computer (journal.json in the app's
   data folder, with the previous version beside it as journal.bak.json),
   written by the Rust side. In the design preview there is no Rust side, so
   entries live only until the page reloads, and the interface says so.

   Results are worked out from the entry, never stored, so a corrected price
   or a changed setting always shows through:
     gross  = sum over each exit of (exit - entry) x direction x contracts x point value
     costs  = the costs typed on the entry, or the default per contract x contracts
     net    = gross - costs                      (net is what every figure shows by default)
     R      = result / planned risk, where planned risk = |entry - initial stop| x contracts x point value */

import { invoke, isNative } from '../shared/js/native.js';
import { get as instrument } from './instruments.js';
import { tradingDay, weekOf, monthOf } from './time.js';

export const SCHEMA = 1;
let entries = [];
const listeners = [];
export const persistent = isNative;

let loaded = false;
export async function load() {
  if (!isNative) { loaded = true; return entries; }
  const text = await invoke('journal_read');
  let data = [];
  try { data = JSON.parse(text || '[]'); } catch (e) { throw new Error('The journal file could not be read. It has not been changed.'); }
  const fromFile = Array.isArray(data) ? data : (Array.isArray(data.entries) ? data.entries : []);
  /* anything saved while the file was being read wins over the file */
  const mine = new Set(entries.map((e) => e.id));
  entries = [...entries, ...fromFile.filter((e) => !mine.has(e.id))];
  loaded = true;
  listeners.forEach((fn) => fn(entries));
  return entries;
}
export const isLoaded = () => loaded;

/* never write before the file has been read: that would replace it */
function ready() {
  if (isNative && !loaded) throw new Error('The journal is still loading. Try again in a moment.');
}

async function persist() {
  if (isNative) await invoke('journal_write', { json: JSON.stringify({ schema: SCHEMA, entries }, null, 1) });
  listeners.forEach((fn) => fn(entries));
}

export function onChange(fn) { listeners.push(fn); }

/* newest first, by when the trade closed (or opened, if no exit time) */
export function all() {
  return entries.slice().sort((a, b) => closedAt(b) - closedAt(a));
}
export const byId = (id) => entries.find((e) => e.id === id) || null;

export async function save(entry) {
  ready();
  const now = new Date().toISOString();
  const i = entries.findIndex((e) => e.id === entry.id);
  if (i >= 0) entries[i] = { ...entry, updatedAt: now };
  else entries.push({ ...entry, id: entry.id || crypto.randomUUID(), createdAt: now, updatedAt: now, v: SCHEMA });
  await persist();
  return i >= 0 ? entries[i] : entries[entries.length - 1];
}

export async function remove(id) {
  ready();
  entries = entries.filter((e) => e.id !== id);
  await persist();
}

/* ------------------------------------------------------------- results */

export const closedAt = (e) => Date.parse(e.exitAt || e.entryAt);

export function result(e, settings) {
  const ins = instrument(e.instrument);
  if (!ins) return null;
  const dir = e.direction === 'short' ? -1 : 1;
  const partials = (e.partials || []).filter((p) => Number.isFinite(p.price) && p.contracts > 0);
  const partQty = partials.reduce((s, p) => s + p.contracts, 0);
  const legs = [...partials, { price: e.exitPrice, contracts: e.contracts - partQty }];
  const pointsTotal = legs.reduce((s, l) => s + (l.price - e.entryPrice) * dir * l.contracts, 0);
  const gross = pointsTotal * ins.point;

  let costs = 0, costsFrom = 'none';
  if (Number.isFinite(e.costs)) { costs = e.costs; costsFrom = 'entry'; }
  else if (settings && settings.costPerContract > 0) { costs = settings.costPerContract * e.contracts; costsFrom = 'default'; }
  const net = gross - costs;

  const risk = Number.isFinite(e.stop) ? Math.abs(e.entryPrice - e.stop) * e.contracts * ins.point : null;
  const at = closedAt(e);
  return {
    ins, gross, costs, costsFrom, net, risk: risk > 0 ? risk : null,
    at, day: tradingDay(at, settings ? settings.dayStart : 18),
    held: e.exitAt ? Date.parse(e.exitAt) - Date.parse(e.entryAt) : null,
  };
}

/* one result in the unit chosen: money, ticks or points per contract, or R */
export function inUnit(r, e, unit, basis) {
  if (!r) return null;
  const v = basis === 'gross' ? r.gross : r.net;
  if (unit === 'ticks') return v / (r.ins.tickValue * e.contracts);
  if (unit === 'points') return v / (r.ins.point * e.contracts);
  if (unit === 'r') return r.risk ? v / r.risk : null;
  return v;
}

/* totals for today's trading day, this week and this month */
export function periods(settings, now = Date.now()) {
  const today = tradingDay(now, settings.dayStart);
  const keys = { day: today, week: weekOf(today), month: monthOf(today) };
  const out = { day: blank(), week: blank(), month: blank() };
  for (const e of entries) {
    const r = result(e, settings);
    if (!r) continue;
    const hit = { day: r.day === keys.day, week: weekOf(r.day) === keys.week, month: monthOf(r.day) === keys.month };
    for (const k of Object.keys(out)) {
      if (!hit[k]) continue;
      const o = out[k];
      o.count++; o.gross += r.gross; o.net += r.net; o.costs += r.costs;
      const u = inUnit(r, e, settings.units, settings.basis);
      if (u === null) o.missing++; else o.value += u;
    }
  }
  return { keys, ...out };
}
function blank() { return { count: 0, gross: 0, net: 0, costs: 0, value: 0, missing: 0 }; }

/* ----------------------------------------------------------- validation */

export const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
};

/* what must be there, in plain words; returns { field: message } */
export function validate(e) {
  const bad = {};
  if (!instrument(e.instrument)) bad.instrument = 'Choose the instrument.';
  if (e.direction !== 'long' && e.direction !== 'short') bad.direction = 'Choose long or short.';
  if (!(Number.isInteger(e.contracts) && e.contracts > 0)) bad.contracts = 'Contracts must be a whole number, 1 or more.';
  if (!Number.isFinite(Date.parse(e.entryAt))) bad.entryAt = 'The entry date and time are needed.';
  if (e.exitAt && Date.parse(e.exitAt) < Date.parse(e.entryAt)) bad.exitAt = 'The exit is before the entry. Check both times and their zone.';
  if (!Number.isFinite(e.entryPrice) || e.entryPrice <= 0) bad.entryPrice = 'The entry price is needed.';
  if (!Number.isFinite(e.exitPrice) || e.exitPrice <= 0) bad.exitPrice = 'The exit price is needed.';
  if (!(e.confidence >= 1 && e.confidence <= 5)) bad.confidence = 'Choose how confident you were, 1 to 5.';
  if (!e.confluence || !e.confluence.trim()) bad.confluence = 'Name the main confluence.';
  const partQty = (e.partials || []).reduce((s, p) => s + (p.contracts || 0), 0);
  if (partQty && partQty >= e.contracts) bad.partials = 'Partials close ' + partQty + ' of ' + e.contracts + ' contracts. Leave at least one for the final exit.';
  if ((e.partials || []).some((p) => !Number.isFinite(p.price) || !(p.contracts > 0))) bad.partials = 'Each partial needs a price and a number of contracts.';
  if (e.stop !== null && e.stop !== undefined && !Number.isFinite(e.stop)) bad.stop = 'That stop price is not a number.';
  if (e.costs !== null && e.costs !== undefined && (!Number.isFinite(e.costs) || e.costs < 0)) bad.costs = 'Costs are a positive amount in dollars, or blank.';
  return bad;
}
