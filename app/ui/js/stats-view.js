/* The Stats page, top to bottom:
     1. At a glance: six charts in equal panels (equity and drawdown, daily
        results, winners and losers, R-multiples, rolling expectancy, time
        of day). Hover any of them for the figures under the pointer.
     2. Key figures: eight equal tiles.
     3. The rest, section by section: results, risk, execution, when and how
        (equal cards that scroll inside, showing at least five rows), consistency,
        reliability, prop accounts and costs.
     4. The calendar, in colour, last.
   Every figure has its sample size beside it; estimates have ranges, or say
   "too few to say". A stat's name opens its definition and misreading. */

import * as J from './journal.js';
import * as settings from './settings.js';
import * as C from './stats-calc.js';
import { DEFS } from './stats-defs.js';
import * as charts from './charts.js';
import { money, unit as fmtUnit, tone, el, trades, UNIT_LABEL, int, simTag } from './format.js';
import { boundaryText, shortDateET, longDateET, duration } from './time.js';
import { blank, matcher, describe, fold } from './entry-filter.js';
import { SOURCE as NEWS_SOURCE, CHECKED as NEWS_CHECKED } from './news.js';

/* the entries shown (the same filter as Overview's: Stats sets the period,
   dates, instrument and account itself; the rest come from Overview's
   "Stats for these trades"), the rolling window and the calendar's month */
const state = { ...blank(), window: 20, cal: null };
const FROM_OVERVIEW = ['q', 'side', 'setup', 'mistake'];

/* Overview's "Stats for these trades": the same filter, here */
export function statsFor(f) {
  Object.assign(state, blank(), f);
}
const pctf = (x) => (x === null || x === undefined ? '' : Math.round(x * 100) + '%');
const ticksText = (v) => { const t = v.toFixed(1); return t + (t === '1.0' ? ' tick' : ' ticks'); };
const range = (r, f) => (r ? 'likely between ' + f(r[0]) + ' and ' + f(r[1]) : '');
/* ratios read against 1: above is the good side */
const ratioTone = (v) => (v === null || !Number.isFinite(v) ? '' : v >= 1 ? 'pnl pnl--up' : 'pnl pnl--down');

/* ------------------------------------------------------------ building */

/* the name of a stat, as a button that opens its definition */
function nameButton(id, title) {
  const d = DEFS[id];
  const name = el('button', 'stat__name', title || d[0]);
  name.type = 'button';
  name.setAttribute('aria-expanded', 'false');
  const def = el('div', 'stat__def');
  def.hidden = true;
  def.id = 'def-' + id + '-' + Math.random().toString(36).slice(2, 7);
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

function card(id, o = {}) {
  const art = el('article', 'stat glass glass--quiet' + (o.cls ? ' ' + o.cls : ''));
  const head = el('div', 'stat__head');
  const { name, def } = nameButton(id, o.title);
  head.appendChild(name);
  if (o.tag) head.appendChild(o.tag);
  if (o.n !== undefined && o.n !== null) head.appendChild(el('span', 'stat__n', 'n ' + int(o.n)));
  art.appendChild(head);
  /* in the equal cards, everything under the name scrolls inside the card */
  const body = o.scroll ? el('div', 'stat__scroll') : art;
  if (o.scroll) art.appendChild(body);
  body.appendChild(def);
  if (o.tooFew) {
    body.appendChild(el('p', 'stat__value stat__value--few', 'Too few to say'));
    body.appendChild(el('p', 'stat__line', o.fewWhy || 'Shown from ' + C.MIN + ' trades.'));
  } else if (o.value !== undefined) {
    body.appendChild(el('p', 'stat__value ' + (o.valueCls || ''), o.value));
  }
  for (const line of o.lines || []) {
    if (!line) continue;
    if (line instanceof Node) body.appendChild(line);
    else body.appendChild(el('p', 'stat__line', line));
  }
  if (o.body) body.appendChild(o.body);
  return art;
}

/* a chart panel: equal in size to its neighbours */
function panel(id, title, chart, o = {}) {
  const art = el('article', 'cpanel glass glass--quiet');
  const head = el('div', 'stat__head');
  const { name, def } = nameButton(id, title);
  head.appendChild(name);
  if (o.extra) head.appendChild(o.extra);
  if (o.n !== undefined && o.n !== null) head.appendChild(el('span', 'stat__n', 'n ' + int(o.n)));
  art.append(head, def, chart);
  if (o.caption) art.appendChild(o.caption instanceof Node ? o.caption : el('p', 'cpanel__cap', o.caption));
  return art;
}

function section(title, sub, items, grid = 'sgrid') {
  const sec = el('section', 'ssec');
  const h = el('div', 'ssec__head');
  h.appendChild(el('h2', 'title ssec__title', title));
  if (sub) h.appendChild(el('p', 'ssec__sub', sub));
  sec.appendChild(h);
  const g = el('div', grid);
  items.filter(Boolean).forEach((c) => g.appendChild(c));
  sec.appendChild(g);
  return sec;
}

/* "Average win +$412.00 (n 8)", with the figure coloured */
function resultLine(label, v, u, extra) {
  const p = el('p', 'stat__line');
  p.appendChild(document.createTextNode(label + ' '));
  if (v === null || v === undefined || !Number.isFinite(v)) p.appendChild(el('span', 'dim', 'none yet'));
  else p.appendChild(el('span', tone(v), fmtUnit(v, u)));
  if (extra) p.appendChild(document.createTextNode(' ' + extra));
  return p;
}

/* label and value on one line, aligned in two columns */
function rows(list) {
  const b = el('div', 'stat__rows');
  for (const [label, value, cls] of list) {
    const r = el('p', 'stat__row');
    r.append(el('span', 'stat__rk', label), value instanceof Node ? value : el('span', 'stat__rv ' + (cls || ''), value));
    b.appendChild(r);
  }
  return b;
}

/* ------------------------------------------------------------ filters */

function filtered(s) {
  const match = matcher(state, s);
  return J.all().filter((e) => match(e, J.result(e, s)));
}

function fillFilters() {
  const ins = document.querySelector('[data-sfilter="instrument"]');
  const acc = document.querySelector('[data-sfilter="account"]');
  const used = [...new Set(J.all().map((e) => e.instrument))].sort();
  ins.replaceChildren(new Option('All', ''), ...used.map((c) => new Option(c, c)));
  ins.value = used.includes(state.instrument) ? state.instrument : '';
  state.instrument = ins.value;
  const seen = new Map();
  for (const n of [...J.allAccounts().map((a) => a.name), ...J.all().map((e) => e.account)]) { const t = String(n || '').trim(); if (t && !seen.has(fold(t))) seen.set(fold(t), t); }
  const names = [...seen.values()].sort((a, b) => a.localeCompare(b));
  acc.replaceChildren(new Option('All', ''), ...names.map((n) => new Option(n, n)));
  acc.value = names.find((n) => fold(n) === fold(state.account)) || '';
  state.account = acc.value;
  document.querySelector('[data-sfilter="period"]').value = state.period;
  document.querySelector('[data-sfilter="from"]').value = state.from;
  document.querySelector('[data-sfilter="to"]').value = state.to;
  document.querySelectorAll('[data-sfilter-range]').forEach((r) => { r.hidden = state.period !== 'range'; });
  /* what came from Overview and has no control here, with a way to drop it */
  const from = document.querySelector('[data-stats-from]');
  const extra = describe(state, FROM_OVERVIEW);
  from.hidden = !extra.length;
  from.replaceChildren();
  if (extra.length) {
    const clear = el('button', 'link', 'Show all of them again');
    clear.type = 'button';
    clear.addEventListener('click', () => { FROM_OVERVIEW.forEach((k) => { state[k] = ''; }); renderStats(); });
    from.append(el('span', '', 'Only trades ' + extra.join(', ') + ', as chosen on Overview.'), clear);
  }
}

const SHORT = { 'First 30 minutes': 'First 30 min', Morning: 'Morning', Afternoon: 'Afternoon', Overnight: 'Overnight' };

/* ------------------------------------------------------------ render */

export function renderStats() {
  const s = settings.get();
  const u = s.units;
  fillFilters();
  const T = C.prepare(filtered(s), s);
  const st = C.compute(T, s, { window: state.window });
  const box = document.querySelector('[data-stats]');
  box.replaceChildren();
  charts.hideTip();

  const lede = document.querySelector('[data-stats-lede]');
  lede.textContent = st.n
    ? trades(st.n) + (st.n > 1 ? ', closed between ' + shortDateET(st.from) + ' and ' + longDateET(st.to) : ', closed ' + longDateET(st.to)) + '. ' +
      (s.basis === 'gross' ? 'Gross, before costs.' : 'Net of costs.') + ' In ' + (u === 'r' ? 'R' : UNIT_LABEL[u].toLowerCase()) + (u === 'ticks' || u === 'points' ? ' per contract' : '') + '.' +
      (u === 'r' ? ' R counts only the ' + st.nv + ' trades with an initial stop.' : '')
    : J.emptyNote() || 'No entries match. Stats are worked out from your entries as soon as there are some.';
  document.querySelector('[data-stats-boundary]').textContent = boundaryText(s.dayStart) + ' Moving that boundary changes every daily figure.';
  if (!st.n) return;
  const sims = T.filter((t) => J.isSim(t.e)).length;
  if (sims) {
    const n = el('p', 'simnote simnote--banner');
    const which = sims === st.n ? (sims === 1 ? 'This trade is' : 'All ' + st.n + ' trades are') : sims + ' of these ' + st.n + ' trades ' + (sims === 1 ? 'is' : 'are');
    n.append(simTag(), document.createTextNode(' ' + which + ' simulated: generated, not real. Every figure below is worked out from ' + (sims === 1 ? 'it' : 'them') + '. Settings, under Journal, can remove ' + (sims === 1 ? 'it' : 'them') + '.'));
    box.appendChild(n);
  }

  const R = st.results, K = st.risk, X = st.execution, W = st.when, Q = st.consistency;
  const f = (v) => fmtUnit(v, u);
  const lost = R.winRate.n - R.winRate.k - R.winRate.be;

  /* --- 1. at a glance: the charts ------------------------------------------ */
  const toggle = el('div', 'seg stat__toggle');
  toggle.setAttribute('role', 'radiogroup');
  toggle.setAttribute('aria-label', 'Rolling window');
  [20, 50].forEach((w) => {
    const b = el('button', 'seg__opt', String(w));
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', 'Last ' + w + ' trades');
    b.setAttribute('aria-checked', state.window === w ? 'true' : 'false');
    b.addEventListener('click', () => { state.window = w; renderStats(); });
    toggle.appendChild(b);
  });
  box.appendChild(section('At a glance', 'Hover any chart for the figures under the pointer.', [
    panel('maxDD', 'Equity and drawdown', charts.equity(K.curve, u), { n: st.nv,
      caption: 'The line is the running total; the shaded gap below the dashed peak is the drawdown. Deepest ' + (K.maxDD.closed ? f(-K.maxDD.closed) : 'none yet') + '.' }),
    panel('greenRed', 'Daily results', charts.daily(Q.calendar.totals, Q.calendar.counts, u), { n: Q.days,
      caption: Q.days + ' trading days: ' + Q.green.days + ' green, ' + Q.red.days + ' red.' }),
    panel('winRate', 'Winners and losers', charts.donut(R.winRate.k, lost, R.winRate.be), { n: st.n,
      caption: R.winRate.tooFew ? 'Too few trades for a range on the win rate.' : 'Win rate ' + pctf(R.winRate.rate) + ', ' + range(R.winRate.range, pctf) + '.' }),
    panel('rMultiples', 'R-multiples', charts.histogram(K.rMultiples.hist), { n: K.rMultiples.n,
      caption: K.rMultiples.n ? K.rMultiples.n + ' of ' + K.rMultiples.of + ' trades have an initial stop. Average ' + fmtUnit(K.rMultiples.avg, 'r') + ', median ' + fmtUnit(K.rMultiples.median, 'r') + '.' : 'R needs the stop planned at entry on each entry.' }),
    panel('rolling', 'Rolling expectancy, last ' + state.window, charts.rolling(Q.rolling.points, u, Q.rolling.window), { n: st.nv, extra: toggle,
      caption: Q.rolling.tooFew ? 'Needs ' + Q.rolling.window + ' trades; there are ' + st.nv + '.' : 'The band is the likely range of the average; it is wide on purpose.' }),
    panel('timeOfDay', 'Results by time of day', charts.groupBars(W.timeOfDay, u, (l) => SHORT[l] || l), { n: st.n,
      caption: 'New York time: first 30 minutes from 9:30, morning to noon, afternoon to 4:00 pm, overnight the rest.' }),
  ], 'cgrid'));

  /* --- 2. key figures ------------------------------------------------------ */
  box.appendChild(section('Key figures', s.basis === 'gross' ? 'Gross, before costs.' : 'Net of costs by default; switch to gross above.', [
    card('net', { cls: 'stat--tile', n: R.net.n, value: f(R.net.v), valueCls: tone(R.net.v),
      lines: ['Gross ' + money(R.costsShare.gross) + ', costs ' + money(R.costsShare.costs, { sign: false }) + '.'] }),
    card('winRate', { cls: 'stat--tile', n: R.winRate.n, tooFew: R.winRate.tooFew, value: pctf(R.winRate.rate),
      lines: [range(R.winRate.range, pctf) + '.', R.winRate.k + ' won, ' + lost + ' lost' + (R.winRate.be ? ', ' + R.winRate.be + ' even' : '') + '.'] }),
    card('expectancy', { cls: 'stat--tile', n: R.expectancy.n, tooFew: R.expectancy.tooFew, value: f(R.expectancy.v), valueCls: tone(R.expectancy.v),
      lines: [range(R.expectancy.range, f) ? 'A trade, ' + range(R.expectancy.range, f) + '.' : null,
        u !== 'r' && R.expectancy.nR ? fmtUnit(R.expectancy.r, 'r') + ' a trade in R.' : null] }),
    card('profitFactor', { cls: 'stat--tile', n: st.n, tooFew: R.profitFactor.tooFew,
      value: R.profitFactor.noLosses ? 'No losses yet' : R.profitFactor.v === null ? 'No wins yet' : R.profitFactor.v.toFixed(2), valueCls: ratioTone(R.profitFactor.v),
      lines: [f(R.profitFactor.wins) + ' won, ' + f(-R.profitFactor.losses) + ' lost.'] }),
    card('avgWinLoss', { cls: 'stat--tile', title: 'Payoff ratio', n: st.n, tooFew: R.payoff.tooFew, fewWhy: 'Shown from ' + C.MIN + ' trades.',
      value: R.payoff.v === null ? 'None yet' : R.payoff.v.toFixed(2),
      lines: [resultLine('Average win', R.avgWin.v, u), resultLine('Average loss', R.avgLoss.v, u)] }),
    card('maxDD', { cls: 'stat--tile', n: K.maxDD.n, value: K.maxDD.closed ? f(-K.maxDD.closed) : 'None yet', valueCls: K.maxDD.closed ? 'pnl pnl--down' : '',
      lines: [K.maxDD.troughAt ? shortDateET(K.maxDD.peakAt) + ' to ' + shortDateET(K.maxDD.troughAt) + ', closed trades.' : 'On closed trades.'] }),
    card('costsShare', { cls: 'stat--tile', n: R.costsShare.n, value: R.costsShare.share !== null ? pctf(R.costsShare.share) : money(R.costsShare.costs, { sign: false }),
      lines: [R.costsShare.share !== null ? money(R.costsShare.costs, { sign: false }) + ' of ' + money(R.costsShare.gross) + ' gross.' : 'Gross P&L is ' + money(R.costsShare.gross) + ', so a share would mean nothing.'] }),
    card('greenRed', { cls: 'stat--tile', n: Q.days, value: Q.days ? pctf(Q.greenShare) + ' green' : 'No days yet',
      lines: [resultLine('Green day', Q.green.avg, u, 'on average'), resultLine('Red day', Q.red.avg, u, 'on average')] }),
  ], 'tiles'));

  /* --- 3. the rest, section by section -------------------------------------- */
  box.appendChild(section('Results', 'What the trades add up to, and how much rests on a few of them.', [
    card('median', { n: R.median.n, tooFew: R.median.tooFew, value: f(R.median.v), valueCls: tone(R.median.v),
      lines: [resultLine('Average', R.median.avg, u, 'beside it; the gap is how far outliers pull the average.')] }),
    card('withoutBest', { n: st.nv, body: rows(R.withoutBest.map((x) => ['Without the best ' + (x.k === 1 ? 'trade' : x.k + ' trades'), x.v === null ? 'needs more than ' + x.k : f(x.v), x.v === null ? 'dim' : tone(x.v)])) }),
    card('expectancy', { title: 'Expectancy in every unit', n: R.expectancy.n, tooFew: R.expectancy.tooFew, body: rows([
      ['Per trade, as shown', f(R.expectancy.v), tone(R.expectancy.v)],
      ['In money', R.expectancy.money !== null ? money(R.expectancy.money) : 'none yet', tone(R.expectancy.money)],
      ['In R', R.expectancy.nR ? fmtUnit(R.expectancy.r, 'r') + ' (n ' + R.expectancy.nR + ')' : 'needs initial stops', R.expectancy.nR ? tone(R.expectancy.r) : 'dim'],
    ]) }),
  ]));

  box.appendChild(section('Risk and drawdown', 'Falls from a peak, and results against the risk planned at entry.', [
    card('maxDD', { title: 'Drawdown, closed and open', n: K.maxDD.n, body: rows([
      ['On closed trades', K.maxDD.closed ? f(-K.maxDD.closed) : 'none yet', K.maxDD.closed ? 'pnl pnl--down' : 'dim'],
      ['On open equity', K.maxDD.open !== null ? f(-K.maxDD.open) : 'needs MAE', K.maxDD.open !== null ? 'pnl pnl--down' : 'dim'],
      ['Estimated from MAE on', K.maxDD.openN + ' of ' + st.nv + ' trades'],
    ]) }),
    card('ddLength', { n: K.ddLength.n, body: rows([
      ['Longest below a peak', K.ddLength.longest ? duration(K.ddLength.longest) : 'never'],
      ['Below its peak now', K.ddLength.stillUnder ? duration(K.ddLength.stillUnder) : 'no, at a peak'],
      ['Back from the deepest point', K.ddLength.recovery ? duration(K.ddLength.recovery) : K.maxDD.closed ? 'not yet' : 'no drawdown yet'],
    ]) }),
    card('worst', { n: st.consistency.days, body: rows([
      ['Worst day' + (K.worstDay ? ', ' + longDateET(Date.parse(K.worstDay.key + 'T16:00:00Z')) : ''), K.worstDay ? f(K.worstDay.v) : 'none yet', K.worstDay ? tone(K.worstDay.v) : 'dim'],
      ['Worst week' + (K.worstWeek ? ', from ' + shortDateET(Date.parse(K.worstWeek.key + 'T16:00:00Z')) : ''), K.worstWeek ? f(K.worstWeek.v) : 'none yet', K.worstWeek ? tone(K.worstWeek.v) : 'dim'],
    ]) }),
    card('beyondPlan', { n: K.beyondPlan.n, value: K.beyondPlan.n ? K.beyondPlan.avg.toFixed(2) + '× planned' : 'No losers with a stop yet',
      valueCls: K.beyondPlan.n ? (K.beyondPlan.avg > 1.0001 ? 'pnl pnl--down' : 'pnl pnl--up') : '',
      lines: [K.beyondPlan.n ? K.beyondPlan.over + ' of ' + K.beyondPlan.n + ' losers lost more than planned.' : null,
        K.beyondPlan.losers > K.beyondPlan.n ? (K.beyondPlan.losers - K.beyondPlan.n) + ' losers had no initial stop.' : null] }),
    card('streak', { n: st.n, value: K.streak.longest + (K.streak.longest === 1 ? ' loss' : ' losses'),
      lines: [K.streak.chance ? 'At a ' + pctf(K.streak.chance.q) + ' loss rate over ' + st.n + ' trades, chance alone usually gives ' + K.streak.chance.lo + ' to ' + K.streak.chance.hi + ', most often ' + K.streak.chance.median + '.' : 'Compared with chance from ' + C.MIN + ' trades.'] }),
  ]));

  const neg = (o) => ({ v: o.v === null ? null : -o.v, n: o.n });
  box.appendChild(section('Execution', 'How the trades were run, from what the entries record.', [
    card('maeMfe', { n: X.mae.win.n + X.mae.loss.n, body: rows([
      ['Against you, winners (n ' + X.mae.win.n + ')', neg(X.mae.win).v === null ? 'none yet' : f(neg(X.mae.win).v), 'pnl pnl--down'],
      ['Against you, losers (n ' + X.mae.loss.n + ')', neg(X.mae.loss).v === null ? 'none yet' : f(neg(X.mae.loss).v), 'pnl pnl--down'],
      ['In your favour, winners', X.mfe.win.v === null ? 'none yet' : f(X.mfe.win.v), 'pnl pnl--up'],
      ['In your favour, losers', X.mfe.loss.v === null ? 'none yet' : f(X.mfe.loss.v), 'pnl pnl--up'],
    ]) }),
    card('hold', { n: X.hold.nWin + X.hold.nLoss, body: rows([
      ['Winners (n ' + X.hold.nWin + ')', X.hold.win !== null ? duration(X.hold.win) : 'none yet'],
      ['Losers (n ' + X.hold.nLoss + ')', X.hold.loss !== null ? duration(X.hold.loss) : 'none yet'],
    ]), lines: ['Medians, from entries with an exit time.'] }),
    card('efficiency', { n: X.efficiency.n, tooFew: X.efficiency.tooFew, fewWhy: 'Needs MFE on ' + C.MIN + ' trades; ' + X.efficiency.n + ' have it.',
      value: pctf(X.efficiency.v) + ' kept', lines: [X.efficiency.winners !== null ? 'On winners alone: ' + pctf(X.efficiency.winners) + ' (n ' + X.efficiency.nWin + ').' : null] }),
    card('slippage', { n: X.slippage.n, value: X.slippage.n ? (X.slippage.v > 0 ? ticksText(X.slippage.v) + ' worse' : X.slippage.v < 0 ? ticksText(-X.slippage.v) + ' better' : 'None') : 'Needs intended prices',
      valueCls: X.slippage.n ? (X.slippage.v > 0 ? 'pnl pnl--down' : X.slippage.v < 0 ? 'pnl pnl--up' : '') : '',
      lines: ['Estimated from the prices typed: there is no order data.'] }),
    card('timeInMarket', { n: X.timeInMarket.days, value: X.timeInMarket.days ? pctf(X.timeInMarket.v) : 'Needs exit times',
      lines: [X.timeInMarket.days ? 'Of the session, on the ' + X.timeInMarket.days + ' days traded.' : null] }),
  ]));

  /* when and how: equal cards that scroll inside, at least five rows showing */
  const gt = (groups) => charts.groupTable(groups, u, { tone });
  const pair = (a, b) => gt([a, b].filter((g) => g && g.n));
  const stack = (...parts) => { const w = el('div', 'stat__stack'); parts.forEach(([k, node]) => { w.append(el('p', 'kicker stat__k', k), node); }); return w; };
  const even = { scroll: true, cls: 'stat--even' };
  box.appendChild(section('When and how', 'Results split by time, instrument and habit. Facts about the trades, not causes.', [
    card('timeOfDay', { ...even, n: st.n, body: gt(W.timeOfDay) }),
    card('weekday', { ...even, n: st.n, body: gt(W.weekday) }),
    card('instrument', { ...even, n: st.n, body: stack(['Instruments', gt(W.instrument)], ['Contract size', gt(W.size)]) }),
    card('perDay', { ...even, n: W.perDay.days, tooFew: W.perDay.tooFew, fewWhy: 'The correlation is shown from ' + C.MIN_DAYS + ' trading days; there are ' + W.perDay.days + '.',
      value: W.perDay.r !== null ? (W.perDay.r >= 0 ? '+' : '−') + Math.abs(W.perDay.r).toFixed(2) + ' correlation' : undefined,
      body: rows(W.perDay.buckets.filter((b) => b.days).map((b) => [b.label + ' (' + b.days + (b.days === 1 ? ' day)' : ' days)'), b.avg === null ? 'none' : f(b.avg) + ' a day', tone(b.avg)])) }),
    card('tags', { ...even, n: st.n, body: stack(['Order flow tags', gt(W.tags)], ['Setups', gt(W.setups)], ['Checklist', gt(W.checklist)]) }),
    card('afterLoss', { ...even, n: W.afterLoss.nLoss + W.afterLoss.nWin, body: stack(
      ['Median gap to the next entry', rows([['After a loss (n ' + W.afterLoss.nLoss + ')', W.afterLoss.gapLoss !== null ? duration(W.afterLoss.gapLoss) : 'none yet'], ['After a win (n ' + W.afterLoss.nWin + ')', W.afterLoss.gapWin !== null ? duration(W.afterLoss.gapWin) : 'none yet']])],
      ['Trades entered after a loss', pair(W.afterLoss.quick, W.afterLoss.later)]) }),
    card('sizeAfter', { ...even, n: W.sizeAfter.nLoss + W.sizeAfter.nWin, body: rows([
      ['After a loss (n ' + W.sizeAfter.nLoss + ')', W.sizeAfter.loss !== null ? W.sizeAfter.loss.toFixed(1) + ' contracts' : 'none yet'],
      ['After a win (n ' + W.sizeAfter.nWin + ')', W.sizeAfter.win !== null ? W.sizeAfter.win.toFixed(1) + ' contracts' : 'none yet'],
    ]) }),
    card('news', { ...even, n: st.n, body: pair(W.news.yes, W.news.no), lines: [
      !W.news.yes.n && W.news.no.n ? 'No trades near a high-impact release, of the ' + W.news.no.n + ' the app can tell about.' : null,
      W.news.unknown ? W.news.unknown + ' trades are outside the calendar and not marked on the entry, so they count as unknown.' : null,
      'Releases from ' + NEWS_SOURCE + ', checked ' + NEWS_CHECKED + '.'] }),
    card('afterLimit', { ...even, n: st.n, body: pair(W.afterLimit.flagged, W.afterLimit.auto || W.afterLimit.within), lines: [
      W.afterLimit.limit ? 'Your daily limit in Settings: ' + money(W.afterLimit.limit, { sign: false }) + '.' : 'Set your daily limit in Settings to count these from the day\'s running net as well.'] }),
    card('moodSleep', { ...even, n: st.n, body: stack(['Mood', gt(W.mood)], ['Sleep', gt(W.sleep)]) }),
  ], 'sgrid sgrid--even'));

  box.appendChild(section('Consistency', 'How evenly the results came, day by day. The calendar is at the foot of the page.', [
    card('greenRed', { n: Q.days, body: rows([
      ['Green days', Q.green.days + ' of ' + Q.days],
      ['Average green day', Q.green.avg === null ? 'none yet' : f(Q.green.avg), tone(Q.green.avg)],
      ['Average red day', Q.red.avg === null ? 'none yet' : f(Q.red.avg), tone(Q.red.avg)],
    ]) }),
    card('bestDay', { n: Q.days, value: Q.bestDay.share !== null ? pctf(Q.bestDay.share) : 'Not meaningful yet',
      lines: [Q.bestDay.share !== null ? 'Best day ' + f(Q.bestDay.v) + ' of ' + f(Q.bestDay.total) + ' net.' : 'Shown while net P&L and the best day are both positive.'] }),
  ]));

  const ch = st.reliability.chance;
  box.appendChild(section('Reliability', 'How much weight these figures can bear.', [
    card('sample', { n: st.n, value: trades(st.n),
      lines: ['Every figure carries its own n. Rates and averages show a likely range, and say "too few to say" below ' + C.MIN + ' trades.'] }),
    card('chance', { n: st.reliability.n, tooFew: st.reliability.tooFew, fewWhy: 'Shown from ' + C.MIN_CHANCE + ' trades.',
      value: ch ? pctf(ch.p) + ' of chance runs did as well' : undefined, valueCls: ch ? (ch.p < 0.05 ? 'pnl pnl--up' : '') : '',
      lines: [ch ? (ch.p < 0.05 ? 'Unusual for chance alone. Not proof of skill, and nothing about the next trade.' : 'Well within what chance alone often produces with these trade sizes.') : null] }),
  ]));

  /* prop accounts and costs: equal cards, label and value in two columns */
  const accs = J.allAccounts();
  const propCards = accs.map((a) => {
    const r = C.account(a, s);
    const c = card('propRules', { cls: 'stat--prop', n: r.n, tag: J.isSim(a) ? simTag() : null, body: rows([
      ['Balance', money(r.balance, { sign: false })],
      ['Distance to the drawdown line', r.drawdown ? money(r.drawdown.distance, { sign: false }) : 'no rule entered', r.drawdown ? (r.drawdown.distance > 0 ? 'pnl pnl--up' : 'pnl pnl--down') : 'dim'],
      ['The line is at', r.drawdown ? money(r.drawdown.threshold, { sign: false }) : 'not set', r.drawdown ? '' : 'dim'],
      ['Daily loss left today', r.daily ? money(r.daily.left, { sign: false }) + ' of ' + money(r.daily.limit, { sign: false }) : 'no rule entered', r.daily ? (r.daily.left > 0 ? 'pnl pnl--up' : 'pnl pnl--down') : 'dim'],
      ['Consistency', r.consistency ? (r.consistency.share !== null ? pctf(r.consistency.share) + ' against ' + pctf(r.consistency.rule) : 'needs a profit first') : 'no rule entered',
        r.consistency && r.consistency.share !== null ? (r.consistency.share <= r.consistency.rule ? 'pnl pnl--up' : 'pnl pnl--down') : 'dim'],
      ...(r.goal ? [['Profit target', pctf(Math.max(0, r.goal.progress)) + ' of ' + money(r.goal.target, { sign: false })]] : []),
    ]) });
    c.querySelector('.stat__name').textContent = a.name + (a.firm ? ' · ' + a.firm : '');
    return c;
  });
  const spent = accs.reduce((x, a) => x + C.account(a, s).spent, 0), paid = accs.reduce((x, a) => x + C.account(a, s).paid, 0);
  const co = st.costs;
  box.appendChild(section('Prop accounts and costs', 'From the Accounts page, and the costs on your entries.', [
    ...(propCards.length ? propCards : [card('propRules', { cls: 'stat--prop', value: 'No accounts yet', lines: [(() => { const a = el('a', 'link', 'Add one on the Accounts page'); a.href = '#/accounts'; return a; })()] })]),
    card('propSpend', { cls: 'stat--prop', n: accs.length, value: money(paid - spent), valueCls: tone(paid - spent), body: rows([
      ['Spent on evaluations, resets and activations', money(spent, { sign: false }), spent ? 'pnl pnl--down' : ''],
      ['Paid out', money(paid, { sign: false }), paid ? 'pnl pnl--up' : ''],
    ]) }),
    card('costRate', { cls: 'stat--prop', n: co.contracts, value: co.perRoundTurn !== null ? money(co.perRoundTurn, { sign: false }) + ' a round turn' : 'None yet', body: rows([
      ['A trading day', co.perDay !== null ? money(co.perDay, { sign: false }) + ' over ' + co.days + ' days' : 'none yet'],
      ['Trade costs', money(co.trade, { sign: false })],
      ['Monthly fees', co.fees ? money(co.fees, { sign: false }) + ' (' + co.months + (co.months === 1 ? ' month' : ' months') + ')' : 'none set in Settings', co.fees ? '' : 'dim'],
    ]) }),
  ], 'sgrid sgrid--prop'));

  /* --- 4. the calendar, last, in colour ---------------------------------------- */
  const months = [...new Set([...Q.calendar.counts.keys()].map((k) => k.slice(0, 7)))].sort();
  if (!state.cal || !months.includes(state.cal)) state.cal = months[months.length - 1];
  const at = months.indexOf(state.cal);
  const [y, m] = state.cal.split('-').map(Number);
  const nav = el('div', 'calnav');
  const mk = (label, to, aria) => { const b = el('button', 'btn btn--quiet', label); b.type = 'button'; b.setAttribute('aria-label', aria); b.disabled = to < 0 || to >= months.length; b.addEventListener('click', () => { state.cal = months[to]; renderStats(); }); return b; };
  nav.append(mk('←', at - 1, 'Previous month with trades'), el('span', 'calnav__m', new Date(Date.UTC(y, m - 1, 15)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })), mk('→', at + 1, 'Next month with trades'));
  const calBody = el('div');
  calBody.append(charts.month(y, m - 1, Q.calendar.totals, Q.calendar.counts, u, { colour: true }));
  const link = el('a', 'link', 'Every month, in greys, on the Calendar page');
  link.href = '#/calendar';
  calBody.appendChild(link);
  box.appendChild(section('Calendar', 'Each trading day\'s result. Green and red in four steps by size, always with the sign.', [
    card('calendar', { cls: 'stat--full', n: Q.days, tag: nav, body: calBody }),
  ]));

  charts.observe(box);
}

export function initStats() {
  document.querySelectorAll('[data-sfilter]').forEach((sel) => sel.addEventListener('change', () => {
    state[sel.dataset.sfilter] = sel.value;
    renderStats();
  }));
  /* the hover card never outlives the page it came from */
  window.addEventListener('hashchange', charts.hideTip);
  document.getElementById('page').addEventListener('scroll', charts.hideTip, { passive: true });
}
