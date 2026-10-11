/* Atlas's data: official public sources, fetched by the native side
   (src-tauri/src/backdrop.rs) from a fixed list of addresses and kept as a
   last copy in the app's folder. This module asks for a source by name,
   reads what comes back in the publisher's own format, and keeps track of
   where each figure came from and how fresh it is. It contacts nothing
   itself, and nothing is fetched unless an Atlas page is open.

   How often: a daily source is fetched again once its copy is 12 hours old,
   a weekly one at 24 hours, and Treasury files for past years are kept.
   "Fetch again" fetches straight away, at most once every ten minutes. */

import { invoke, isNative } from '../shared/js/native.js';
import * as settings from './settings.js';

export const DAILY = 12;
export const WEEKLY = 24;
const KEEP = 24 * 365 * 30;
const FLOOR_MS = 10 * 60 * 1000;

/* the publisher named beside every figure */
export const PUBLISHER = {
  'tsy-nominal': 'US Treasury',
  'tsy-real': 'US Treasury',
  'nyfed-latest': 'Federal Reserve Bank of New York',
  'nyfed-effr': 'Federal Reserve Bank of New York',
  'nyfed-sofr': 'Federal Reserve Bank of New York',
  auctions: 'US Treasury, Fiscal Data',
  'cftc-tff': 'CFTC',
  'cftc-dis': 'CFTC',
  'ecb-90d': 'European Central Bank',
  eia: 'US Energy Information Administration',
  'fed-press': 'Federal Reserve Board',
};

const memo = new Map();
const lastForced = new Map();

/* one source's text: { text, fetchedAt, fresh, error }. Throws with a plain
   reason when there is nothing to show at all. */
export async function get(id, arg = '', { maxAge = DAILY, force = false } = {}) {
  if (!isNative) throw new Error('Atlas fetches its data in the installed app. This design preview has no native side to fetch with.');
  const key = id + '|' + arg;
  if (force) {
    const last = lastForced.get(key) || 0;
    if (Date.now() - last < FLOOR_MS) force = false;
    else lastForced.set(key, Date.now());
  }
  if (!force && memo.has(key)) {
    const m = memo.get(key);
    if (Date.now() - m.fetchedAt < maxAge * 3600e3 || m.error) return m;
  }
  const network = settings.get().backdrop !== false;
  try {
    const got = await invoke('backdrop_get', { id, arg: arg || null, maxAgeHours: maxAge, network, force });
    const out = { text: got.text, fetchedAt: got.fetched_at, fresh: got.fresh, error: got.error || null, id };
    memo.set(key, out);
    return out;
  } catch (e) {
    throw new Error(String(e && e.message ? e.message : e));
  }
}
export const forget = () => { memo.clear(); lastForced.clear(); };

/* ------------------------------------------------------------ dates */

/* data dates are calendar days with no time zone: keep them as "2026-10-08" */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function mdy(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(s).trim());
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
}
export const dayMs = (iso) => Date.parse(iso + 'T12:00:00Z');
const LONG = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const SHORT = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const SHORTY = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' });
/* "8 October 2026", "8 Oct", "8 Oct 2026", "Thursday" */
export const longDay = (iso) => (ISO.test(iso) ? LONG.format(new Date(dayMs(iso))) : '');
export const shortDay = (iso) => (ISO.test(iso) ? SHORT.format(new Date(dayMs(iso))) : '');
export const shortDayY = (iso) => (ISO.test(iso) ? SHORTY.format(new Date(dayMs(iso))) : '');
export const weekday = (iso) => (ISO.test(iso) ? WEEKDAY.format(new Date(dayMs(iso))) : '');
export const addDays = (iso, n) => new Date(dayMs(iso) + n * 864e5).toISOString().slice(0, 10);

/* ------------------------------------------------------------ CSV */

export function csv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}
const num = (s) => {
  if (s === null || s === undefined) return null;
  const t = String(s).replace(/,/g, '').trim();
  if (t === '' || t === 'null' || t === 'N/A' || t === 'NA' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------ Treasury */

/* Treasury's column names ("1 Mo", "1.5 Month", "10 Yr", "10 YR") as short
   keys ("1M", "1.5M", "10Y"), with the term in years for spacing a chart */
export function tenor(label) {
  const m = /^([\d.]+)\s*(mo|month|yr|year)/i.exec(String(label).trim());
  if (!m) return null;
  const n = +m[1], months = /^m/i.test(m[2]);
  return { key: m[1] + (months ? 'M' : 'Y'), years: months ? n / 12 : n, label: m[1] + (months ? ' month' : ' year') };
}

/* rows oldest first: { date, v: { '2Y': 4.75, ... } }, and the terms present */
export function treasury(text) {
  const rows = csv(text);
  if (!rows.length || !/^date$/i.test(rows[0][0])) throw new Error('Treasury sent something other than its yield file.');
  const cols = rows[0].slice(1).map(tenor);
  const out = [];
  for (const r of rows.slice(1)) {
    const date = mdy(r[0]);
    if (!date) continue;
    const v = {};
    cols.forEach((c, i) => { if (c) { const x = num(r[i + 1]); if (x !== null) v[c.key] = x; } });
    out.push({ date, v });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { rows: out, terms: cols.filter(Boolean) };
}

/* several years of one curve, joined and in order */
export function joinYears(parts) {
  const seen = new Map();
  const terms = new Map();
  for (const p of parts) {
    for (const t of p.terms) terms.set(t.key, t);
    for (const r of p.rows) seen.set(r.date, r);
  }
  return { rows: [...seen.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), terms: [...terms.values()].sort((a, b) => a.years - b.years) };
}

/* ------------------------------------------------------------ New York Fed */

export function nyfedLatest(text) {
  const j = JSON.parse(text);
  const by = {};
  for (const r of j.refRates || []) by[r.type] = r;
  return by;
}
/* oldest first: { date, rate, lo, hi, p1, p99, volume } */
export function nyfedSeries(text) {
  const j = JSON.parse(text);
  return (j.refRates || []).map((r) => ({
    date: r.effectiveDate, rate: num(r.percentRate), lo: num(r.targetRateFrom), hi: num(r.targetRateTo),
    p1: num(r.percentPercentile1), p99: num(r.percentPercentile99), volume: num(r.volumeInBillions),
  })).filter((r) => ISO.test(r.date) && r.rate !== null).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ------------------------------------------------------------ auctions */

export function auctions(text) {
  const j = JSON.parse(text);
  if (!Array.isArray(j.data)) throw new Error('Fiscal Data sent something other than the auction list.');
  return j.data.map((a) => {
    const kind = a.inflation_index_security === 'Yes' ? 'TIPS' : a.floating_rate === 'Yes' ? 'FRN' : a.security_type;
    const comp = num(a.comp_accepted);
    const share = (x) => (comp && num(x) !== null ? num(x) / comp : null);
    const done = num(a.bid_to_cover_ratio) !== null;
    return {
      date: a.auction_date, issue: a.issue_date, maturity: a.maturity_date, announced: a.announcemt_date,
      type: a.security_type, kind, term: a.security_term, cusip: a.cusip,
      reopening: a.reopening === 'Yes', cmb: a.cash_management_bill_cmb === 'Yes',
      offering: num(a.offering_amt), tendered: num(a.total_tendered), accepted: num(a.total_accepted), comp,
      btc: num(a.bid_to_cover_ratio),
      /* bills are sold on a discount rate; notes, bonds and TIPS on a yield;
         FRNs on a discount margin, which this list does not carry */
      high: num(a.high_yield) !== null ? num(a.high_yield) : num(a.high_discnt_rate),
      highIs: num(a.high_yield) !== null ? (kind === 'TIPS' ? 'Real yield' : 'Yield') : num(a.high_discnt_rate) !== null ? 'Discount rate' : '',
      coupon: num(a.int_rate),
      dealers: share(a.primary_dealer_accepted), direct: share(a.direct_bidder_accepted), indirect: share(a.indirect_bidder_accepted),
      soma: num(a.soma_accepted),
      /* the deadline for competitive bids, in ET, as "01:00 PM" */
      closes: a.closing_time_comp && a.closing_time_comp !== 'null' ? a.closing_time_comp : '',
      done,
    };
  }).filter((a) => ISO.test(a.date));
}

/* ------------------------------------------------------------ CFTC */

/* The two reports group traders differently. Financial futures (equity
   index, rates, currencies) come in Traders in Financial Futures; physical
   commodities in the Disaggregated report. */
export const GROUPS = {
  tff: [
    ['dealer', 'Dealers', 'dealer_positions_long_all', 'dealer_positions_short_all'],
    ['asset', 'Asset managers', 'asset_mgr_positions_long', 'asset_mgr_positions_short'],
    ['lev', 'Leveraged funds', 'lev_money_positions_long', 'lev_money_positions_short'],
    ['other', 'Other reportables', 'other_rept_positions_long', 'other_rept_positions_short'],
    ['small', 'Non-reportables', 'nonrept_positions_long_all', 'nonrept_positions_short_all'],
  ],
  dis: [
    ['prod', 'Producers and merchants', 'prod_merc_positions_long', 'prod_merc_positions_short'],
    ['swap', 'Swap dealers', 'swap_positions_long_all', 'swap__positions_short_all'],
    ['mm', 'Managed money', 'm_money_positions_long_all', 'm_money_positions_short_all'],
    ['other', 'Other reportables', 'other_rept_positions_long', 'other_rept_positions_short'],
    ['small', 'Non-reportables', 'nonrept_positions_long_all', 'nonrept_positions_short_all'],
  ],
};

/* oldest first: { date, oi, g: { lev: { long, short, net }, ... } } */
export function cftc(text, report) {
  const j = JSON.parse(text);
  if (!Array.isArray(j)) throw new Error('The CFTC sent something other than the report rows.');
  return j.map((r) => {
    const g = {};
    for (const [k, , lf, sf] of GROUPS[report]) {
      const long = num(r[lf]), short = num(r[sf]);
      g[k] = { long, short, net: long !== null && short !== null ? long - short : null };
    }
    return { date: String(r.report_date_as_yyyy_mm_dd || '').slice(0, 10), oi: num(r.open_interest_all), g };
  }).filter((r) => ISO.test(r.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ------------------------------------------------------------ ECB */

/* oldest first: { date, r: { USD: 1.1206, ... } }, euro per one unit quoted */
export function ecb(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('The ECB sent something other than its rates file.');
  const days = [...doc.getElementsByTagName('Cube')].filter((c) => c.getAttribute('time'));
  return days.map((d) => {
    const r = {};
    for (const c of d.getElementsByTagName('Cube')) {
      const cur = c.getAttribute('currency'), rate = num(c.getAttribute('rate'));
      if (cur && rate !== null) r[cur] = rate;
    }
    return { date: d.getAttribute('time'), r };
  }).filter((d) => ISO.test(d.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ------------------------------------------------------------ EIA */

/* EIA's weekly history page: rows of a month with up to five weeks, each
   a week-ending date and a value in thousand barrels. Also its own
   "Release Date" and "Next Release Date". */
export function eia(text) {
  const out = [];
  const rowRe = /<tr>\s*<td class='B6'>(?:&nbsp;)*\s*(\d{4})-([A-Za-z]{3})\s*<\/td>([\s\S]*?)<\/tr>/g;
  const pairRe = /<td class='B5'>\s*(\d{2})\/(\d{2})(?:&nbsp;)*\s*<\/td>\s*<td class='B3'>\s*([\d,]+)/g;
  let m;
  while ((m = rowRe.exec(text))) {
    const y = m[1];
    let p;
    while ((p = pairRe.exec(m[3]))) out.push({ date: y + '-' + p[1] + '-' + p[2], v: num(p[3]) });
  }
  if (!out.length) throw new Error('EIA sent something other than its weekly table.');
  const rel = /Release Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text);
  const next = /Next Release Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text);
  return {
    rows: out.filter((r) => r.v !== null).sort((a, b) => (a.date < b.date ? -1 : 1)),
    released: rel ? mdy(rel[1]) : null,
    next: next ? mdy(next[1]) : null,
  };
}

/* ------------------------------------------------------------ the Fed's feed */

export function rss(text) {
  const doc = new DOMParser().parseFromString(text.replace(/^﻿/, ''), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('The Fed sent something other than its press feed.');
  return [...doc.getElementsByTagName('item')].map((it) => {
    const t = (n) => (it.getElementsByTagName(n)[0] || {}).textContent || '';
    return { title: t('title').trim(), link: t('link').trim(), at: Date.parse(t('pubDate')), category: t('category').trim(), text: t('description').trim() };
  }).filter((i) => i.title);
}
