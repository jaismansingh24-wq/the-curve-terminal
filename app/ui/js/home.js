/* The home screen: recent entries, the last entry, and profit and loss for
   today's trading day, this week and this month; then the journal's main
   figures, the Folio's research, and NQ positioning from the copy Atlas
   last kept. A period with no closed trades says so, rather than showing a
   zero, and a figure that needs more trades says how many it has. Home
   fetches nothing: positioning is read from the copy on this computer. */

import * as J from './journal.js';
import * as Folio from './folio.js';
import * as C from './stats-calc.js';
import * as D from './backdrop-data.js';
import * as settings from './settings.js';
import { money, unit, tone, trades, el, int, MINUS, UNIT_LABEL, simTag } from './format.js';
import { shortDateET, timeBoth, boundaryText } from './time.js';
import { formatPrice } from './instruments.js';

const SIDE = { long: 'long', short: 'short' };

export function dots(n) {
  const d = el('span', 'dots');
  d.setAttribute('role', 'img');
  d.setAttribute('aria-label', 'Confidence ' + n + ' of 5');
  for (let i = 1; i <= 5; i++) d.appendChild(el('i', i <= n ? 'on' : ''));
  return d;
}

/* a result in the chosen unit, coloured, or a dash when it cannot be shown */
export function resultNode(e, r, s, cls = '') {
  const v = J.inUnit(r, e, s.units, s.basis);
  if (v === null) return el('span', 'dim ' + cls, s.units === 'r' ? 'no stop' : '');
  return el('span', tone(v) + ' ' + cls, unit(v, s.units));
}

function recent(s) {
  const list = document.querySelector('[data-recent]');
  const empty = document.querySelector('[data-recent-empty]');
  const items = J.all().slice(0, 6);
  list.replaceChildren();
  empty.hidden = items.length > 0;
  empty.textContent = J.emptyNote() || 'Nothing written yet. Entries you write are listed here, newest first.';
  for (const e of items) {
    const r = J.result(e, s);
    const li = el('li');
    const a = el('a', 'rowlink');
    a.href = '#/entry/' + e.id;
    a.appendChild(el('span', 'rowlink__when', shortDateET(r.at)));
    const what = el('span', 'rowlink__what', e.instrument + ' ' + SIDE[e.direction] + ' · ' + e.contracts + ' ');
    if (J.isSim(e)) what.appendChild(simTag());
    what.appendChild(el('span', '', e.confluence));
    a.appendChild(what);
    a.appendChild(resultNode(e, r, s));
    li.appendChild(a);
    list.appendChild(li);
  }
}

function last(s) {
  const box = document.querySelector('[data-last]');
  const link = document.querySelector('[data-last-link]');
  const e = J.all()[0];
  box.replaceChildren();
  if (!e) {
    link.hidden = true;
    const wrap = el('div', 'last');
    wrap.appendChild(el('p', 'empty', J.emptyNote() || 'No entries yet. Your last entry shows here, with its result.'));
    const a = el('a', 'btn btn--primary', 'New entry');
    a.href = '#/new';
    const row = el('div', 'form__foot'); row.appendChild(a);
    wrap.appendChild(row);
    box.appendChild(wrap);
    return;
  }
  const r = J.result(e, s);
  link.hidden = false;
  link.href = '#/entry/' + e.id;
  const wrap = el('div', 'last');
  const t = el('p', 'last__title', e.instrument + ' ');
  t.appendChild(el('span', '', SIDE[e.direction] + ', ' + e.contracts + (e.contracts === 1 ? ' contract' : ' contracts')));
  if (J.isSim(e)) t.appendChild(simTag());
  wrap.appendChild(t);
  wrap.appendChild(el('p', 'last__prices', '@ ' + formatPrice(e.instrument, e.entryPrice) + '  →  @ ' + formatPrice(e.instrument, e.exitPrice)));
  const res = el('p', 'last__res');
  res.appendChild(resultNode(e, r, s));
  res.appendChild(el('span', '', 'net ' + money(r.net) + ' · gross ' + money(r.gross)));
  if (r.risk && s.units !== 'r') res.appendChild(el('span', '', unit(J.inUnit(r, e, 'r', s.basis), 'r')));
  wrap.appendChild(res);
  const meta = el('p', 'last__meta');
  meta.appendChild(el('span', '', shortDateET(r.at) + ', ' + timeBoth(r.at)));
  wrap.appendChild(meta);
  const conf = el('p', 'last__meta');
  conf.appendChild(el('span', 'last__conf', e.confluence));
  conf.appendChild(dots(e.confidence));
  wrap.appendChild(conf);
  box.appendChild(wrap);
}

function pl(s) {
  const box = document.querySelector('[data-pl]');
  const p = J.periods(s);
  box.replaceChildren();
  for (const [k, label] of [['day', 'Today'], ['week', 'This week'], ['month', 'This month']]) {
    const o = p[k];
    const row = el('div', 'pl__row');
    row.appendChild(el('span', 'pl__k', label));
    const v = el('div', 'pl__v');
    if (!o.count) {
      v.appendChild(el('span', 'pl__none', 'No entries to conclude profit or loss from.'));
    } else {
      const shown = o.count - o.missing;
      if (s.units === 'r' && !shown) v.appendChild(el('span', 'pl__none', 'No initial stops recorded, so no result in R.'));
      else v.appendChild(el('span', tone(o.value) + ' pl__main', unit(o.value, s.units)));
      v.appendChild(el('span', 'pl__sub', 'net ' + money(o.net) + ' · gross ' + money(o.gross) + ' · costs ' + money(o.costs, { sign: false }) + ' · ' + trades(o.count)));
      if (o.missing && s.units === 'r') v.appendChild(el('span', 'pl__sub', 'R on ' + shown + ' of ' + o.count + '; the rest had no initial stop.'));
    }
    row.appendChild(v);
    box.appendChild(row);
  }
  /* nothing this month, but there are entries: say where they are */
  const latest = J.all()[0];
  if (!p.month.count && latest) {
    const note = el('p', 'pl__where');
    note.append(document.createTextNode('Your latest entry closed on ' + shortDateET(J.closedAt(latest)) + '. '));
    const a = el('a', 'link', 'Overview');
    a.href = '#/overview';
    const b = el('a', 'link', 'Stats');
    b.href = '#/stats';
    note.append(a, document.createTextNode(' and '), b, document.createTextNode(' show every entry.'));
    box.appendChild(note);
  }
  const sims = J.simCount();
  if (sims) box.appendChild(el('p', 'simnote', 'Your journal includes ' + sims + ' simulated ' + (sims === 1 ? 'entry' : 'entries') + ': generated, not real trades.'));
}

/* ------------------------------------------------------------ the figures */

function tile(label, value, sub, cls = '') {
  const t = el('div', 'tile');
  t.append(el('span', 'tile__k', label), el('span', 'tile__v ' + cls, value));
  if (sub) t.appendChild(el('span', 'tile__s', sub));
  return t;
}
const pct = (x) => Math.round(x * 100) + '%';

/* the journal: closed trades, win rate with its range, average per trade,
   profit factor and the largest fall from a peak, each on what it rests on */
function journalFigures(s) {
  const box = document.querySelector('[data-home-journal]');
  const note = document.querySelector('[data-home-journal-note]');
  if (!box) return;
  box.replaceChildren();
  const T = C.prepare(J.all(), s);
  const n = T.length;
  if (!n) {
    note.textContent = J.emptyNote() || 'No closed trades yet. The figures here start with your first entry.';
    return;
  }
  const month = J.periods(s).month.count;
  const days = new Set(T.map((t) => t.day)).size;
  box.appendChild(tile('Closed trades', int(n), int(days) + (days === 1 ? ' trading day' : ' trading days') + ', ' + int(month) + ' this month'));

  const wins = T.filter((t) => t.win).length;
  if (n < C.MIN) box.appendChild(tile('Win rate', 'Needs ' + C.MIN + ' trades', 'has ' + n, 'is-wait'));
  else {
    const [lo, hi] = C.wilson(wins, n);
    box.appendChild(tile('Win rate', pct(wins / n), 'likely between ' + pct(lo) + ' and ' + pct(hi) + ', from ' + trades(n)));
  }

  const vals = T.filter((t) => t.v !== null).map((t) => t.v);
  if (!vals.length) box.appendChild(tile('Average per trade', 'No result in R', 'no initial stops recorded', 'is-wait'));
  else {
    const avg = C.mean(vals);
    box.appendChild(tile('Average per trade', unit(avg, s.units), (s.basis === 'gross' ? 'gross, ' : 'net, ') + 'from ' + trades(vals.length), tone(avg)));
  }

  const up = vals.filter((v) => v > 0).reduce((a, b) => a + b, 0), down = -vals.filter((v) => v < 0).reduce((a, b) => a + b, 0);
  if (n < C.MIN) box.appendChild(tile('Profit factor', 'Needs ' + C.MIN + ' trades', 'has ' + n, 'is-wait'));
  else box.appendChild(tile('Profit factor', down > 0 ? (up / down).toFixed(2) : 'No losses', down > 0 ? 'gains divided by losses' : 'nothing to divide by yet'));

  let eq = 0, peak = 0, dd = 0;
  for (const v of vals) { eq += v; if (eq > peak) peak = eq; if (peak - eq > dd) dd = peak - eq; }
  box.appendChild(tile('Largest drawdown', dd > 0 ? unit(-dd, s.units) : 'None yet', 'closed trades, from a high point to the lowest after it', dd > 0 ? tone(-dd) : ''));

  note.textContent = 'In ' + UNIT_LABEL[s.units].toLowerCase() + (s.units === 'ticks' || s.units === 'points' ? ' per contract' : '') + '. A figure from a few trades moves a lot with the next one; Stats shows each with its range and where it misleads.';
}

/* the Folio: pages, words, marked lines and tags, and the page last edited */
const folioCache = new Map();
function folioCounts(p) {
  const key = p.id + '|' + (p.updatedAt || '');
  if (!folioCache.has(key)) {
    const m = Folio.marks(p);
    folioCache.set(key, { words: Folio.words(p), shown: m.filter((x) => x.shown).length, hidden: m.filter((x) => !x.shown).length });
  }
  return folioCache.get(key);
}
function research() {
  const box = document.querySelector('[data-home-research]');
  const note = document.querySelector('[data-home-research-note]');
  if (!box) return;
  box.replaceChildren();
  note.replaceChildren();
  if (!Folio.isLoaded()) { note.textContent = Folio.lastError() ? 'The Folio could not be read. Pages, in the menu, says why.' : 'Reading the Folio.'; return; }
  const pages = Folio.all();
  if (!pages.length) {
    note.append(document.createTextNode('No research pages yet. '));
    const a = el('a', 'link', 'Start a page');
    a.href = '#/page/new';
    note.append(a, document.createTextNode('; lines you mark as important gather in the Digest.'));
    return;
  }
  let words = 0, shown = 0, hidden = 0;
  for (const p of pages) { const c = folioCounts(p); words += c.words; shown += c.shown; hidden += c.hidden; }
  const pinned = pages.filter((p) => p.pinned).length, tags = Folio.allTags().length;
  box.append(
    tile('Pages', int(pages.length), pinned ? int(pinned) + ' pinned' : ''),
    tile('Words', int(words), 'across all pages'),
    tile('Marked lines', int(shown + hidden), int(shown) + ' shown, ' + int(hidden) + ' hidden'),
    tile('Tags', int(tags), tags ? '' : 'none yet'),
  );
  const latest = pages.slice().sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || 0) || 0) - (Date.parse(a.updatedAt || a.createdAt || 0) || 0))[0];
  note.append(document.createTextNode('Last edited: '));
  const a = el('a', 'link', latest.title || 'Untitled page');
  a.href = '#/page/' + latest.id;
  note.append(a, document.createTextNode(', ' + shortDateET(Date.parse(latest.updatedAt || latest.createdAt)) + '.'));
}

/* NQ positioning, from the last copy of the CFTC's report Atlas kept */
let pos = { at: 0, got: null };
const sint = (v) => (Number.isFinite(v) ? (v > 0 ? '+' : v < 0 ? MINUS : '') + int(Math.abs(v)) : '');
async function positioning() {
  const box = document.querySelector('[data-home-pos]');
  const note = document.querySelector('[data-home-pos-note]');
  if (!box) return;
  if (Date.now() - pos.at > 10000) pos = { at: Date.now(), got: await D.lastCopy('cftc-tff', '209742') };
  box.replaceChildren();
  note.replaceChildren();
  let rows = null;
  try { rows = pos.got ? D.cftc(pos.got.text, 'tff') : null; } catch (e) { rows = null; }
  if (!rows || rows.length < 2) {
    note.append(document.createTextNode('No copy of the CFTC\'s report on this computer yet. '));
    const a = el('a', 'link', 'Open Positioning');
    a.href = '#/positioning';
    note.append(a, document.createTextNode(settings.get().backdrop === false ? ' to see it; fetching is switched off in Settings, so switch it on first.' : ' and Atlas fetches it. Home only reads the copy Atlas keeps.'));
    return;
  }
  const last = rows[rows.length - 1], prev = rows[rows.length - 2];
  const g = (k) => tile(D.GROUPS.tff.find((x) => x[0] === k)[1] + ', net', sint(last.g[k].net), sint(last.g[k].net - prev.g[k].net) + ' on the week');
  box.append(g('lev'), g('asset'), g('dealer'), tile('Open interest', int(last.oi), sint(last.oi - prev.oi) + ' on the week'));
  note.textContent = 'Contracts, futures only, CFTC Traders in Financial Futures, positions on ' + D.weekday(last.date) + ' ' + D.longDay(last.date) + ', from the copy Atlas kept on ' + shortDateET(pos.got.fetchedAt) + '. Much of a group\'s position can be one leg of a hedge, so a net short is not necessarily a position that gains from a fall.';
}

export function renderHome() {
  const s = settings.get();
  recent(s);
  last(s);
  pl(s);
  journalFigures(s);
  research();
  positioning();
}

export function renderBoundaries() {
  const s = settings.get();
  const unitNote = s.units === 'ticks' || s.units === 'points' ? ' ' + UNIT_LABEL[s.units] + ' are per contract, and add up across instruments whose money values differ.' : '';
  document.querySelectorAll('[data-boundary]').forEach((n) => { n.textContent = boundaryText(s.dayStart) + unitNote; });
}
