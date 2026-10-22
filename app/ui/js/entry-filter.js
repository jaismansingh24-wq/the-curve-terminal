/* Which entries a page shows. Overview and Stats share these rules, so
   "Stats for these trades" on Overview gives Stats exactly the same set.

   A filter is { q, instrument, side, account, setup, mistake, period, from, to }:
     q        words to find; each must appear somewhere in the entry's
              instrument, side, account, setup, main confluence, order flow,
              mistakes or notes (case and accents are ignored)
     account  and setup: matched as typed on the entry, ignoring case
     mistake  one of the mistakes ticked on the entry
     period   '' (all time), 'day', 'week', 'month' (the current one, by
              trading day), '30' or '90' (days back from now), or 'range'
     from, to trading days such as "2026-09-01", used when period is 'range';
              either can be left blank */

import { tradingDay, weekOf, monthOf } from './time.js';

export const blank = () => ({ q: '', instrument: '', side: '', account: '', setup: '', mistake: '', period: '', from: '', to: '' });

/* for matching: lower case, accents off, spaces trimmed */
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function matcher(f, s) {
  const now = Date.now(), today = tradingDay(now, s.dayStart);
  const words = fold(f.q).split(/\s+/).filter(Boolean);
  const account = fold(f.account), setup = fold(f.setup);
  return (e, r) => {
    if (!r) return false;
    if (f.instrument && e.instrument !== f.instrument) return false;
    if (f.side && e.direction !== f.side) return false;
    if (account && fold(e.account) !== account) return false;
    if (setup && fold(e.setup) !== setup) return false;
    if (f.mistake && !(e.mistakes || []).includes(f.mistake)) return false;
    if (f.period === 'day' && r.day !== today) return false;
    if (f.period === 'week' && weekOf(r.day) !== weekOf(today)) return false;
    if (f.period === 'month' && monthOf(r.day) !== monthOf(today)) return false;
    if (f.period === '30' && r.at < now - 30 * 864e5) return false;
    if (f.period === '90' && r.at < now - 90 * 864e5) return false;
    if (f.period === 'range' && ((f.from && r.day < f.from) || (f.to && r.day > f.to))) return false;
    if (words.length) {
      const text = fold([e.instrument, e.direction, e.account, e.setup, e.confluence, ...(e.orderflow || []), ...(e.mistakes || []), e.notes].join('\n'));
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  };
}

export const isBlank = (f) => !f.q.trim() && !f.instrument && !f.side && !f.account && !f.setup && !f.mistake && !f.period;

/* "6 October 2026" */
const longDay = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const PERIOD = { day: 'today', week: 'this week', month: 'this month', 30: 'the last 30 days', 90: 'the last 90 days' };

/* a filter in plain words, one phrase each; only the parts named in `only`
   when it is given */
export function describe(f, only = null) {
  const want = (k) => !only || only.includes(k);
  const out = [];
  if (want('q') && f.q.trim()) out.push('with "' + f.q.trim() + '"');
  if (want('instrument') && f.instrument) out.push(f.instrument);
  if (want('side') && f.side) out.push(f.side === 'short' ? 'short' : 'long');
  if (want('account') && f.account) out.push('account ' + f.account);
  if (want('setup') && f.setup) out.push('setup ' + f.setup);
  if (want('mistake') && f.mistake) out.push('mistake "' + f.mistake + '"');
  if (want('period') && PERIOD[f.period]) out.push(PERIOD[f.period]);
  if (want('period') && f.period === 'range' && (f.from || f.to)) {
    out.push(f.from && f.to ? 'from ' + longDay(f.from) + ' to ' + longDay(f.to) : f.from ? 'from ' + longDay(f.from) : 'up to ' + longDay(f.to));
  }
  return out;
}
