/* The Stats page. Seven sections, in the order of the spec; the starred
   figures come first in each and are drawn larger. Every figure has its
   sample size beside it; estimates have ranges, or say "too few to say".
   A stat's name opens its definition and its common misreading in place. */

import * as J from './journal.js';
import * as settings from './settings.js';
import * as C from './stats-calc.js';
import { DEFS } from './stats-defs.js';
import * as charts from './charts.js';
import { money, unit as fmtUnit, tone, el, trades, UNIT_LABEL, int } from './format.js';
import { tradingDay, weekOf, monthOf, boundaryText, shortDateET, longDateET, duration } from './time.js';
import { SOURCE as NEWS_SOURCE, CHECKED as NEWS_CHECKED } from './news.js';

const state = { period: '', instrument: '', account: '', window: 20 };
const pctf = (x) => (x === null || x === undefined ? '' : Math.round(x * 100) + '%');
const ticksText = (v) => { const t = v.toFixed(1); return t + (t === '1.0' ? ' tick' : ' ticks'); };
const range = (r, f) => (r ? 'likely between ' + f(r[0]) + ' and ' + f(r[1]) : '');

/* ------------------------------------------------------------ building */

function card(id, o = {}) {
  const d = DEFS[id];
  const art = el('article', 'stat glass glass--quiet' + (o.key ? ' stat--key' : '') + (o.wide ? ' stat--wide' : ''));
  const head = el('div', 'stat__head');
  const name = el('button', 'stat__name', d[0]);
  name.type = 'button';
  name.setAttribute('aria-expanded', 'false');
  head.appendChild(name);
  if (o.n !== undefined && o.n !== null) head.appendChild(el('span', 'stat__n', 'n ' + int(o.n)));
  art.appendChild(head);

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

  if (o.tooFew) {
    art.appendChild(el('p', 'stat__value stat__value--few', 'Too few to say'));
    art.appendChild(el('p', 'stat__line', o.fewWhy || 'Shown from ' + C.MIN + ' trades.'));
  } else if (o.value !== undefined) {
    art.appendChild(el('p', 'stat__value ' + (o.valueCls || ''), o.value));
  }
  for (const line of o.lines || []) {
    if (!line) continue;
    if (line instanceof Node) art.appendChild(line);
    else art.appendChild(el('p', 'stat__line', line));
  }
  if (o.body) art.appendChild(o.body);
  art.appendChild(def);
  return art;
}

function section(title, sub, cards) {
  const sec = el('section', 'ssec');
  const h = el('div', 'ssec__head');
  h.appendChild(el('h2', 'title ssec__title', title));
  if (sub) h.appendChild(el('p', 'ssec__sub', sub));
  sec.appendChild(h);
  const grid = el('div', 'sgrid');
  cards.filter(Boolean).forEach((c) => grid.appendChild(c));
  sec.appendChild(grid);
  return sec;
}

/* a line with a coloured result in it: "Average win +$412.00 (n 8)" */
function resultLine(label, v, u, extra) {
  const p = el('p', 'stat__line');
  p.appendChild(document.createTextNode(label + ' '));
  if (v === null || v === undefined || !Number.isFinite(v)) p.appendChild(el('span', 'dim', 'none yet'));
  else p.appendChild(el('span', tone(v), fmtUnit(v, u)));
  if (extra) p.appendChild(document.createTextNode(' ' + extra));
  return p;
}

/* ------------------------------------------------------------ filters */

function filtered(s) {
  const today = tradingDay(Date.now(), s.dayStart);
  const since = (days) => Date.now() - days * 864e5;
  return J.all().filter((e) => {
    const r = J.result(e, s);
    if (!r) return false;
    if (state.instrument && e.instrument !== state.instrument) return false;
    if (state.account && (e.account || '').trim().toLowerCase() !== state.account) return false;
    if (state.period === 'month' && monthOf(r.day) !== monthOf(today)) return false;
    if (state.period === 'week' && weekOf(r.day) !== weekOf(today)) return false;
    if (state.period === '30' && r.at < since(30)) return false;
    if (state.period === '90' && r.at < since(90)) return false;
    return true;
  });
}

function fillFilters() {
  const ins = document.querySelector('[data-sfilter="instrument"]');
  const acc = document.querySelector('[data-sfilter="account"]');
  const used = [...new Set(J.all().map((e) => e.instrument))].sort();
  ins.replaceChildren(new Option('All', ''), ...used.map((c) => new Option(c, c)));
  ins.value = used.includes(state.instrument) ? state.instrument : '';
  const names = [...new Set([...J.allAccounts().map((a) => a.name), ...J.all().map((e) => e.account).filter(Boolean)].map((n) => n.trim()))].sort();
  acc.replaceChildren(new Option('All', ''), ...names.map((n) => new Option(n, n.toLowerCase())));
  acc.value = names.some((n) => n.toLowerCase() === state.account) ? state.account : '';
}

/* ------------------------------------------------------------ render */

export function renderStats() {
  const s = settings.get();
  const u = s.units;
  fillFilters();
  const T = C.prepare(filtered(s), s);
  const st = C.compute(T, s, { window: state.window });
  const box = document.querySelector('[data-stats]');
  box.replaceChildren();

  const lede = document.querySelector('[data-stats-lede]');
  lede.textContent = st.n
    ? trades(st.n) + (st.n > 1 ? ', closed between ' + shortDateET(st.from) + ' and ' + longDateET(st.to) : ', closed ' + longDateET(st.to)) + '. ' +
      (s.basis === 'gross' ? 'Gross, before costs.' : 'Net of costs.') + ' In ' + (u === 'r' ? 'R' : UNIT_LABEL[u].toLowerCase()) + (u === 'ticks' || u === 'points' ? ' per contract' : '') + '.' +
      (u === 'r' ? ' R counts only the ' + st.nv + ' trades with an initial stop.' : '')
    : 'No entries match. Stats are worked out from your entries as soon as there are some.';
  document.querySelector('[data-stats-boundary]').textContent = boundaryText(s.dayStart) + ' Moving that boundary changes every daily figure.';
  if (!st.n) return;

  const R = st.results, K = st.risk, X = st.execution, W = st.when, Q = st.consistency;
  const f = (v) => fmtUnit(v, u);

  /* --- results ------------------------------------------------------------- */
  box.appendChild(section('Results', s.basis === 'gross' ? 'Gross, before costs.' : 'Net of costs by default; switch to gross above.', [
    card('net', { key: true, n: R.net.n, value: f(R.net.v), valueCls: tone(R.net.v),
      lines: ['In money: ' + money(R.costsShare.gross - R.costsShare.costs) + ' net, ' + money(R.costsShare.gross) + ' gross, ' + money(R.costsShare.costs, { sign: false }) + ' costs.'] }),
    card('costsShare', { key: true, n: R.costsShare.n,
      value: R.costsShare.share !== null ? pctf(R.costsShare.share) : money(R.costsShare.costs, { sign: false }),
      lines: [R.costsShare.share !== null
        ? money(R.costsShare.costs, { sign: false }) + ' of costs on ' + money(R.costsShare.gross) + ' gross.'
        : 'Costs of ' + money(R.costsShare.costs, { sign: false }) + ' while gross P&L is ' + money(R.costsShare.gross) + ', so a share would mean nothing.'] }),
    card('winRate', { key: true, n: R.winRate.n, tooFew: R.winRate.tooFew,
      value: pctf(R.winRate.rate),
      lines: [range(R.winRate.range, pctf), R.winRate.k + ' won, ' + (R.winRate.n - R.winRate.k - R.winRate.be) + ' lost' + (R.winRate.be ? ', ' + R.winRate.be + ' at breakeven' : '') + '.'] }),
    card('avgWinLoss', { key: true, n: st.n, value: R.payoff.tooFew || R.payoff.v === null ? undefined : R.payoff.v.toFixed(2) + ' payoff',
      tooFew: R.payoff.tooFew, fewWhy: 'The payoff ratio is shown from ' + C.MIN + ' trades.',
      lines: [resultLine('Average win', R.avgWin.v, u, '(n ' + R.avgWin.n + ')'), resultLine('Average loss', R.avgLoss.v, u, '(n ' + R.avgLoss.n + ')')] }),
    card('expectancy', { key: true, n: R.expectancy.n, tooFew: R.expectancy.tooFew,
      value: f(R.expectancy.v), valueCls: tone(R.expectancy.v),
      lines: [range(R.expectancy.range, f) ? 'Per trade, ' + range(R.expectancy.range, f) + '.' : null,
        u !== 'money' && R.expectancy.money !== null ? 'In money: ' + money(R.expectancy.money) + ' a trade.' : null,
        u !== 'r' ? (R.expectancy.nR ? 'In R: ' + fmtUnit(R.expectancy.r, 'r') + ' a trade, on the ' + R.expectancy.nR + ' with an initial stop.' : 'In R: needs initial stops on the entries.') : null] }),
    card('profitFactor', { n: st.n, tooFew: R.profitFactor.tooFew,
      value: R.profitFactor.noLosses ? 'No losses yet' : R.profitFactor.v === null ? 'No wins yet' : R.profitFactor.v.toFixed(2),
      lines: [f(R.profitFactor.wins) + ' won against ' + f(-R.profitFactor.losses) + ' lost.'] }),
    card('median', { n: R.median.n, tooFew: R.median.tooFew, value: f(R.median.v), valueCls: tone(R.median.v),
      lines: [resultLine('Average', R.median.avg, u, R.median.avg !== null && R.median.v !== null ? '; the gap is how far outliers pull it.' : '')] }),
    card('withoutBest', { n: st.nv, body: (() => {
      const b = el('div', 'stat__rows');
      R.withoutBest.forEach((x) => {
        const row = el('p', 'stat__row');
        row.appendChild(el('span', 'dim', 'Without the best ' + (x.k === 1 ? 'trade' : x.k + ' trades')));
        row.appendChild(x.v === null ? el('span', 'dim', 'needs more than ' + x.k + ' trades') : el('span', tone(x.v), f(x.v)));
        b.appendChild(row);
      });
      return b;
    })() }),
  ]));

  /* --- risk and drawdown --------------------------------------------------- */
  box.appendChild(section('Risk and drawdown', 'Falls from a peak, and results against the risk planned at entry.', [
    card('maxDD', { key: true, wide: true, n: K.maxDD.n, value: K.maxDD.closed ? f(-K.maxDD.closed) : 'None yet', valueCls: K.maxDD.closed ? tone(-1) : '',
      lines: [K.maxDD.closed && K.maxDD.troughAt ? 'On closed trades, from ' + shortDateET(K.maxDD.peakAt) + ' to ' + shortDateET(K.maxDD.troughAt) + '.' : 'On closed trades.',
        K.maxDD.open !== null ? 'On open equity, estimated from MAE on ' + K.maxDD.openN + ' of ' + st.nv + ' trades: ' + f(-K.maxDD.open) + '.' : 'On open equity: needs MAE on the entries.'],
      body: charts.equity(K.curve, u) }),
    card('rMultiples', { key: true, n: K.rMultiples.n, value: K.rMultiples.n ? fmtUnit(K.rMultiples.avg, 'r') + ' average' : 'No initial stops yet', valueCls: K.rMultiples.n ? tone(K.rMultiples.avg) : '',
      lines: [K.rMultiples.n ? K.rMultiples.n + ' of ' + K.rMultiples.of + ' trades have an initial stop. Median ' + fmtUnit(K.rMultiples.median, 'r') + '.' : 'R needs the stop planned at entry on each entry.'],
      body: K.rMultiples.n ? charts.histogram(K.rMultiples.hist) : null }),
    card('ddLength', { n: K.ddLength.n, value: K.ddLength.longest ? duration(K.ddLength.longest) : K.ddLength.stillUnder ? duration(K.ddLength.stillUnder) : 'Never below a peak',
      lines: [K.ddLength.longest ? 'The longest spell below a previous peak.' : null,
        K.ddLength.stillUnder ? 'Below its peak now, for ' + duration(K.ddLength.stillUnder) + '.' : null,
        K.ddLength.recovery ? 'Climbing back from the deepest point took ' + duration(K.ddLength.recovery) + '.' : (K.maxDD.closed ? 'Not yet back from the deepest point.' : null)] }),
    card('worst', { n: st.consistency.days, body: (() => {
      const b = el('div', 'stat__rows');
      for (const [label, w, fmtKey] of [['Worst day', K.worstDay, (k) => longDateET(Date.parse(k + 'T16:00:00Z'))], ['Worst week', K.worstWeek, (k) => 'week of ' + shortDateET(Date.parse(k + 'T16:00:00Z'))]]) {
        const row = el('p', 'stat__row');
        row.appendChild(el('span', 'dim', label + (w ? ', ' + fmtKey(w.key) : '')));
        row.appendChild(w ? el('span', tone(w.v), f(w.v)) : el('span', 'dim', 'none yet'));
        b.appendChild(row);
      }
      return b;
    })() }),
    card('beyondPlan', { n: K.beyondPlan.n, value: K.beyondPlan.n ? K.beyondPlan.avg.toFixed(2) + '× planned' : 'No losers with a stop yet',
      lines: [K.beyondPlan.n ? K.beyondPlan.over + ' of ' + K.beyondPlan.n + ' losing trades lost more than planned.' : null,
        K.beyondPlan.losers > K.beyondPlan.n ? (K.beyondPlan.losers - K.beyondPlan.n) + ' losers had no initial stop and are left out.' : null] }),
    card('streak', { key: false, n: st.n, value: K.streak.longest + (K.streak.longest === 1 ? ' loss' : ' losses'),
      lines: [K.streak.chance ? 'At a ' + pctf(K.streak.chance.q) + ' loss rate over ' + st.n + ' trades, chance alone usually gives ' + K.streak.chance.lo + ' to ' + K.streak.chance.hi + ', most often ' + K.streak.chance.median + '.' : 'The comparison with chance is shown from ' + C.MIN + ' trades.'] }),
  ]));

  /* --- execution ----------------------------------------------------------- */
  const exLine = (label, o) => resultLine(label, o.v, u, '(n ' + o.n + ')');
  box.appendChild(section('Execution', 'How the trades were run, from what the entries record.', [
    card('maeMfe', { key: true, n: X.mae.win.n + X.mae.loss.n,
      lines: [el('p', 'kicker stat__k', 'Against you, MAE'), exLine('Winners', { v: X.mae.win.v === null ? null : -X.mae.win.v, n: X.mae.win.n }), exLine('Losers', { v: X.mae.loss.v === null ? null : -X.mae.loss.v, n: X.mae.loss.n }),
        el('p', 'kicker stat__k', 'In your favour, MFE'), exLine('Winners', X.mfe.win), exLine('Losers', X.mfe.loss)] }),
    card('hold', { key: true, n: X.hold.nWin + X.hold.nLoss, body: (() => {
      const b = el('div', 'stat__rows');
      [['Winners', X.hold.win, X.hold.nWin], ['Losers', X.hold.loss, X.hold.nLoss]].forEach(([l, v, nn]) => {
        const row = el('p', 'stat__row');
        row.append(el('span', 'dim', l + ' (n ' + nn + ')'), el('span', '', v !== null ? duration(v) : 'none yet'));
        b.appendChild(row);
      });
      return b;
    })(), lines: ['Medians, from entries with an exit time.'] }),
    card('efficiency', { n: X.efficiency.n, tooFew: X.efficiency.tooFew, fewWhy: 'Needs MFE on ' + C.MIN + ' trades; ' + X.efficiency.n + ' have it.', value: pctf(X.efficiency.v) + ' kept',
      lines: ['Of the best open profit, across all ' + X.efficiency.n + ' trades with an MFE.', X.efficiency.winners !== null ? 'On winners alone: ' + pctf(X.efficiency.winners) + ' (n ' + X.efficiency.nWin + ').' : null] }),
    card('slippage', { n: X.slippage.n, value: X.slippage.n ? (X.slippage.v > 0 ? ticksText(X.slippage.v) + ' worse' : X.slippage.v < 0 ? ticksText(-X.slippage.v) + ' better' : 'None') : 'Needs intended prices',
      lines: ['Estimated from the prices typed: there is no order data.'] }),
    card('timeInMarket', { n: X.timeInMarket.days, value: X.timeInMarket.days ? pctf(X.timeInMarket.v) : 'Needs exit times', lines: [X.timeInMarket.days ? 'Of the session, on the ' + X.timeInMarket.days + ' days traded.' : null] }),
  ]));

  /* --- when and how -------------------------------------------------------- */
  const gt = (groups) => charts.groupTable(groups, u, { tone });
  const pair = (a, b) => { const w = el('div'); w.append(gt([a, b].filter((g) => g && g.n))); return w; };
  box.appendChild(section('When and how', 'Results split by time, instrument and habit. Facts about the trades, not causes.', [
    card('timeOfDay', { key: true, wide: true, n: st.n, body: gt(W.timeOfDay) }),
    card('instrument', { key: true, wide: true, n: st.n, body: (() => { const b = el('div'); b.append(gt(W.instrument), gt(W.size)); return b; })() }),
    card('perDay', { key: true, n: W.perDay.days, tooFew: W.perDay.tooFew, fewWhy: 'The correlation is shown from ' + C.MIN_DAYS + ' trading days; there are ' + W.perDay.days + '.',
      value: W.perDay.r !== null ? (W.perDay.r >= 0 ? '+' : '−') + Math.abs(W.perDay.r).toFixed(2) : undefined,
      lines: W.perDay.buckets.filter((b) => b.days).map((b) => resultLine(b.label + ' (' + b.days + ' days): average day', b.avg, u)) }),
    card('weekday', { wide: true, n: st.n, body: gt(W.weekday) }),
    card('tags', { wide: true, n: st.n, body: (() => { const b = el('div'); b.append(el('p', 'kicker stat__k', 'Order flow tags'), gt(W.tags), el('p', 'kicker stat__k', 'Setups'), gt(W.setups), el('p', 'kicker stat__k', 'Checklist'), gt(W.checklist)); return b; })() }),
    card('afterLoss', { wide: true, n: W.afterLoss.nLoss + W.afterLoss.nWin, lines: [
      'Median gap after a loss: ' + (W.afterLoss.gapLoss !== null ? duration(W.afterLoss.gapLoss) : 'none yet') + ' (n ' + W.afterLoss.nLoss + ').',
      'After a win: ' + (W.afterLoss.gapWin !== null ? duration(W.afterLoss.gapWin) : 'none yet') + ' (n ' + W.afterLoss.nWin + ').'],
      body: pair(W.afterLoss.quick, W.afterLoss.later) }),
    card('sizeAfter', { n: W.sizeAfter.nLoss + W.sizeAfter.nWin, lines: [
      'After a loss: ' + (W.sizeAfter.loss !== null ? W.sizeAfter.loss.toFixed(1) + ' contracts' : 'none yet') + ' (n ' + W.sizeAfter.nLoss + ').',
      'After a win: ' + (W.sizeAfter.win !== null ? W.sizeAfter.win.toFixed(1) + ' contracts' : 'none yet') + ' (n ' + W.sizeAfter.nWin + ').'] }),
    card('news', { wide: true, n: st.n, body: pair(W.news.yes, W.news.no), lines: [
      !W.news.yes.n ? 'No trades near a high-impact release.' : null,
      W.news.unknown ? W.news.unknown + ' trades are outside the calendar and not marked on the entry, so they count as unknown.' : null,
      'Releases from ' + NEWS_SOURCE + ', checked ' + NEWS_CHECKED + '.'] }),
    card('afterLimit', { wide: true, n: st.n, body: pair(W.afterLimit.flagged, W.afterLimit.auto || W.afterLimit.within), lines: [
      W.afterLimit.limit ? 'Your daily limit in Settings: ' + money(W.afterLimit.limit, { sign: false }) + '.' : 'Set your daily limit in Settings to count these from the day\'s running net as well.'] }),
    card('moodSleep', { wide: true, n: st.n, body: (() => { const b = el('div'); b.append(el('p', 'kicker stat__k', 'Mood'), gt(W.mood), el('p', 'kicker stat__k', 'Sleep'), gt(W.sleep)); return b; })() }),
  ]));

  /* --- consistency --------------------------------------------------------- */
  const now = new Date();
  const lastDay = st.to ? new Date(st.to) : now;
  const rollBody = el('div');
  const toggle = el('div', 'seg stat__toggle');
  toggle.setAttribute('role', 'radiogroup');
  toggle.setAttribute('aria-label', 'Window');
  [20, 50].forEach((w) => {
    const b = el('button', 'seg__opt', 'Last ' + w);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', state.window === w ? 'true' : 'false');
    b.addEventListener('click', () => { state.window = w; renderStats(); });
    toggle.appendChild(b);
  });
  rollBody.append(toggle);
  if (!Q.rolling.tooFew) rollBody.append(charts.rolling(Q.rolling.points, u, Q.rolling.window));
  box.appendChild(section('Consistency', 'How evenly the results came, day by day.', [
    card('greenRed', { key: true, n: Q.days, value: Q.days ? pctf(Q.greenShare) + ' green' : 'No days yet',
      lines: [resultLine('Average green day', Q.green.avg, u, '(' + Q.green.days + ' days)'), resultLine('Average red day', Q.red.avg, u, '(' + Q.red.days + ' days)')] }),
    card('bestDay', { n: Q.days, value: Q.bestDay.share !== null ? pctf(Q.bestDay.share) : 'Not meaningful yet',
      lines: [Q.bestDay.share !== null ? 'Best day ' + f(Q.bestDay.v) + ' of ' + f(Q.bestDay.total) + ' net.' : 'Shown while net P&L and the best day are both positive.'] }),
    card('calendar', { wide: true, n: Q.days, body: (() => {
      const b = el('div');
      b.appendChild(el('p', 'kicker stat__k', lastDay.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'America/New_York' })));
      const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).format(lastDay).split('-').map(Number);
      b.appendChild(charts.month(ym[0], ym[1] - 1, Q.calendar.totals, Q.calendar.counts, u));
      const a = el('a', 'link', 'Every month, on the Calendar page');
      a.href = '#/calendar';
      b.appendChild(a);
      return b;
    })() }),
    card('rolling', { wide: true, n: st.nv, tooFew: Q.rolling.tooFew, fewWhy: 'Needs ' + Q.rolling.window + ' trades; there are ' + st.nv + '.', body: rollBody }),
  ]));

  /* --- reliability --------------------------------------------------------- */
  const ch = st.reliability.chance;
  box.appendChild(section('Reliability', 'How much weight these figures can bear.', [
    card('sample', { key: true, n: st.n, value: trades(st.n),
      lines: ['Every figure above carries its own n. Rates and averages show a likely range, and say "too few to say" below ' + C.MIN + ' trades.'] }),
    card('chance', { key: true, n: st.reliability.n, tooFew: st.reliability.tooFew, fewWhy: 'Shown from ' + C.MIN_CHANCE + ' trades.',
      value: ch ? pctf(ch.p) + ' of chance runs did as well' : undefined,
      lines: [ch ? (ch.p < 0.05 ? 'Unusual for chance alone. Not proof of skill, and nothing about the next trade.' : 'Well within what chance alone often produces with these trade sizes.') : null] }),
  ]));

  /* --- prop accounts and costs ------------------------------------------- */
  const accs = J.allAccounts();
  const propCards = accs.map((a) => {
    const r = C.account(a, s);
    const rows = el('div', 'stat__rows');
    const row = (label, valueNode) => { const p = el('p', 'stat__row'); p.append(el('span', 'dim', label), valueNode); rows.appendChild(p); };
    row('Balance', el('span', '', money(r.balance, { sign: false })));
    row('Trailing drawdown', r.drawdown ? el('span', r.drawdown.distance > 0 ? '' : 'pnl pnl--down', money(r.drawdown.distance, { sign: false }) + ' above the line at ' + money(r.drawdown.threshold, { sign: false })) : el('span', 'dim', 'no rule entered'));
    row('Daily loss', r.daily ? el('span', '', money(r.daily.left, { sign: false }) + ' left of ' + money(r.daily.limit, { sign: false }) + ' today') : el('span', 'dim', 'no rule entered'));
    row('Consistency', r.consistency ? el('span', '', r.consistency.share !== null ? pctf(r.consistency.share) + ' against a ' + pctf(r.consistency.rule) + ' rule' + (r.consistency.needed > 0 ? '; ' + money(r.consistency.needed, { sign: false }) + ' more profit to meet it' : '') : 'needs a profit first') : el('span', 'dim', 'no rule entered'));
    if (r.goal) row('Profit target', el('span', '', pctf(Math.max(0, r.goal.progress)) + ' of ' + money(r.goal.target, { sign: false })));
    const c = card('propRules', { n: r.n, body: rows });
    c.querySelector('.stat__name').textContent = a.name + (a.firm ? ' · ' + a.firm : '');
    return c;
  });
  const spent = accs.reduce((x, a) => x + C.account(a, s).spent, 0), paid = accs.reduce((x, a) => x + C.account(a, s).paid, 0);
  const co = st.costs;
  box.appendChild(section('Prop accounts and costs', 'From the Accounts page, and the costs on your entries.', [
    ...(propCards.length ? propCards : [card('propRules', { value: 'No accounts yet', lines: [(() => { const a = el('a', 'link', 'Add one on the Accounts page'); a.href = '#/accounts'; return a; })()] })]),
    card('propSpend', { n: accs.length, value: money(paid - spent), valueCls: tone(paid - spent),
      lines: [money(spent, { sign: false }) + ' spent on evaluations, resets and activations; ' + money(paid, { sign: false }) + ' paid out.'] }),
    card('costRate', { n: co.contracts, value: co.perRoundTurn !== null ? money(co.perRoundTurn, { sign: false }) + ' a round turn' : 'None yet',
      lines: [co.perDay !== null ? money(co.perDay, { sign: false }) + ' a trading day, over ' + co.days + ' days.' : null,
        'Trade costs ' + money(co.trade, { sign: false }) + (co.fees ? ' and monthly fees ' + money(co.fees, { sign: false }) + ' (' + co.months + (co.months === 1 ? ' month' : ' months') + ')' : '; no monthly fees set in Settings') + '.'] }),
  ]));
}

export function initStats() {
  document.querySelectorAll('[data-sfilter]').forEach((sel) => sel.addEventListener('change', () => {
    state[sel.dataset.sfilter] = sel.value;
    renderStats();
  }));
}
