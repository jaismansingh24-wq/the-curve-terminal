/* Atlas: the market's background, from official public data only.
   Nine pages: How it connects (a guide to the rest, for an index future),
   This week (what changed in the figures since Monday), Rates, Auctions, Positioning, Energy, Currencies, Releases and the Fed's
   press releases.

   Every figure names its publisher and the date it is for, and every page
   says when its copy was fetched (and when a newer one could not be). A
   figure's name opens what it is, how it is worked out and where it
   misleads. Nothing here is live, forecast or a verdict: these are
   published facts, shown as published, with the calculations made here
   labelled as such. Positions and yields are drawn in greys with signs;
   the bid and ask colours are kept for bid and ask. */

import * as D from './backdrop-data.js';
import { DEFS } from './backdrop-defs.js';
import * as SCH from './backdrop-schedule.js';
import * as charts from './charts.js';
import * as settings from './settings.js';
import { el, int } from './format.js';
import { timeBoth, shortDateET, longDateET, wallToUtc, ET } from './time.js';
import { invoke, isNative } from '../shared/js/native.js';
import { expectedTime, rememberTime } from './atlas-times.js';
import { INDICES, GUIDE } from './atlas-guide.js';

const MINUS = '−';
const state = {
  token: 0,
  range: '1y', posRange: '3y', market: 'ES', auc: 'coupons', family: '', fx: 'USD', rel: '30', index: 'NQ',
};

/* ------------------------------------------------------------ numbers */

const fin = Number.isFinite;
function signed(v, d) {
  if (!fin(v)) return '';
  const r = Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v;
  return (r > 0 ? '+' : r < 0 ? MINUS : '') + Math.abs(r).toFixed(d);
}
const pct = (v, d = 2) => (fin(v) ? (v < 0 ? MINUS : '') + Math.abs(v).toFixed(d) + '%' : '');
const bp = (v) => (fin(v) ? signed(v * 100, 0) + ' bp' : '');
const pp = (v) => (fin(v) ? signed(v, 2) + ' pp' : '');
const sint = (v) => (fin(v) ? (v > 0 ? '+' : v < 0 ? MINUS : '') + int(Math.abs(v)) : '');
const bn = (v) => (fin(v) ? '$' + (v / 1e9).toFixed(v >= 1e11 ? 0 : 1) + ' billion' : '');
const mb = (v) => (fin(v) ? (v / 1000).toFixed(1) : '');
const mbs = (v) => (fin(v) ? signed(v / 1000, 1) : '');
const share = (v) => (fin(v) ? (v * 100).toFixed(1) + '%' : '');

/* ------------------------------------------------------------ building blocks */

export function openSource(url) {
  if (isNative) return invoke('open_source', { url }).catch(() => {});
  window.open(url, '_blank', 'noopener');
  return Promise.resolve();
}

/* a figure's name, as a button that opens what it is, how and where it misleads */
function named(id, title) {
  const d = DEFS[id];
  const name = el('button', 'stat__name', title || d[0]);
  name.type = 'button';
  name.setAttribute('aria-expanded', 'false');
  const def = el('div', 'stat__def');
  def.hidden = true;
  def.id = 'bd-def-' + id + '-' + Math.random().toString(36).slice(2, 7);
  name.setAttribute('aria-controls', def.id);
  [['What it is', d[1]], ['How it is worked out', d[2]], ['Where it misleads', d[3]]].forEach(([k, v]) => {
    const p = el('p', 'stat__defp');
    p.append(el('span', 'kicker', k), el('span', '', v));
    def.appendChild(p);
  });
  name.addEventListener('click', () => {
    const open = def.hidden;
    def.hidden = !open;
    name.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  return { name, def };
}

/* a panel: a name that explains itself, then whatever it holds */
function panel(id, title, parts, { extra = null, cls = '', tag = '' } = {}) {
  const art = el('article', 'cpanel bd-panel glass glass--quiet' + (cls ? ' ' + cls : ''));
  const head = el('div', 'stat__head');
  const { name, def } = named(id, title);
  head.appendChild(name);
  if (extra) head.appendChild(extra);
  if (tag) head.appendChild(el('span', 'stat__n', tag));
  art.append(head, def);
  for (const p of parts.filter(Boolean)) art.appendChild(typeof p === 'string' ? el('p', 'cpanel__cap', p) : p);
  return art;
}

function grid(items, cls = 'bgrid') {
  const g = el('div', cls);
  items.filter(Boolean).forEach((i) => g.appendChild(i));
  return g;
}

function section(title, sub, items, cls) {
  const sec = el('section', 'ssec');
  const h = el('div', 'ssec__head');
  h.appendChild(el('h2', 'title ssec__title', title));
  if (sub) h.appendChild(el('p', 'ssec__sub', sub));
  sec.append(h, grid(items, cls));
  return sec;
}

/* a plain table: head labels, then rows of cells (text, or [text, class]) */
function table(head, rows, { cls = '', numeric = [] } = {}) {
  const wrap = el('div', 'bd-tablewrap');
  const t = el('table', 'tbl bd-tbl ' + cls);
  const thead = el('thead'), tr = el('tr');
  head.forEach((h, i) => { const th = el('th', numeric.includes(i) ? 'r' : '', h); th.scope = 'col'; tr.appendChild(th); });
  thead.appendChild(tr);
  const tbody = el('tbody');
  for (const r of rows) {
    const row = el('tr');
    r.forEach((c, i) => {
      const td = el(i === 0 ? 'th' : 'td', (numeric.includes(i) ? 'r num ' : '') + (Array.isArray(c) ? c[1] || '' : ''));
      if (i === 0) td.scope = 'row';
      if (c instanceof Node) td.appendChild(c);
      else td.textContent = Array.isArray(c) ? c[0] : c;
      row.appendChild(td);
    });
    tbody.appendChild(row);
  }
  t.append(thead, tbody);
  wrap.appendChild(t);
  return wrap;
}

/* a key for the lines in a chart: solid, dashed, dotted */
function legend(items) {
  const k = el('div', 'bd-legend');
  items.forEach(([name, n]) => k.appendChild(el('span', 'bd-legend__k bd-legend__k--' + n, name)));
  return k;
}

/* a row of choices, as the app's other segmented controls */
function seg(label, opts, value, pick) {
  const g = el('div', 'seg seg--sm');
  g.setAttribute('role', 'radiogroup');
  g.setAttribute('aria-label', label);
  const list = opts.map(([v, text]) => {
    const b = el('button', 'seg__opt', text);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', v === value ? 'true' : 'false');
    b.tabIndex = v === value ? 0 : -1;
    b.addEventListener('click', () => pick(v));
    return b;
  });
  g.append(...list);
  g.addEventListener('keydown', (e) => {
    const i = list.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % list.length : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + list.length) % list.length : -1;
    if (n < 0) return;
    e.preventDefault();
    list[n].click();
  });
  return g;
}

function sourceButton(text, url) {
  const b = el('button', 'link bd-srclink', text);
  b.type = 'button';
  b.addEventListener('click', () => openSource(url));
  return b;
}

/* "fetched 10:03 am ET (7:33 pm your time)", with the day if not today */
function fetchedText(ms) {
  const today = shortDateET(Date.now()) === shortDateET(ms);
  return (today ? '' : shortDateET(ms) + ', ') + timeBoth(ms);
}

/* the line under a page's title: each source, what day its figures are for,
   when this copy was fetched, and whether a newer one could not be */
function statusLines(list) {
  const box = el('div', 'bd-status');
  const off = settings.get().backdrop === false;
  /* one line per publisher and date: four EIA series fetched together read as one */
  const items = [];
  for (const it of list.filter((x) => x && x.got)) {
    const same = items.find((x) => D.PUBLISHER[x.got.id] === D.PUBLISHER[it.got.id] && x.asOf === it.asOf && !x.got.error && !it.got.error && Math.abs(x.got.fetchedAt - it.got.fetchedAt) < 10 * 60e3);
    if (same) same.what += ', ' + (/\s[A-Z]/.test(it.what) || /^[A-Z]{2}/.test(it.what) ? it.what : it.what.charAt(0).toLowerCase() + it.what.slice(1));
    else items.push({ ...it });
  }
  for (const { got, what, asOf } of items) {
    const p = el('p', 'bd-status__line' + (got.error ? ' is-stale' : ''));
    p.appendChild(el('span', 'bd-status__src', D.PUBLISHER[got.id] || what));
    const bits = [];
    if (what) bits.push(what);
    if (asOf) bits.push(asOf);
    bits.push('fetched ' + fetchedText(got.fetchedAt));
    p.appendChild(document.createTextNode(' · ' + bits.join(' · ')));
    if (got.error) p.appendChild(el('span', 'bd-status__err', ' A newer copy could not be fetched: ' + got.error + '. This is the last copy.'));
    box.appendChild(p);
  }
  if (off) box.appendChild(el('p', 'bd-status__line', 'Fetching is switched off in Settings, so these are the last copies on this computer.'));
  return box;
}

/* the last row on or before a date */
function onOrBefore(rows, iso) {
  let best = null;
  for (const r of rows) { if (r.date <= iso) best = r; else break; }
  return best;
}
const monthBack = (iso, n = 1) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 - n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
};
const thisYear = () => +new Intl.DateTimeFormat('en-GB', { timeZone: ET, year: 'numeric' }).format(new Date());
const todayET = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p.slice(0, 10);
};
const rangeStart = (range, lastIso) => (range === 'all' ? '0000-00-00' : monthBack(lastIso, { '1y': 12, '3y': 36, '5y': 60, '10y': 120 }[range] || 12));

/* ------------------------------------------------------------ Rates */

const RANGES = [['1y', '1 year'], ['5y', '5 years'], ['10y', '10 years'], ['all', 'Since 1990']];

/* the Treasury files for a span of years, at most three at a time (its site
   can take twenty seconds a file); past years are kept, the current year is
   fetched again daily */
async function treasuryYears(id, from, force) {
  const y = thisYear();
  const back = { '1y': 1, '5y': 5, '10y': 10, all: 99 }[state.range] || 1;
  const years = [];
  for (let yr = Math.max(from, y - back); yr <= y; yr++) years.push(yr);
  const parts = new Map();
  let current = null, failure = null;
  const one = async (yr) => {
    const maxAge = yr === y ? D.DAILY : yr === y - 1 ? 24 * 30 : 24 * 365 * 30;
    try {
      const got = await D.get(id, String(yr), { maxAge, force: force && yr === y });
      parts.set(yr, D.treasury(got.text));
      if (yr === y) current = got;
    } catch (e) {
      if (yr === y) failure = e;
    }
  };
  const queue = years.slice().reverse();
  await Promise.all([0, 1, 2].map(async () => { while (queue.length) await one(queue.shift()); }));
  if (failure) throw failure;
  return { ...D.joinYears(years.filter((yr) => parts.has(yr)).map((yr) => parts.get(yr))), got: current };
}

async function buildRates(force) {
  const [nom, real, latest, effr, sofr] = await Promise.all([
    treasuryYears('tsy-nominal', 1990, force),
    treasuryYears('tsy-real', 2003, force).catch(() => ({ rows: [], terms: [], got: null })),
    D.get('nyfed-latest', '', { maxAge: D.DAILY, force }).catch((e) => ({ failed: e })),
    D.get('nyfed-effr', '1y', { maxAge: D.DAILY, force }).catch((e) => ({ failed: e })),
    D.get('nyfed-sofr', '1y', { maxAge: D.DAILY, force }).catch((e) => ({ failed: e })),
  ]);
  const rows = nom.rows;
  if (!rows.length) throw new Error('Treasury\'s file has no rows yet.');
  const last = rows[rows.length - 1];
  const wk = onOrBefore(rows, D.addDays(last.date, -7));
  const mo = onOrBefore(rows, monthBack(last.date));
  const from = rangeStart(state.range, last.date);
  const span = rows.filter((r) => r.date >= from);

  /* the curve */
  const sets = [{ name: D.shortDayY(last.date), cls: 'chart__line', v: last.v }];
  if (wk) sets.push({ name: 'A week before, ' + D.shortDayY(wk.date), cls: 'chart__line chart__line--2', v: wk.v });
  if (mo) sets.push({ name: 'A month before, ' + D.shortDayY(mo.date), cls: 'chart__line chart__line--3', v: mo.v });
  const terms = nom.terms.filter((t) => fin(last.v[t.key]));
  const curveChart = charts.curve(sets, terms, {
    label: 'Treasury par yields on ' + D.longDay(last.date) + ', a week and a month before. Hover a term for its figures.',
    fmt: (v) => pct(v),
    diff: (t) => [['On the week', wk ? bp(last.v[t.key] - wk.v[t.key]) : ''], ['On the month', mo ? bp(last.v[t.key] - mo.v[t.key]) : '']],
  });
  const curveTable = table(['Term', 'Yield', 'On the week', 'On the month'],
    terms.map((t) => [t.label, pct(last.v[t.key]), wk && fin(wk.v[t.key]) ? bp(last.v[t.key] - wk.v[t.key]) : '', mo && fin(mo.v[t.key]) ? bp(last.v[t.key] - mo.v[t.key]) : '']),
    { numeric: [1, 2, 3], cls: 'bd-tbl--compact' });

  /* spreads */
  const spread = (a, b) => span.filter((r) => fin(r.v[a]) && fin(r.v[b])).map((r) => ({ date: r.date, v: r.v[a] - r.v[b] }));
  const spreadPanel = (id, a, b) => {
    const pts = spread(a, b);
    if (!pts.length) return panel(id, null, ['No figures for this range.']);
    const now = pts[pts.length - 1];
    let lo = pts[0], hi = pts[0], below = 0;
    for (const p of pts) { if (p.v < lo.v) lo = p; if (p.v > hi.v) hi = p; if (p.v < 0) below++; }
    return panel(id, null, [
      charts.series([{ name: DEFS[id][0], cls: 'chart__line', points: pts }], { unit: 'pp', zero: true, fmt: pp, label: DEFS[id][0] + ' over ' + pts.length + ' days, now ' + pp(now.v) + '.' }),
      'Now ' + pp(now.v) + ' (' + D.shortDayY(now.date) + '). In this range: lowest ' + pp(lo.v) + ' on ' + D.shortDayY(lo.date) + ', highest ' + pp(hi.v) + ' on ' + D.shortDayY(hi.date) + '; below zero on ' + int(below) + ' of ' + int(pts.length) + ' days. Percentage points (pp); 1 pp is 100 basis points.',
    ], { tag: 'n ' + int(pts.length) });
  };

  /* real yields */
  let realPanel = null;
  if (real.rows.length) {
    const rl = real.rows[real.rows.length - 1];
    const rmo = onOrBefore(real.rows, monthBack(rl.date));
    const n10 = onOrBefore(rows, rl.date);
    const rspan = real.rows.filter((r) => r.date >= from);
    const be = rspan.map((r) => { const n = onOrBefore(rows, r.date); return n && n.date === r.date && fin(n.v['10Y']) && fin(r.v['10Y']) ? { date: r.date, v: n.v['10Y'] - r.v['10Y'] } : null; }).filter(Boolean);
    realPanel = panel('real', null, [
      legend([['10-year real yield', 1], ['10-year nominal minus real', 2]]),
      charts.series([
        { name: '10-year real yield', cls: 'chart__line', points: rspan.filter((r) => fin(r.v['10Y'])).map((r) => ({ date: r.date, v: r.v['10Y'] })) },
        { name: 'Nominal minus real', cls: 'chart__line chart__line--2', points: be },
      ], { unit: 'pct', fmt: (v) => pct(v), label: 'The 10-year real yield and the 10-year nominal minus real yield over this range.' }),
      table(['Term', 'Real yield', 'On the month'], real.terms.filter((t) => fin(rl.v[t.key])).map((t) => [t.label, pct(rl.v[t.key]), rmo && fin(rmo.v[t.key]) ? bp(rl.v[t.key] - rmo.v[t.key]) : '']), { numeric: [1, 2], cls: 'bd-tbl--compact' }),
      n10 && n10.date === rl.date && fin(n10.v['10Y']) && fin(rl.v['10Y'])
        ? '10-year nominal ' + pct(n10.v['10Y']) + ' minus 10-year real ' + pct(rl.v['10Y']) + ' is ' + pp(n10.v['10Y'] - rl.v['10Y']) + ' on ' + D.shortDayY(rl.date) + ' (worked out here).'
        : '',
    ], { cls: 'bd-panel--span' });
  }

  /* overnight rates */
  let overnight = null;
  if (!latest.failed) {
    const L = D.nyfedLatest(latest.text);
    const rowsOut = ['SOFR', 'EFFR', 'OBFR', 'TGCR', 'BGCR'].filter((k) => L[k]).map((k) => {
      const r = L[k];
      return [k, pct(r.percentRate), D.shortDayY(r.effectiveDate), fin(r.percentPercentile1) ? pct(r.percentPercentile1) + ' to ' + pct(r.percentPercentile99) : '', fin(r.volumeInBillions) ? '$' + int(r.volumeInBillions) + ' billion' : ''];
    });
    const e = L.EFFR;
    const parts = [table(['Rate', 'Per cent', 'For', '1st to 99th percentile', 'Volume'], rowsOut, { numeric: [1, 4] })];
    if (e && fin(e.targetRateFrom)) parts.push('Fed funds target range: ' + pct(e.targetRateFrom) + ' to ' + pct(e.targetRateTo) + ', as carried with the EFFR for ' + D.shortDayY(e.effectiveDate) + '.');
    if (!effr.failed && !sofr.failed) {
      const es = D.nyfedSeries(effr.text), ss = D.nyfedSeries(sofr.text);
      parts.push(legend([['EFFR', 1], ['SOFR', 2], ['Target range (shaded)', 0]]));
      parts.push(charts.series([
        { name: 'EFFR', cls: 'chart__line', points: es.map((r) => ({ date: r.date, v: r.rate })) },
        { name: 'SOFR', cls: 'chart__line chart__line--2', points: ss.map((r) => ({ date: r.date, v: r.rate })) },
      ], { unit: 'pct', fmt: (v) => pct(v), band: es.filter((r) => fin(r.lo)).map((r) => ({ date: r.date, lo: r.lo, hi: r.hi })), bandName: 'Target range', label: 'EFFR and SOFR over the last year, with the target range.' }));
    }
    parts.push(nyfedNotice());
    overnight = panel('overnight', null, parts, { cls: 'bd-panel--wide' });
  } else {
    overnight = panel('overnight', null, ['The New York Fed could not be reached: ' + latest.failed.message]);
  }

  const rangeSeg = seg('Range', RANGES, state.range, (v) => { state.range = v; renderBackdrop('rates'); });
  const nodes = [
    el('div', 'bd-tools', null),
    section('The curve', 'Par yields for each term, with the week and month before for comparison.', [
      panel('curve', null, [legend([[D.shortDayY(last.date), 1], ['A week before', 2], ['A month before', 3]]), curveChart, curveTable], { cls: 'bd-panel--wide' }),
    ], 'bgrid bgrid--one'),
    section('Spreads and real yields', 'Over the range chosen above.', [spreadPanel('s2s10s', '10Y', '2Y'), spreadPanel('s3m10y', '10Y', '3M'), realPanel], 'bgrid'),
    section('Overnight rates', 'The rates the Fed steers and the repo market sets, for the previous business day.', [overnight], 'bgrid bgrid--one'),
  ];
  nodes[0].append(el('span', 'kicker', 'Range'), rangeSeg);
  return {
    nodes,
    status: [
      { got: nom.got, what: 'Daily par yield curve', asOf: 'figures for ' + D.longDay(last.date) },
      { got: real.got, what: 'Daily par real yield curve', asOf: real.rows.length ? 'figures for ' + D.longDay(real.rows[real.rows.length - 1].date) : '' },
      latest.failed ? null : { got: latest, what: 'Reference rates', asOf: '' },
    ].filter(Boolean),
  };
}

function nyfedNotice() {
  const box = el('div', 'bd-notice');
  [
    'The EFFR, OBFR, SOFR, TGCR and BGCR data are subject to the Terms of Use posted at newyorkfed.org. The New York Fed is not responsible for publication of these rates by The Curve Terminal, does not sanction or endorse any particular republication, and has no liability for your use.',
    'The SOFR and BGCR data are calculated using data provided under a license granted to the New York Fed by DTCC Solutions LLC ("Solutions"), an affiliate of The Depository Trust & Clearing Corporation. Solutions, its affiliates, and third parties from which they obtained data have no liability for the content of this material.',
    'The Curve Terminal is not affiliated with the New York Fed. The New York Fed does not sanction, endorse, or recommend any products or services offered by The Curve Terminal.',
    '© ' + thisYear() + ' Federal Reserve Bank of New York. Content from the New York Fed subject to the Terms of Use at newyorkfed.org.',
  ].forEach((t) => box.appendChild(el('p', '', t)));
  return box;
}

/* ------------------------------------------------------------ Auctions */

/* "9-Year 10-Month" is a reopened 10-year: group by the term it was first sold at */
function family(a) {
  if (a.kind === 'Bill') return a.term.replace(/-Week/, '-week') + ' bill';
  const m = /(\d+)-Year(?:\s+(\d+)-Month)?/.exec(a.term);
  const yrs = m ? +m[1] + (m[2] ? +m[2] / 12 : 0) : 0;
  const near = [2, 3, 5, 7, 10, 20, 30].reduce((b, x) => (Math.abs(x - yrs) < Math.abs(b - yrs) ? x : b), 2);
  const what = a.kind === 'TIPS' ? 'TIPS' : a.kind === 'FRN' ? 'FRN' : near >= 20 ? 'bond' : 'note';
  return a.kind === 'FRN' ? '2-year FRN' : near + '-year ' + what;
}

async function buildAuctions(force) {
  const got = await D.get('auctions', '', { maxAge: D.DAILY, force });
  const list = D.auctions(got.text);
  const done = list.filter((a) => a.done).sort((a, b) => (a.date < b.date ? 1 : -1));
  const next = list.filter((a) => !a.done).sort((a, b) => (a.date < b.date ? -1 : 1));
  const pick = (a) => (state.auc === 'bills' ? a.kind === 'Bill' : state.auc === 'coupons' ? a.kind !== 'Bill' : true);

  const security = (a) => a.term + ' ' + (a.kind === 'Bill' ? 'bill' : a.kind === 'Note' ? 'note' : a.kind === 'Bond' ? 'bond' : a.kind) + (a.reopening ? ', reopening' : '') + (a.cmb ? ', cash management' : '');
  const clears = (a) => (fin(a.high) ? pct(a.high, 3) + (a.highIs === 'Discount rate' ? ' discount' : a.highIs === 'Real yield' ? ' real' : '') : a.kind === 'FRN' ? 'margin, not in this list' : '');

  const upcoming = next.filter(pick);
  const nextPanel = panel('auctions', 'Announced, not yet held', [
    upcoming.length
      ? table(['Auction', 'Security', 'Offering', 'Bids close', 'Issued'], upcoming.map((a) => [D.shortDayY(a.date), security(a), bn(a.offering), a.closes ? a.closes.replace(/^0/, '').replace(' PM', ' pm').replace(' AM', ' am') + ' ET' : '', D.shortDayY(a.issue)]), { numeric: [2] })
      : 'None announced in this group at the moment.',
  ], { tag: int(upcoming.length) + ' announced' });

  const shown = done.filter(pick).slice(0, 60);
  const results = panel('auctions', 'Results, newest first', [
    table(['Auction', 'Security', 'Clears at', 'Bid-to-cover', 'Offered', 'Indirect', 'Direct', 'Dealers'],
      shown.map((a) => [D.shortDayY(a.date), security(a), clears(a), fin(a.btc) ? a.btc.toFixed(2) : '', bn(a.offering), share(a.indirect), share(a.direct), share(a.dealers)]),
      { numeric: [2, 3, 4, 5, 6, 7], cls: 'bd-tbl--scroll' }),
    'Shares are of the competitive amount accepted, worked out here from Treasury\'s figures. The list as fetched runs from ' + (done.length ? D.longDay(done[done.length - 1].date) : '') + ' to ' + (done.length ? D.longDay(done[0].date) : '') + '.',
  ], { cls: 'bd-panel--wide', tag: 'n ' + int(shown.length) });

  /* bid-to-cover, auction by auction, for one kind of security */
  const fams = new Map();
  for (const a of done.filter((x) => x.kind !== 'Bill' && fin(x.btc))) { const f = family(a); fams.set(f, (fams.get(f) || 0) + 1); }
  const choices = [...fams.entries()].filter(([, n]) => n >= 3).map(([f]) => f).sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b));
  if (!choices.includes(state.family)) state.family = choices.includes('10-year note') ? '10-year note' : choices[0] || '';
  let famPanel = null;
  if (state.family) {
    const pts = done.filter((a) => a.kind !== 'Bill' && family(a) === state.family && fin(a.btc)).slice().reverse();
    const fsel = el('select', 'inp inp--sm bd-select');
    fsel.setAttribute('aria-label', 'Security');
    choices.forEach((c) => fsel.appendChild(new Option(c, c)));
    fsel.value = state.family;
    fsel.addEventListener('change', () => { state.family = fsel.value; renderBackdrop('auctions'); });
    famPanel = panel('auctions', 'Bid-to-cover, auction by auction', [
      charts.series([{ name: 'Bid-to-cover', cls: 'chart__line', points: pts.map((a) => ({ date: a.date, v: a.btc })) }],
        { unit: 'plain', fmt: (v) => v.toFixed(2), label: 'Bid-to-cover for each ' + state.family + ' auction in the list.' }),
      pts.length ? 'Latest: ' + D.shortDayY(pts[pts.length - 1].date) + ', bid-to-cover ' + pts[pts.length - 1].btc.toFixed(2) + ', clearing at ' + clears(pts[pts.length - 1]) + '. Reopenings are counted with the term first sold.' : '',
    ], { extra: fsel, tag: 'n ' + int(pts.length) });
  }

  const tools = el('div', 'bd-tools');
  tools.append(el('span', 'kicker', 'Show'), seg('Securities', [['coupons', 'Notes, bonds, TIPS and FRNs'], ['bills', 'Bills'], ['all', 'All']], state.auc, (v) => { state.auc = v; renderBackdrop('auctions'); }));
  return {
    nodes: [tools, section('Coming up', 'As announced by Treasury.', [nextPanel], 'bgrid bgrid--one'), section('Results', 'What each auction sold, the rate it cleared at, and who bought it.', [results, famPanel], 'bgrid bgrid--one')],
    status: [{ got, what: 'Auction results', asOf: done.length ? 'latest auction ' + D.longDay(done[0].date) : '' }],
  };
}

/* ------------------------------------------------------------ Positioning */

/* [our code, CFTC market code, report, our name, the CFTC's name, group] */
export const MARKETS = [
  ['ES', '13874A', 'tff', 'E-mini S&P 500', 'E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE', 'Equity index'],
  ['NQ', '209742', 'tff', 'E-mini Nasdaq-100', 'NASDAQ MINI - CHICAGO MERCANTILE EXCHANGE', 'Equity index'],
  ['YM', '124603', 'tff', 'E-mini Dow ($5)', 'DJIA x $5 - CHICAGO BOARD OF TRADE', 'Equity index'],
  ['RTY', '239742', 'tff', 'E-mini Russell 2000', 'RUSSELL E-MINI - CHICAGO MERCANTILE EXCHANGE', 'Equity index'],
  ['ZT', '042601', 'tff', '2-Year T-Note', 'UST 2Y NOTE - CHICAGO BOARD OF TRADE', 'Interest rates'],
  ['ZF', '044601', 'tff', '5-Year T-Note', 'UST 5Y NOTE - CHICAGO BOARD OF TRADE', 'Interest rates'],
  ['ZN', '043602', 'tff', '10-Year T-Note', 'UST 10Y NOTE - CHICAGO BOARD OF TRADE', 'Interest rates'],
  ['TN', '043607', 'tff', 'Ultra 10-Year T-Note', 'ULTRA UST 10Y - CHICAGO BOARD OF TRADE', 'Interest rates'],
  ['ZB', '020601', 'tff', 'U.S. Treasury Bond', 'UST BOND - CHICAGO BOARD OF TRADE', 'Interest rates'],
  ['UB', '020604', 'tff', 'Ultra U.S. Treasury Bond', 'ULTRA UST BOND - CHICAGO BOARD OF TRADE', 'Interest rates'],
  ['SR3', '134741', 'tff', 'Three-Month SOFR', 'SOFR-3M - CHICAGO MERCANTILE EXCHANGE', 'Interest rates'],
  ['ZQ', '045601', 'tff', '30-Day Fed Funds', 'FED FUNDS - CHICAGO BOARD OF TRADE', 'Interest rates'],
  ['6E', '099741', 'tff', 'Euro FX', 'EURO FX - CHICAGO MERCANTILE EXCHANGE', 'Currencies'],
  ['6J', '097741', 'tff', 'Japanese Yen', 'JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE', 'Currencies'],
  ['6B', '096742', 'tff', 'British Pound', 'BRITISH POUND - CHICAGO MERCANTILE EXCHANGE', 'Currencies'],
  ['6A', '232741', 'tff', 'Australian Dollar', 'AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE', 'Currencies'],
  ['6C', '090741', 'tff', 'Canadian Dollar', 'CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE', 'Currencies'],
  ['6S', '092741', 'tff', 'Swiss Franc', 'SWISS FRANC - CHICAGO MERCANTILE EXCHANGE', 'Currencies'],
  ['CL', '067651', 'dis', 'Crude Oil (WTI)', 'WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE', 'Energy'],
  ['NG', '023651', 'dis', 'Henry Hub Natural Gas', 'NAT GAS NYME - NEW YORK MERCANTILE EXCHANGE', 'Energy'],
  ['RB', '111659', 'dis', 'RBOB Gasoline', 'GASOLINE RBOB - NEW YORK MERCANTILE EXCHANGE', 'Energy'],
  ['HO', '022651', 'dis', 'NY Harbor ULSD', 'NY HARBOR ULSD - NEW YORK MERCANTILE EXCHANGE', 'Energy'],
  ['GC', '088691', 'dis', 'Gold', 'GOLD - COMMODITY EXCHANGE INC.', 'Metals'],
  ['SI', '084691', 'dis', 'Silver', 'SILVER - COMMODITY EXCHANGE INC.', 'Metals'],
  ['HG', '085692', 'dis', 'Copper', 'COPPER- #1 - COMMODITY EXCHANGE INC.', 'Metals'],
  ['PL', '076651', 'dis', 'Platinum', 'PLATINUM - NEW YORK MERCANTILE EXCHANGE', 'Metals'],
  ['ZC', '002602', 'dis', 'Corn', 'CORN - CHICAGO BOARD OF TRADE', 'Grains'],
  ['ZS', '005602', 'dis', 'Soybeans', 'SOYBEANS - CHICAGO BOARD OF TRADE', 'Grains'],
  ['ZW', '001602', 'dis', 'Chicago SRW Wheat', 'WHEAT-SRW - CHICAGO BOARD OF TRADE', 'Grains'],
];
const MAIN = { tff: ['lev', 'asset', 'dealer'], dis: ['mm', 'prod', 'swap'] };
const SHORTNAME = { dealer: 'Dealers', asset: 'Asset mgrs', lev: 'Lev. funds', other: 'Other', small: 'Non-rep.', prod: 'Producers', swap: 'Swap dealers', mm: 'Managed money' };

async function buildPositioning(force) {
  const m = MARKETS.find((x) => x[0] === state.market) || MARKETS[0];
  const [code, cftcCode, report, name, cftcName] = m;
  const got = await D.get(report === 'tff' ? 'cftc-tff' : 'cftc-dis', cftcCode, { maxAge: D.WEEKLY, force });
  const rows = D.cftc(got.text, report);
  if (rows.length < 2) throw new Error('The CFTC sent too few weeks for ' + name + '.');
  const last = rows[rows.length - 1], prev = rows[rows.length - 2];
  const groups = D.GROUPS[report];

  const sel = el('select', 'inp inp--sm bd-select');
  sel.setAttribute('aria-label', 'Market');
  for (const grp of [...new Set(MARKETS.map((x) => x[5]))]) {
    const og = document.createElement('optgroup');
    og.label = grp;
    MARKETS.filter((x) => x[5] === grp).forEach((x) => og.appendChild(new Option(x[0] + ' · ' + x[3], x[0])));
    sel.appendChild(og);
  }
  sel.value = code;
  sel.addEventListener('change', () => { state.market = sel.value; renderBackdrop('positioning'); });
  const tools = el('div', 'bd-tools');
  tools.append(el('span', 'kicker', 'Market'), sel, el('span', 'kicker', 'Range'),
    seg('Range', [['1y', '1 year'], ['3y', '3 years'], ['all', 'All']], state.posRange, (v) => { state.posRange = v; renderBackdrop('positioning'); }));

  const tbl = table(['Group', 'Long', 'Short', 'Net', 'Net, change on the week', 'Net as share of open interest'],
    [...groups.map(([k, label]) => {
      const g = last.g[k], p = prev.g[k];
      return [label, int(g.long), int(g.short), sint(g.net), fin(p.net) ? sint(g.net - p.net) : '', fin(last.oi) && last.oi ? signed((g.net / last.oi) * 100, 1) + '%' : ''];
    }), ['Open interest', int(last.oi), '', '', fin(prev.oi) ? sint(last.oi - prev.oi) : '', '']],
    { numeric: [1, 2, 3, 4, 5] });

  const bars = charts.netBars(groups.map(([k, label]) => ({
    name: label, tag: SHORTNAME[k], net: last.g[k].net, long: last.g[k].long, short: last.g[k].short,
    extra: [['Change on the week', sint(last.g[k].net - prev.g[k].net)]],
  })), { fmt: (v, s = true) => (s ? sint(v) : int(v)) + ' contracts', label: 'Net positions by group on ' + D.longDay(last.date) + '.' });

  const from = rangeStart(state.posRange, last.date);
  const span = rows.filter((r) => r.date >= from);
  const lines = MAIN[report].map((k, i) => ({ name: groups.find((g) => g[0] === k)[1], cls: 'chart__line' + (i ? ' chart__line--' + (i + 1) : ''), points: span.map((r) => ({ date: r.date, v: r.g[k].net })) }));
  const hist = charts.series(lines, { unit: 'contracts', zero: true, fmt: (v) => sint(v) + ' contracts', label: 'Net positions of ' + lines.map((l) => l.name).join(', ') + ' over ' + span.length + ' weeks.' });

  const asOf = 'Positions on ' + D.weekday(last.date) + ' ' + D.longDay(last.date) + '. The CFTC publishes them on the Friday after, usually at 3:30 pm ET; a federal holiday can move that by a day or two.';
  return {
    nodes: [
      tools,
      el('p', 'note bd-asof', name + ' (' + code + '), reported by the CFTC as "' + cftcName + '", ' + (report === 'tff' ? 'in the Traders in Financial Futures report' : 'in the Disaggregated report') + ', futures only. ' + asOf),
      section('This week', 'Each group\'s contracts, long and short. Net is long minus short.', [
        panel('cot', 'By group', [bars, tbl], { cls: 'bd-panel--wide', tag: 'Week of ' + D.shortDayY(last.date) }),
      ], 'bgrid bgrid--one'),
      section('Over time', 'Net positions of three of the groups, week by week. The table above has all five.', [
        panel('cot', 'Net positions', [legend(lines.map((l, i) => [l.name, i + 1])), hist, 'Weekly since ' + D.longDay(span[0].date) + '; the CFTC\'s history for this market in this report starts ' + D.longDay(rows[0].date) + '.'], { cls: 'bd-panel--wide', tag: 'n ' + int(span.length) }),
      ], 'bgrid bgrid--one'),
    ],
    status: [{ got, what: report === 'tff' ? 'Traders in Financial Futures' : 'Disaggregated report', asOf: 'positions on ' + D.longDay(last.date) }],
  };
}

/* ------------------------------------------------------------ Energy */

const EIA = [
  ['WCESTUS1', 'Commercial crude oil', 'Excluding the Strategic Petroleum Reserve'],
  ['WGTSTUS1', 'Total gasoline', 'Finished gasoline and blending components'],
  ['WDISTUS1', 'Distillate fuel oil', 'Diesel and heating oil'],
  ['WCSSTUS1', 'Strategic Petroleum Reserve', 'Crude held by the US government'],
];

/* the same week in the five years before: lowest, highest and average */
function fiveYear(rows, iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const vals = [];
  for (let k = 1; k <= 5; k++) {
    const target = Date.UTC(y - k, m - 1, d);
    let best = null;
    for (const r of rows) {
      const gap = Math.abs(Date.parse(r.date + 'T00:00:00Z') - target);
      if (gap <= 3.5 * 864e5 && (!best || gap < best.gap)) best = { v: r.v, gap };
    }
    if (best) vals.push(best.v);
  }
  if (vals.length < 5) return null;
  return { lo: Math.min(...vals), hi: Math.max(...vals), avg: vals.reduce((a, b) => a + b, 0) / vals.length };
}

async function buildEnergy(force) {
  const out = [];
  const status = [];
  let release = null;
  for (const [series, title, sub] of EIA) {
    try {
      const got = await D.get('eia', series, { maxAge: D.WEEKLY, force });
      const e = D.eia(got.text);
      if (!release) release = e;
      status.push({ got, what: title, asOf: 'week ending ' + D.longDay(e.rows[e.rows.length - 1].date) });
      out.push({ title, sub, rows: e.rows, got });
    } catch (err) {
      out.push({ title, sub, error: err.message });
    }
  }
  const panels = out.map((s) => {
    if (s.error) return panel('energy', s.title, [s.error]);
    const rows = s.rows, last = rows[rows.length - 1], prev = rows[rows.length - 2];
    const yago = onOrBefore(rows, D.addDays(last.date, -364));
    const fy = fiveYear(rows, last.date);
    const recent = rows.slice(-53);
    const band = recent.map((r) => { const f = fiveYear(rows, r.date); return f ? { date: r.date, lo: f.lo / 1000, hi: f.hi / 1000 } : null; }).filter(Boolean);
    const lines = [s.sub + '.',
      'Week ending ' + D.shortDayY(last.date) + ': ' + mb(last.v) + ' million barrels; ' + mbs(last.v - prev.v) + ' on the week' + (yago ? ', ' + mbs(last.v - yago.v) + ' on a year before' : '') + '.',
      fy ? 'The same week in the five years before: ' + mb(fy.lo) + ' to ' + mb(fy.hi) + ', ' + mb(fy.avg) + ' on average (worked out here).' : 'Not enough history here for a five-year range.'];
    return panel('energy', s.title, [
      charts.series([{ name: s.title, cls: 'chart__line', points: recent.map((r) => ({ date: r.date, v: r.v / 1000 })) }],
        { unit: 'mb', fmt: (v) => v.toFixed(1) + ' million barrels', band, bandName: 'Five years before', label: s.title + ' over the last year, with the range for each week in the five years before.' }),
      ...lines,
    ], { tag: 'million barrels' });
  });
  const relLine = release && release.released
    ? 'EIA released these on ' + D.longDay(release.released) + (release.next ? '; its next release is ' + D.longDay(release.next) : '') + ' (EIA\'s own dates). Lines are the last year; the shaded range is the lowest and highest for the same week in the five years before.'
    : '';
  if (!status.length) throw new Error('None of the EIA series could be fetched.');
  return {
    nodes: [el('p', 'note bd-asof', relLine), legend([['This year', 1], ['Range, five years before (shaded)', 0]]), section('Stocks', 'Weekly, from the Weekly Petroleum Status Report.', panels, 'bgrid')],
    status,
  };
}

/* ------------------------------------------------------------ Currencies */

const CUR = {
  USD: 'US dollar', JPY: 'Japanese yen', GBP: 'Pound sterling', CHF: 'Swiss franc', AUD: 'Australian dollar', CAD: 'Canadian dollar',
  CNY: 'Chinese yuan renminbi', INR: 'Indian rupee', HKD: 'Hong Kong dollar', SGD: 'Singapore dollar', KRW: 'South Korean won',
  NZD: 'New Zealand dollar', SEK: 'Swedish krona', NOK: 'Norwegian krone', DKK: 'Danish krone', CZK: 'Czech koruna', HUF: 'Hungarian forint',
  PLN: 'Polish zloty', RON: 'Romanian leu', ISK: 'Icelandic krona', TRY: 'Turkish lira', BRL: 'Brazilian real', MXN: 'Mexican peso',
  IDR: 'Indonesian rupiah', ILS: 'Israeli shekel', MYR: 'Malaysian ringgit', PHP: 'Philippine peso', THB: 'Thai baht', ZAR: 'South African rand',
};
const FIRST = ['USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'CNY', 'INR'];
const FX2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = (v) => (fin(v) ? (v >= 1000 ? FX2.format(v) : v >= 100 ? v.toFixed(2) : v >= 10 ? v.toFixed(3) : v.toFixed(4)) : '');

async function buildCurrencies(force) {
  const got = await D.get('ecb-90d', '', { maxAge: D.DAILY, force });
  const days = D.ecb(got.text);
  if (days.length < 2) throw new Error('The ECB file has too few days.');
  const last = days[days.length - 1], prev = days[days.length - 2];
  const codes = Object.keys(last.r).sort((a, b) => {
    const ia = FIRST.indexOf(a), ib = FIRST.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b);
  });
  const usd = last.r.USD;
  const rows = codes.map((c) => {
    const vals = days.map((d) => d.r[c]).filter(fin);
    const ch = fin(prev.r[c]) ? ((last.r[c] - prev.r[c]) / prev.r[c]) * 100 : null;
    return [c + ' · ' + (CUR[c] || c), fx(last.r[c]), fin(ch) ? signed(ch, 2) + '%' : '', fx(Math.min(...vals)), fx(Math.max(...vals)), c === 'USD' || !fin(usd) ? '' : fx(last.r[c] / usd)];
  });
  if (!last.r[state.fx]) state.fx = 'USD';
  const sel = el('select', 'inp inp--sm bd-select');
  sel.setAttribute('aria-label', 'Currency');
  codes.forEach((c) => sel.appendChild(new Option(c + ' · ' + (CUR[c] || c), c)));
  sel.value = state.fx;
  sel.addEventListener('change', () => { state.fx = sel.value; renderBackdrop('currencies'); });
  const pts = days.filter((d) => fin(d.r[state.fx])).map((d) => ({ date: d.date, v: d.r[state.fx] }));
  return {
    nodes: [
      el('p', 'note bd-asof', 'Reference rates for ' + D.weekday(last.date) + ' ' + D.longDay(last.date) + ', against ' + D.longDay(prev.date) + '. Published by the ECB for information only; the ECB discourages using them for transactions. The changes, the 90-day low and high, and the rates per US dollar are worked out here from the ECB\'s figures.'),
      section('Against the euro', 'Units of each currency for one euro.', [
        panel('fx', 'The last 90 days', [charts.series([{ name: state.fx + ' per euro', cls: 'chart__line', points: pts }], { unit: 'rate', fmt: fx, label: state.fx + ' per euro over ' + pts.length + ' ECB days.' })], { extra: sel, cls: 'bd-panel--wide', tag: 'n ' + int(pts.length) }),
        panel('fx', 'Every currency the ECB quotes', [table(['Currency', 'Per euro', 'On the previous ECB day', '90-day low', '90-day high', 'Per US dollar (worked out)'], rows, { numeric: [1, 2, 3, 4, 5] })], { cls: 'bd-panel--wide', tag: int(codes.length) + ' currencies' }),
      ], 'bgrid bgrid--one'),
    ],
    status: [{ got, what: 'Euro foreign exchange reference rates', asOf: 'rates for ' + D.longDay(last.date) }],
  };
}

/* ------------------------------------------------------------ Releases */

async function buildReleases(force) {
  const now = Date.now();
  const startOfToday = wallToUtc(todayET() + 'T00:00', ET);
  const horizon = state.rel === 'all' ? Infinity : now + +state.rel * 864e5;
  const items = SCH.EVENTS.filter((e) => e.at >= startOfToday && e.at <= horizon).map((e) => ({ ...e }));
  let got = null, aucNote = '';
  try {
    got = await D.get('auctions', '', { maxAge: D.DAILY, force });
    for (const a of D.auctions(got.text).filter((x) => !x.done)) {
      const t = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(a.closes || '');
      const hh = t ? ((+t[1] % 12) + (/pm/i.test(t[3]) ? 12 : 0)) : 12;
      const at = wallToUtc(a.date + 'T' + String(hh).padStart(2, '0') + ':' + (t ? t[2] : '00'), ET);
      if (at < startOfToday || at > horizon) continue;
      items.push({ date: a.date, time: t ? 'x' : '', at, what: 'Treasury auction: ' + a.term.replace(/-(Week|Year|Month)/g, (m, w) => '-' + w.toLowerCase()) + ' ' + (a.kind === 'Bill' ? 'bill' : a.kind.toLowerCase()) + (fin(a.offering) ? ', ' + bn(a.offering) : ''), agency: 'Treasury', note: 'The time shown is when competitive bids close', url: 'https://www.treasurydirect.gov/auctions/upcoming/' });
    }
  } catch (e) {
    aucNote = 'Treasury auctions are not listed: ' + e.message;
  }
  items.sort((a, b) => a.at - b.at || a.what.localeCompare(b.what));

  const list = el('div', 'bd-rel');
  let day = '';
  let ul = null;
  for (const e of items) {
    const d = longDateET(e.at);
    if (d !== day) {
      day = d;
      list.appendChild(el('h3', 'kicker bd-rel__day', d));
      ul = el('ul', 'bd-rel__list');
      list.appendChild(ul);
    }
    const li = el('li', 'bd-rel__item' + (e.at < now && e.time ? ' is-past' : ''));
    li.appendChild(el('span', 'bd-rel__time', e.time ? timeBoth(e.at) : 'No time given'));
    const what = el('span', 'bd-rel__what');
    what.appendChild(el('span', 'bd-rel__name', e.what));
    if (e.note) what.appendChild(el('span', 'bd-rel__note', e.note));
    li.appendChild(what);
    li.appendChild(el('span', 'bd-rel__agency kicker', e.agency));
    li.appendChild(sourceButton('Schedule', e.url));
    ul.appendChild(li);
  }
  if (!items.length) list.appendChild(el('p', 'empty', 'Nothing scheduled in this range.'));

  const tools = el('div', 'bd-tools');
  tools.append(el('span', 'kicker', 'Show'), seg('Range', [['7', 'Next 7 days'], ['30', 'Next 30 days'], ['90', 'Next 90 days'], ['all', 'Everything published']], state.rel, (v) => { state.rel = v; renderBackdrop('releases'); }));
  const reach = Object.entries(SCH.REACH).map(([a, d]) => a + ' to ' + d).join('; ');
  return {
    nodes: [
      tools,
      el('p', 'note bd-asof', 'Scheduled dates and times from each agency\'s own published calendar, checked on ' + SCH.CHECKED + '. The published schedules reach: ' + reach + '. Agencies can move a release; each entry opens the page its date came from. There are no forecasts or consensus figures here.' + (aucNote ? ' ' + aucNote : '')),
      panel('calendar', 'Scheduled releases', [list], { cls: 'bd-panel--wide', tag: int(items.length) + ' scheduled' }),
    ],
    status: got ? [{ got, what: 'Announced auctions', asOf: '' }] : [],
  };
}

/* ------------------------------------------------------------ The Fed's press releases */

async function buildWire(force) {
  const got = await D.get('fed-press', '', { maxAge: D.DAILY, force });
  const items = D.rss(got.text).sort((a, b) => b.at - a.at).slice(0, 40);
  const list = el('ul', 'bd-wire');
  for (const i of items) {
    const li = el('li', 'bd-wire__item');
    const meta = el('p', 'bd-wire__meta kicker', (fin(i.at) ? shortDateET(i.at) + ' · ' + timeBoth(i.at) : '') + (i.category ? ' · ' + i.category : ''));
    li.append(meta, el('p', 'bd-wire__title', i.title));
    if (i.link) li.appendChild(sourceButton('Read it on federalreserve.gov', i.link));
    list.appendChild(li);
  }
  if (!items.length) list.appendChild(el('li', 'empty', 'The feed had no releases in it.'));
  return {
    nodes: [panel('wire', 'Press releases, newest first', [list], { cls: 'bd-panel--wide', tag: 'n ' + int(items.length) })],
    status: [{ got, what: 'Press releases feed', asOf: items.length && fin(items[0].at) ? 'latest ' + shortDateET(items[0].at) : '' }],
  };
}

/* ------------------------------------------------------------ How it connects */

/* a panel with a plain title, for the guide's own text */
function textPanel(title, parts, { cls = '', extra = null } = {}) {
  const art = el('article', 'cpanel bd-panel gd-panel glass glass--quiet' + (cls ? ' ' + cls : ''));
  const head = el('div', 'stat__head');
  head.appendChild(el('h3', 'gd-title', title));
  if (extra) head.appendChild(extra);
  art.appendChild(head);
  for (const p of parts.filter(Boolean)) art.appendChild(typeof p === 'string' ? el('p', 'gd-p', p) : p);
  return art;
}

/* "In Atlas now": label, figure, and where and when it is from */
function factList(rows) {
  const ul = el('ul', 'gd-facts');
  for (const [k, v, note] of rows) {
    const li = el('li', 'gd-fact');
    li.append(el('span', 'gd-fact__k', k), el('span', 'gd-fact__v', v || ''));
    if (note) li.appendChild(el('span', 'gd-fact__n', note));
    ul.appendChild(li);
  }
  return ul;
}

/* the latest Treasury curve, with enough of last year for a month's change */
async function recentCurve(id, force) {
  const y = thisYear();
  const cur = await D.get(id, String(y), { maxAge: D.DAILY, force });
  const parts = [D.treasury(cur.text)];
  if (parts[0].rows.length < 30) {
    try { parts.unshift(D.treasury((await D.get(id, String(y - 1), { maxAge: 24 * 30 })).text)); } catch (e) { /* the month's change is left out */ }
  }
  return { ...D.joinYears(parts), got: cur };
}

const by = (who, iso) => who + ', ' + D.shortDayY(iso);

/* fill each topic's facts as its source arrives, and keep the status line current */
async function connectFacts(root, force, setStatus, alive) {
  const gots = [];
  const put = (id, rows) => { if (!alive()) return; const box = root.querySelector('[data-fact="' + id + '"]'); if (box) box.replaceChildren(factList(rows)); };
  const fail = (id, e) => put(id, [['Not available', '', String(e && e.message ? e.message : e)]]);
  const seen = (got, what, asOf) => { if (got && alive()) { gots.push({ got, what, asOf }); setStatus(gots); } };
  const change = (rows, last, key, back) => { const b = onOrBefore(rows, back); return b && fin(b.v[key]) && fin(last.v[key]) ? last.v[key] - b.v[key] : null; };

  const jobs = [
    (async () => {
      try {
        const c = await recentCurve('tsy-nominal', force);
        const last = c.rows[c.rows.length - 1];
        const mo = monthBack(last.date);
        const s210 = (r) => (r && fin(r.v['10Y']) && fin(r.v['2Y']) ? r.v['10Y'] - r.v['2Y'] : null);
        const before = onOrBefore(c.rows, mo);
        put('curve', [
          ['2-year yield', pct(last.v['2Y']), bp(change(c.rows, last, '2Y', mo)) + ' on the month'],
          ['10-year yield', pct(last.v['10Y']), bp(change(c.rows, last, '10Y', mo)) + ' on the month'],
          ['2s10s', pp(s210(last)), before ? 'from ' + pp(s210(before)) + ' a month before' : ''],
          ['3m10y', pp(last.v['10Y'] - last.v['3M']), ''],
          ['Figures for', D.longDay(last.date), 'US Treasury, daily par yield curve'],
        ]);
        seen(c.got, 'Daily par yield curve', 'figures for ' + D.longDay(last.date));
      } catch (e) { fail('curve', e); }
    })(),
    (async () => {
      try {
        const c = await recentCurve('tsy-real', force);
        const last = c.rows[c.rows.length - 1];
        put('real', [
          ['10-year real yield', pct(last.v['10Y']), by('US Treasury', last.date)],
          ['On the week', bp(change(c.rows, last, '10Y', D.addDays(last.date, -7))), ''],
          ['On the month', bp(change(c.rows, last, '10Y', monthBack(last.date))), ''],
          ['5-year real yield', pct(last.v['5Y']), bp(change(c.rows, last, '5Y', monthBack(last.date))) + ' on the month'],
        ]);
        seen(c.got, 'Daily par real yield curve', 'figures for ' + D.longDay(last.date));
      } catch (e) { fail('real', e); }
    })(),
    (async () => {
      try {
        const got = await D.get('nyfed-latest', '', { maxAge: D.DAILY, force });
        const L = D.nyfedLatest(got.text), e = L.EFFR, s = L.SOFR;
        const fomc = SCH.EVENTS.find((x) => x.agency === 'Fed' && x.at >= Date.now() - 864e5);
        put('fed', [
          ['Fed funds target range', e && fin(e.targetRateFrom) ? pct(e.targetRateFrom) + ' to ' + pct(e.targetRateTo) : '', e ? 'as carried with the EFFR for ' + D.shortDayY(e.effectiveDate) : ''],
          ['EFFR', e ? pct(e.percentRate) : '', e ? by('New York Fed', e.effectiveDate) : ''],
          ['SOFR', s ? pct(s.percentRate) : '', s ? by('New York Fed', s.effectiveDate) : ''],
          ['Next FOMC meeting ends', fomc ? longDateET(fomc.at) : 'not in the published calendar', fomc ? 'Fed meeting calendar' : ''],
        ]);
        seen(got, 'Reference rates', '');
      } catch (e) { fail('fed', e); }
    })(),
    (async () => {
      try {
        const got = await D.get('auctions', '', { maxAge: D.DAILY, force });
        const list = D.auctions(got.text);
        const done = list.filter((a) => a.done).sort((a, b) => (a.date < b.date ? 1 : -1));
        const row = (fam) => {
          const a = done.find((x) => x.kind !== 'Bill' && family(x) === fam && fin(x.btc));
          return a ? [fam + ', ' + D.shortDayY(a.date), pct(a.high, 3), 'bid-to-cover ' + a.btc.toFixed(2) + ', indirect ' + share(a.indirect)] : [fam, 'none in the list', ''];
        };
        const next = list.filter((a) => !a.done && a.kind !== 'Bill').sort((a, b) => (a.date < b.date ? -1 : 1))[0];
        put('auctions', [
          row('10-year note'), row('30-year bond'),
          ['Next note or bond auction', next ? D.shortDayY(next.date) : 'none announced yet', next ? next.term + ' ' + next.kind.toLowerCase() + (fin(next.offering) ? ', ' + bn(next.offering) : '') : 'Treasury announces each a few days ahead'],
        ]);
        seen(got, 'Auction results', '');
      } catch (e) { fail('auctions', e); }
    })(),
    (async () => {
      try {
        const got = await D.get('ecb-90d', '', { maxAge: D.DAILY, force });
        const days = D.ecb(got.text), last = days[days.length - 1];
        const then = onOrBefore(days, monthBack(last.date)) || days[0];
        const ch = (a, b) => (fin(a) && fin(b) ? signed(((a - b) / b) * 100, 2) + '%' : '');
        const jpy = (d) => (d.r.JPY && d.r.USD ? d.r.JPY / d.r.USD : null);
        put('dollar', [
          ['US dollars per euro', fx(last.r.USD), by('ECB', last.date)],
          ['On the month', ch(last.r.USD, then.r.USD), 'a fall means a stronger dollar against the euro'],
          ['Yen per US dollar', fx(jpy(last)), 'worked out here from the ECB\'s euro rates; ' + ch(jpy(last), jpy(then)) + ' on the month'],
        ]);
        seen(got, 'Euro reference rates', 'rates for ' + D.longDay(last.date));
      } catch (e) { fail('dollar', e); }
    })(),
    (async () => {
      try {
        const got = await D.get('cftc-tff', '209742', { maxAge: D.WEEKLY, force });
        const rows = D.cftc(got.text, 'tff'), last = rows[rows.length - 1], prev = rows[rows.length - 2];
        const span = rows.filter((r) => r.date >= monthBack(last.date, 36));
        const lev = span.map((r) => r.g.lev.net).filter(fin);
        put('positioning', [
          ['Leveraged funds, net', sint(last.g.lev.net), sint(last.g.lev.net - prev.g.lev.net) + ' on the week'],
          ['Their range over 3 years', sint(Math.min(...lev)) + ' to ' + sint(Math.max(...lev)), 'net contracts, weekly'],
          ['Asset managers, net', sint(last.g.asset.net), sint(last.g.asset.net - prev.g.asset.net) + ' on the week'],
          ['Dealers, net', sint(last.g.dealer.net), sint(last.g.dealer.net - prev.g.dealer.net) + ' on the week'],
          ['Positions on', D.weekday(last.date) + ' ' + D.longDay(last.date), 'CFTC, NASDAQ MINI, futures only'],
        ]);
        seen(got, 'Traders in Financial Futures, NQ', 'positions on ' + D.longDay(last.date));
      } catch (e) { fail('positioning', e); }
    })(),
    (async () => {
      try {
        const got = await D.get('eia', 'WCESTUS1', { maxAge: D.WEEKLY, force });
        const e = D.eia(got.text), rows = e.rows, last = rows[rows.length - 1], prev = rows[rows.length - 2];
        const fy = fiveYear(rows, last.date);
        put('energy', [
          ['Commercial crude stocks', mb(last.v) + ' million barrels', 'week ending ' + D.shortDayY(last.date) + ', EIA'],
          ['On the week', mbs(last.v - prev.v), ''],
          ['Against the same week, five years before', fy ? mbs(last.v - fy.avg) + ' from the average' : 'not enough history here', fy ? 'range ' + mb(fy.lo) + ' to ' + mb(fy.hi) + ' (worked out here)' : ''],
          ['Next EIA release', e.next ? D.longDay(e.next) : '', 'EIA\'s own date'],
        ]);
        seen(got, 'Commercial crude oil', 'week ending ' + D.longDay(last.date));
      } catch (e) { fail('energy', e); }
    })(),
  ];
  /* the calendar ships with the app: no fetch */
  const next = SCH.EVENTS.filter((x) => x.at >= Date.now() && x.agency !== 'EIA' && x.agency !== 'CFTC').slice(0, 5);
  put('releases', next.length ? next.map((x) => [x.what, '', (x.time ? shortDateET(x.at) + ', ' + timeBoth(x.at) : longDateET(x.at)) + ' · ' + x.agency + ' schedule']) : [['Nothing scheduled', '', 'in the calendars checked on ' + SCH.CHECKED]]);
  await Promise.all(jobs);
}

async function buildConnects() {
  const g = GUIDE[state.index] || GUIDE.NQ;
  const idx = INDICES.find((i) => i.code === state.index) || INDICES[0];

  const sel = el('select', 'inp inp--sm bd-select');
  sel.setAttribute('aria-label', 'Explained for');
  INDICES.forEach((i) => {
    const o = new Option(i.code + ' · ' + i.name + (i.ready ? '' : ' (a later update)'), i.code);
    o.disabled = !i.ready;
    sel.appendChild(o);
  });
  sel.value = idx.code;
  sel.addEventListener('change', () => { if ((INDICES.find((i) => i.code === sel.value) || {}).ready) { state.index = sel.value; renderBackdrop('connects'); } });
  const tools = el('div', 'bd-tools');
  tools.append(el('span', 'kicker', 'Explained for'), sel);

  const open = (page, name, market) => {
    const b = el('button', 'link bd-srclink', 'Open ' + name);
    b.type = 'button';
    b.addEventListener('click', () => { if (market) state.market = market; location.hash = '#/' + page; });
    return b;
  };
  const block = (k, v) => { const d = el('div', 'gd-block'); d.append(el('p', 'kicker gd-k', k), el('p', 'gd-p', v)); return d; };

  const topics = g.topics.map((t, i) => {
    const facts = el('div', 'gd-now');
    facts.append(el('p', 'kicker gd-k', 'In Atlas now'));
    const slot = el('div', 'gd-slot');
    slot.dataset.fact = t.id;
    slot.appendChild(el('p', 'gd-wait', 'Reading Atlas\'s last copy.'));
    facts.appendChild(slot);
    const cols = el('div', 'gd-cols');
    const text = el('div', 'gd-text');
    text.append(block('The link', t.link), block('How it is usually read', t.read), block('Where that read goes wrong', t.wrong));
    cols.append(text, facts);
    return textPanel((i + 1) + '. ' + t.title, [cols], { cls: 'bd-panel--wide', extra: open(t.page, t.pageName, t.page === 'positioning' ? idx.code : null) });
  });

  const steps = el('ol', 'gd-steps');
  g.together.steps.forEach((s) => steps.appendChild(el('li', '', s)));
  const regimes = el('dl', 'gd-regimes');
  g.regimes.list.forEach(([k, v]) => { regimes.append(el('dt', '', k), el('dd', '', v)); });

  return {
    nodes: [
      tools,
      el('p', 'note bd-asof', 'Written for ' + idx.code + ' first. ' + INDICES.filter((i) => !i.ready).map((i) => i.code).join(', ') + ' follow in a later update. Each topic says how it is linked to ' + idx.code + ', how that link is usually read, and where the read goes wrong; beside it are the figures Atlas holds now, as plain facts with their source and date.'),
      section('Before you read on', '', [textPanel(idx.code + ' and the background', [...g.intro, ...g.caution.map((c) => { const p = el('p', 'gd-p gd-caution', c); return p; })], { cls: 'bd-panel--wide' })], 'bgrid bgrid--one'),
      section('Topic by topic', 'Each part of Atlas, as it relates to ' + idx.code + '.', topics, 'bgrid bgrid--one'),
      section('Putting it together', '', [
        textPanel('Reading the background', [g.together.lead, steps, ...g.together.after], { cls: 'bd-panel--wide' }),
        textPanel('Words used for regimes', [g.regimes.lead, regimes, block('Where these words go wrong', g.regimes.wrong)], { cls: 'bd-panel--wide' }),
      ], 'bgrid bgrid--one'),
    ],
    status: [],
    after: (setStatus, alive, root, force) => connectFacts(root, force, setStatus, alive),
  };
}

/* ------------------------------------------------------------ This week */

/* What changed in the published figures this week (Monday to today, New
   York time), source by source. A daily figure is compared with the last
   one before Monday; a weekly report with the one before it. Every line
   names both dates. Events (auctions, the Fed's releases) are the ones
   dated this week. Facts only: nothing here says what they mean for prices. */
const weekday0 = (iso) => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;
const shortD = (iso) => D.weekday(iso).slice(0, 3) + ' ' + D.shortDay(iso);
/* net positions in words: "net short 4,100 more contracts" */
function netMove(now, prev) {
  if (!fin(now) || !fin(prev)) return '';
  const d = now - prev, a = int(Math.abs(d));
  if (d === 0) return 'unchanged';
  if (now < 0 && prev < 0) return 'net short ' + a + (d < 0 ? ' more' : ' fewer') + ' contracts';
  if (now > 0 && prev > 0) return 'net long ' + a + (d > 0 ? ' more' : ' fewer') + ' contracts';
  return 'from net ' + (prev >= 0 ? 'long ' : 'short ') + int(Math.abs(prev)) + ' to net ' + (now >= 0 ? 'long ' : 'short ') + int(Math.abs(now));
}

async function buildWeek(force) {
  const today = todayET(), monday = D.addDays(today, -weekday0(today)), before = D.addDays(monday, -1);
  const status = [];
  const seen = (got, what, asOf) => { if (got) status.push({ got, what, asOf }); };
  const fail = (title, e) => textPanel(title, [factList([['Not available', '', String(e && e.message ? e.message : e)]])]);
  /* a daily series this week: [value now, change, note] from rows of { date, v } */
  const daily = (rows, label, fmt, diff) => {
    const last = rows[rows.length - 1], base = onOrBefore(rows, before);
    if (!last) return [label, '', 'no figures in the copy'];
    if (last.date < monday) return [label, 'no new figure yet', fmt(last.v) + ' on ' + shortD(last.date) + ', the latest'];
    if (!base) return [label, fmt(last.v), 'on ' + shortD(last.date) + '; nothing from before Monday in the copy'];
    return [label, diff(last.v, base.v), fmt(last.v) + ' on ' + shortD(last.date) + ', from ' + fmt(base.v) + ' on ' + shortD(base.date)];
  };
  const bpDiff = (a, b) => bp(a - b);
  const jobs = {
    yields: (async () => {
      const c = await recentCurve('tsy-nominal', force);
      const pick = (k) => c.rows.filter((r) => fin(r.v[k])).map((r) => ({ date: r.date, v: r.v[k] }));
      const s210 = c.rows.filter((r) => fin(r.v['10Y']) && fin(r.v['2Y'])).map((r) => ({ date: r.date, v: r.v['10Y'] - r.v['2Y'] }));
      seen(c.got, 'Daily par yield curve', 'figures for ' + D.longDay(c.rows[c.rows.length - 1].date));
      return textPanel('Treasury yields', [factList([
        daily(pick('2Y'), '2-year yield', pct, bpDiff),
        daily(pick('10Y'), '10-year yield', pct, bpDiff),
        daily(pick('30Y'), '30-year yield', pct, bpDiff),
        daily(s210, '2s10s', pp, bpDiff),
      ]), 'US Treasury, daily par yield curve. Changes in basis points; 2s10s is worked out here.']);
    })(),
    real: (async () => {
      const c = await recentCurve('tsy-real', force);
      const pick = (k) => c.rows.filter((r) => fin(r.v[k])).map((r) => ({ date: r.date, v: r.v[k] }));
      seen(c.got, 'Daily par real yield curve', 'figures for ' + D.longDay(c.rows[c.rows.length - 1].date));
      return textPanel('Real yields', [factList([daily(pick('5Y'), '5-year real yield', pct, bpDiff), daily(pick('10Y'), '10-year real yield', pct, bpDiff)]), 'US Treasury, daily par real yield curve (TIPS).']);
    })(),
    fed: (async () => {
      const [ge, gs] = await Promise.all([D.get('nyfed-effr', '1y', { maxAge: D.DAILY, force }), D.get('nyfed-sofr', '1y', { maxAge: D.DAILY, force })]);
      const ser = (got) => D.nyfedSeries(got.text).map((r) => ({ date: r.date, v: r.rate }));
      const e = ser(ge), s = ser(gs);
      seen(ge, 'EFFR', e.length ? 'rate for ' + D.longDay(e[e.length - 1].date) : '');
      seen(gs, 'SOFR', s.length ? 'rate for ' + D.longDay(s[s.length - 1].date) : '');
      return textPanel('Overnight rates', [factList([daily(e, 'EFFR', pct, bpDiff), daily(s, 'SOFR', pct, bpDiff)]), 'New York Fed. Each rate is for the business day before it is published.']);
    })(),
    dollar: (async () => {
      const got = await D.get('ecb-90d', '', { maxAge: D.DAILY, force });
      const days = D.ecb(got.text);
      const usd = days.filter((d) => fin(d.r.USD)).map((d) => ({ date: d.date, v: d.r.USD }));
      const jpy = days.filter((d) => fin(d.r.USD) && fin(d.r.JPY)).map((d) => ({ date: d.date, v: d.r.JPY / d.r.USD }));
      const pctDiff = (a, b) => signed(((a - b) / b) * 100, 2) + '%';
      seen(got, 'Euro reference rates', days.length ? 'rates for ' + D.longDay(days[days.length - 1].date) : '');
      return textPanel('The dollar', [factList([daily(usd, 'US dollars per euro', fx, pctDiff), daily(jpy, 'Yen per US dollar', fx, pctDiff)]), 'ECB reference rates; yen per dollar is worked out here from them. A fall in dollars per euro is a stronger dollar against the euro.']);
    })(),
    positioning: (async () => {
      const got = await D.get('cftc-tff', '209742', { maxAge: D.WEEKLY, force });
      const rows = D.cftc(got.text, 'tff');
      if (rows.length < 2) throw new Error('The report has too few weeks.');
      const last = rows[rows.length - 1], prev = rows[rows.length - 2];
      seen(got, 'Traders in Financial Futures, NQ', 'positions on ' + D.longDay(last.date));
      const row = (k, label) => [label, netMove(last.g[k].net, prev.g[k].net), 'net ' + sint(last.g[k].net) + ' on ' + shortD(last.date) + ', from ' + sint(prev.g[k].net) + ' on ' + shortD(prev.date)];
      return textPanel('NQ positioning', [factList([row('lev', 'Leveraged funds'), row('asset', 'Asset managers'), row('dealer', 'Dealers')]), 'CFTC, Traders in Financial Futures, NASDAQ MINI, futures only: the latest report in the copy against the one before. Positions are as of a Tuesday. Much of a group\'s position can be one side of a hedge.']);
    })(),
    energy: (async () => {
      const list = [];
      for (const [series, title] of EIA) {
        const got = await D.get('eia', series, { maxAge: D.WEEKLY, force });
        const e = D.eia(got.text), r = e.rows, last = r[r.length - 1], prev = r[r.length - 2];
        seen(got, title, 'week ending ' + D.longDay(last.date));
        list.push([title, mbs(last.v - prev.v) + ' million barrels', mb(last.v) + ' million in the week ending ' + shortD(last.date) + ', from ' + mb(prev.v) + (e.released ? '; released ' + shortD(e.released) + (e.released >= monday ? ', this week' : '') : '')]);
      }
      return textPanel('US stocks', [factList(list), 'EIA, weekly stocks: the latest week against the one before. Weekly figures are estimates, revised later.']);
    })(),
    auctions: (async () => {
      const got = await D.get('auctions', '', { maxAge: D.DAILY, force });
      const week = D.auctions(got.text).filter((a) => a.date >= monday && a.date <= D.addDays(monday, 6)).sort((a, b) => (a.date < b.date ? -1 : 1));
      seen(got, 'Auction results', '');
      const coupons = week.filter((a) => a.kind !== 'Bill');
      const bills = week.filter((a) => a.kind === 'Bill');
      const rows = coupons.map((a) => [family(a) + ', ' + shortD(a.date), a.done ? (a.highIs ? a.highIs.toLowerCase() + ' ' + pct(a.high, 3) : 'held') : a.date < today ? 'no result in the list yet' : 'to be held',
        a.done ? 'bid-to-cover ' + (fin(a.btc) ? a.btc.toFixed(2) : 'not given') + (fin(a.indirect) ? ', indirect ' + share(a.indirect) : '') : (fin(a.offering) ? bn(a.offering) + ' offered' : 'announced')]);
      if (bills.length) rows.push(['Bills', bills.length + (bills.length === 1 ? ' auction' : ' auctions'), 'results in the list for ' + bills.filter((a) => a.done).length]);
      if (!rows.length) rows.push(['None this week', '', 'in Treasury\'s list so far']);
      return textPanel('Treasury auctions this week', [factList(rows), 'US Treasury, Fiscal Data: auctions dated this week, held and announced.']);
    })(),
    wire: (async () => {
      const got = await D.get('fed-press', '', { maxAge: D.DAILY, force });
      const from = wallToUtc(monday + 'T00:00', ET);
      const items = D.rss(got.text).filter((i) => fin(i.at) && i.at >= from).sort((a, b) => a.at - b.at);
      seen(got, 'Press releases feed', items.length ? 'latest ' + shortDateET(items[items.length - 1].at) : '');
      const rows = items.map((i) => [shortDateET(i.at), i.title, i.category || '']);
      if (!rows.length) rows.push(['None this week', '', 'in the Fed\'s press feed so far']);
      return textPanel('The Fed\'s press releases', [factList(rows), 'Federal Reserve Board, press releases feed: those published this week.']);
    })(),
  };
  const titles = { yields: 'Treasury yields', real: 'Real yields', fed: 'Overnight rates', dollar: 'The dollar', positioning: 'NQ positioning', energy: 'US stocks', auctions: 'Treasury auctions this week', wire: 'The Fed\'s press releases' };
  const keys = Object.keys(jobs);
  const done = await Promise.allSettled(keys.map((k) => jobs[k]));
  const panels = done.map((r, i) => (r.status === 'fulfilled' ? r.value : fail(titles[keys[i]], r.reason)));
  if (done.every((r) => r.status === 'rejected')) throw done[0].reason;
  return {
    nodes: [
      el('p', 'note bd-asof', 'This week runs from Monday ' + D.longDay(monday) + ' to today, New York time. Each daily figure is compared with the last one before Monday, and each weekly report with the one before it; both dates are on every line. The figures are as published, with the changes worked out here. None of it says what comes next.'),
      section('Figures', '', panels.slice(0, 6), 'bgrid'),
      section('Events', '', panels.slice(6), 'bgrid'),
    ],
    status,
  };
}

/* ------------------------------------------------------------ a background card for the Folio */

/* The figures Atlas holds now, as a small card a Folio page can keep: each
   with its source and date, and the moment it was taken. Uses the same
   copies and fetching rules as Atlas; a source that cannot be read is left
   out. Returns null when there is nothing at all. */
export async function backgroundCard() {
  const rows = [];
  const add = (k, v, n) => { if (v) rows.push([k, v, n]); };
  await Promise.allSettled([
    recentCurve('tsy-real', false).then((c) => { const l = c.rows[c.rows.length - 1]; add('10-year real yield', pct(l.v['10Y']), 'US Treasury, ' + D.shortDayY(l.date)); }),
    recentCurve('tsy-nominal', false).then((c) => {
      const l = c.rows[c.rows.length - 1];
      add('2-year yield', pct(l.v['2Y']), 'US Treasury, ' + D.shortDayY(l.date));
      add('10-year yield', pct(l.v['10Y']), 'US Treasury, ' + D.shortDayY(l.date));
      if (fin(l.v['10Y']) && fin(l.v['2Y'])) add('2s10s', pp(l.v['10Y'] - l.v['2Y']), 'worked out from Treasury\'s curve');
    }),
    D.get('nyfed-latest', '', { maxAge: D.DAILY }).then((g) => {
      const e = D.nyfedLatest(g.text).EFFR;
      if (e) add('EFFR', pct(e.percentRate) + (fin(e.targetRateFrom) ? ' (range ' + pct(e.targetRateFrom) + ' to ' + pct(e.targetRateTo) + ')' : ''), 'New York Fed, ' + D.shortDayY(e.effectiveDate));
    }),
    D.get('ecb-90d', '', { maxAge: D.DAILY }).then((g) => { const d = D.ecb(g.text); const l = d[d.length - 1]; add('US dollars per euro', fx(l.r.USD), 'ECB, ' + D.shortDayY(l.date)); }),
    D.get('cftc-tff', '209742', { maxAge: D.WEEKLY }).then((g) => {
      const r = D.cftc(g.text, 'tff'); const l = r[r.length - 1];
      add('NQ leveraged funds, net', sint(l.g.lev.net), 'CFTC, positions on ' + D.shortDayY(l.date));
      add('NQ asset managers, net', sint(l.g.asset.net), 'CFTC, positions on ' + D.shortDayY(l.date));
    }),
    D.get('eia', 'WCESTUS1', { maxAge: D.WEEKLY }).then((g) => { const e = D.eia(g.text); const l = e.rows[e.rows.length - 1]; add('Commercial crude stocks', mb(l.v) + ' million barrels', 'EIA, week ending ' + D.shortDayY(l.date)); }),
  ]);
  if (!rows.length) return null;
  const order = ['10-year real yield', '2-year yield', '10-year yield', '2s10s', 'EFFR', 'US dollars per euro', 'NQ leveraged funds, net', 'NQ asset managers, net', 'Commercial crude stocks'];
  rows.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  const card = document.createElement('div');
  card.className = 'fbg';
  card.appendChild(el('p', 'fbg__h', 'Background from Atlas, taken ' + shortDateET(Date.now()) + ', ' + timeBoth(Date.now())));
  const ul = el('ul', 'fbg__list');
  for (const [k, v, n] of rows) {
    const li = document.createElement('li');
    li.append(el('span', 'fbg__k', k), el('span', 'fbg__v', v), el('span', 'fbg__n', n));
    ul.appendChild(li);
  }
  card.appendChild(ul);
  return card;
}

/* ------------------------------------------------------------ rendering */

const BUILD = { connects: buildConnects, week: buildWeek, rates: buildRates, auctions: buildAuctions, positioning: buildPositioning, energy: buildEnergy, currencies: buildCurrencies, releases: buildReleases, wire: buildWire };
const WAIT = {
  connects: 'Reading Atlas.',
  week: 'Reading every source Atlas keeps, to see what changed this week.',
  rates: 'Reading Treasury\'s yield files and the New York Fed\'s rates. Treasury\'s site can take half a minute to answer; after that, a copy is kept for 12 hours.',
  auctions: 'Reading Treasury\'s auction results.',
  positioning: 'Reading the CFTC\'s Commitments of Traders.',
  energy: 'Reading EIA\'s weekly stocks.',
  currencies: 'Reading the ECB\'s reference rates.',
  releases: 'Reading the release calendar.',
  wire: 'Reading the Fed\'s press releases.',
};
export const VIEWS = Object.keys(BUILD);

/* Draws a page. Resolves when everything on it is shown (for How it
   connects, once its figures have filled in) with { secs, reached }: how
   long that took and whether a publisher was asked; null when another
   render took the page over first. */
export async function renderBackdrop(view, force = false) {
  const sec = document.querySelector('.view[data-view="' + view + '"]');
  if (!sec || !BUILD[view]) return null;
  const body = sec.querySelector('[data-bd-body]'), status = sec.querySelector('[data-bd-status]');
  const my = ++state.token;
  const t0 = performance.now(), tried = D.attempts(), failed = D.failures();
  charts.hideTip();
  const keep = body.childElementCount && !force;
  if (!keep) body.replaceChildren(el('p', 'note bd-wait', WAIT[view]));
  sec.setAttribute('aria-busy', 'true');
  try {
    const built = await BUILD[view](force);
    if (my !== state.token) return null;
    body.replaceChildren(...built.nodes);
    status.replaceChildren(statusLines(built.status || []));
    charts.observe(body);
    /* a page that fills in as its sources arrive (How it connects) */
    if (built.after) {
      await built.after((items) => { if (my === state.token) status.replaceChildren(statusLines(items)); }, () => my === state.token, body, force)
        .catch(() => {});
      if (my !== state.token) return null;
    }
  } catch (e) {
    if (my !== state.token) return null;
    const box = el('div', 'bd-error glass glass--quiet');
    box.append(el('p', 'bd-error__h', 'Nothing to show yet'), el('p', '', String(e && e.message ? e.message : e)));
    if (settings.get().backdrop === false) box.appendChild(el('p', '', 'Fetching is switched off. Settings, under Atlas, switches it on.'));
    body.replaceChildren(box);
    status.replaceChildren();
  } finally {
    if (my === state.token) sec.removeAttribute('aria-busy');
  }
  const secs = (performance.now() - t0) / 1000, reached = D.attempts() > tried;
  /* only a clean fetch is kept for the estimate: a failed one is mostly
     time spent waiting for a publisher that did not answer */
  if (reached && D.failures() === failed) rememberTime(view, secs);
  return { secs, reached };
}

/* ------------------------------------------------------------ Fetch again, timed */

/* "7 s", "1 min 5 s"; with tenths under ten seconds when asked */
function secsText(s, tenths = false) {
  if (tenths && s < 10) return s.toFixed(1) + ' s';
  const w = Math.round(s);
  return w < 60 ? w + ' s' : Math.floor(w / 60) + ' min' + (w % 60 ? ' ' + (w % 60) + ' s' : '');
}

async function fetchAgain(b, timer, say) {
  if (b.getAttribute('aria-disabled') === 'true') return;
  const view = b.closest('.view').dataset.view;
  const exp = expectedTime(view);
  const hint = exp ? 'expect about ' + secsText(exp) : 'no estimate yet';
  const t0 = performance.now();
  const tick = () => { timer.textContent = secsText(Math.floor((performance.now() - t0) / 1000)) + ' (' + hint + ')'; };
  b.setAttribute('aria-disabled', 'true');
  b.textContent = 'Fetching';
  timer.hidden = false;
  tick();
  const every = setInterval(tick, 250);
  say.textContent = 'Fetching. ' + (exp ? 'Expect about ' + secsText(exp) + '.' : 'No estimate yet.');
  let res = null;
  try {
    res = await renderBackdrop(view, true);
  } finally {
    clearInterval(every);
    b.removeAttribute('aria-disabled');
    b.textContent = 'Fetch again';
  }
  /* another render took the page over: its own state shows instead */
  if (!res) { timer.hidden = true; say.textContent = ''; return; }
  timer.textContent = res.reached ? 'Took ' + secsText(res.secs, true) + (exp ? ' (expected about ' + secsText(exp) + ')' : '')
    : 'Nothing fetched: ' + (settings.get().backdrop === false ? 'fetching is switched off in Settings' : 'Fetch again ran less than ten minutes ago') + ', so the kept copies are shown';
  say.textContent = timer.textContent + '.';
}

export function initBackdrop() {
  document.querySelectorAll('[data-bd-fetch]').forEach((b) => {
    /* the time since Fetch again was pressed, and what to expect: a timer,
       so it is not read out every second; the start and end are read out */
    const timer = el('span', 'bd-timer');
    timer.setAttribute('role', 'timer');
    timer.dataset.tip = 'What to expect is the middle of the last five times this page fetched on this computer.';
    timer.hidden = true;
    const say = el('span', 'sr');
    say.setAttribute('aria-live', 'polite');
    b.after(timer, say);
    b.addEventListener('click', () => fetchAgain(b, timer, say));
  });
  document.querySelectorAll('[data-source]').forEach((b) => b.addEventListener('click', () => openSource(b.dataset.source)));
}
