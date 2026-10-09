/* The Calendar: each trading day's result, a month at a time, in greys
   with plus and minus signs (colour is kept for figures, as chosen). */

import * as J from './journal.js';
import * as settings from './settings.js';
import * as C from './stats-calc.js';
import * as charts from './charts.js';
import { unit as fmtUnit, tone, el, trades } from './format.js';
import { tradingDay, boundaryText } from './time.js';

let ym = null;   /* [year, month index] being shown */

export function renderCalendar() {
  const s = settings.get();
  const T = C.prepare(J.all(), s);
  if (!ym) {
    /* open on this month, or, if it has no trades yet, the latest month that has */
    const today = tradingDay(Date.now(), s.dayStart);
    const thisMonth = today.slice(0, 7);
    const latest = T.length ? T[T.length - 1].day.slice(0, 7) : thisMonth;
    const d = T.some((t) => t.day.startsWith(thisMonth)) ? thisMonth : latest;
    ym = [Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1];
  }
  const st = C.compute(T, s);
  const key = ym[0] + '-' + String(ym[1] + 1).padStart(2, '0');
  const box = document.querySelector('[data-cal]');
  box.replaceChildren(charts.month(ym[0], ym[1], st.consistency.calendar.totals, st.consistency.calendar.counts, s.units));

  const monthTrades = T.filter((t) => t.day.startsWith(key));
  const total = monthTrades.filter((t) => t.v !== null).reduce((x, t) => x + t.v, 0);
  const title = new Date(Date.UTC(ym[0], ym[1], 15)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  document.querySelector('[data-cal-title]').textContent = title;
  const sum = document.querySelector('[data-cal-sum]');
  sum.replaceChildren();
  if (monthTrades.length) {
    sum.append(document.createTextNode(trades(monthTrades.length) + ', '), el('span', tone(total), fmtUnit(total, s.units)), document.createTextNode(' for the month.'));
  } else sum.textContent = 'No trades this month.';
  const sims = monthTrades.filter((t) => J.isSim(t.e)).length;
  document.querySelector('[data-cal-note]').textContent = boundaryText(s.dayStart) + (sims ? ' ' + sims + ' of the trades this month are simulated: generated, not real.' : '');
}

export function initCalendar() {
  document.querySelector('[data-cal-prev]').addEventListener('click', () => { ym = ym[1] === 0 ? [ym[0] - 1, 11] : [ym[0], ym[1] - 1]; renderCalendar(); });
  document.querySelector('[data-cal-next]').addEventListener('click', () => { ym = ym[1] === 11 ? [ym[0] + 1, 0] : [ym[0], ym[1] + 1]; renderCalendar(); });
}
