/* Numbers as the journal shows them: thousands with commas, a real minus
   sign, a plus on every gain, tabular figures. A result's colour (bid green,
   ask red) always comes with its sign, so colour is never the only cue. */

const MONEY = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ONE = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const TWO = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INT = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export const MINUS = '−';

function signed(v, body) {
  if (Math.abs(v) < 1e-9) return body(0);
  return (v > 0 ? '+' : MINUS) + body(Math.abs(v));
}

export function money(v, { sign = true } = {}) {
  if (!Number.isFinite(v)) return '';
  return sign ? signed(v, (a) => '$' + MONEY.format(a)) : (v < 0 ? MINUS : '') + '$' + MONEY.format(Math.abs(v));
}

/* a value in the chosen unit: "+$412.50", "+16.5 ticks", "+4.13 pts", "+1.20R" */
export function unit(v, u) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  if (u === 'ticks') return signed(v, (a) => ONE.format(a)) + ' ticks';
  if (u === 'points') return signed(v, (a) => TWO.format(a)) + ' pts';
  if (u === 'r') return signed(v, (a) => TWO.format(a)) + 'R';
  return money(v);
}

/* the class that colours a result: data colours, for results only */
export function tone(v) {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-9) return 'pnl pnl--flat';
  return v > 0 ? 'pnl pnl--up' : 'pnl pnl--down';
}

export const int = (n) => INT.format(n);

export const UNIT_LABEL = { money: 'Money', ticks: 'Ticks', points: 'Points', r: 'R' };

/* "3 trades", "1 trade" */
export const trades = (n) => int(n) + (n === 1 ? ' trade' : ' trades');

/* the label every simulated entry and account carries wherever it shows */
export function simTag() {
  const t = document.createElement('span');
  t.className = 'simtag';
  t.textContent = 'Simulated';
  return t;
}

/* text for an element, safely: everything the journal shows goes in as text */
export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
