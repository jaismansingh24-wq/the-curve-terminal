/* Small charts for the stats, drawn as SVG by hand, as the site draws its
   figures: greys, hairlines, mono labels; bid green and ask red only for
   results (classes from shared/css/data.css). Every chart carries a text
   description for screen readers. Styling is by class, never inline. */

import { el, unit as fmt } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, cls) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (cls) n.setAttribute('class', cls);
  return n;
}
function frame(w, h, label) {
  const svg = s('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label, preserveAspectRatio: 'none' }, 'chart');
  const t = s('title'); t.textContent = label; svg.appendChild(t);
  return svg;
}
const pts = (arr) => arr.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' ');

/* cumulative result, its running peak, and the drawdown between them */
export function equity(curve, unit) {
  const W = 600, H = 180, P = 6;
  const label = curve.length
    ? 'Cumulative result over ' + curve.length + ' trades, ending at ' + fmt(curve[curve.length - 1].eq, unit) + '.'
    : 'No trades to draw.';
  const svg = frame(W, H, label);
  if (curve.length < 2) return svg;
  const ys = [0, ...curve.map((c) => c.eq), ...curve.map((c) => c.peak)];
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const X = (i) => P + (i / (curve.length)) * (W - 2 * P);
  const Y = (v) => H - P - ((v - lo) / span) * (H - 2 * P);
  const eqPts = [[X(0), Y(0)], ...curve.map((c, i) => [X(i + 1), Y(c.eq)])];
  const pkPts = [[X(0), Y(0)], ...curve.map((c, i) => [X(i + 1), Y(c.peak)])];
  svg.appendChild(s('line', { x1: P, x2: W - P, y1: Y(0), y2: Y(0) }, 'chart__zero'));
  svg.appendChild(s('polygon', { points: pts([...pkPts, ...eqPts.slice().reverse()]) }, 'chart__dd'));
  svg.appendChild(s('polyline', { points: pts(pkPts) }, 'chart__peak'));
  svg.appendChild(s('polyline', { points: pts(eqPts) }, 'chart__line'));
  return svg;
}

/* the rolling average with its range, as a flat band */
export function rolling(points, unit, window) {
  const W = 600, H = 160, P = 6;
  const last = points[points.length - 1];
  const svg = frame(W, H, points.length
    ? 'Average of the last ' + window + ' trades, now ' + fmt(last.m, unit) + ', likely between ' + fmt(last.lo, unit) + ' and ' + fmt(last.hi, unit) + '.'
    : 'Not enough trades for a rolling average yet.');
  if (points.length < 2) return svg;
  const ys = [0, ...points.map((p) => p.lo), ...points.map((p) => p.hi)];
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const X = (i) => P + (i / (points.length - 1)) * (W - 2 * P);
  const Y = (v) => H - P - ((v - lo) / span) * (H - 2 * P);
  svg.appendChild(s('polygon', { points: pts([...points.map((p, i) => [X(i), Y(p.hi)]), ...points.map((p, i) => [X(i), Y(p.lo)]).reverse()]) }, 'chart__band'));
  svg.appendChild(s('line', { x1: P, x2: W - P, y1: Y(0), y2: Y(0) }, 'chart__zero'));
  svg.appendChild(s('polyline', { points: pts(points.map((p, i) => [X(i), Y(p.m)])) }, 'chart__line'));
  return svg;
}

/* the R-multiple distribution: one bar per bucket */
export function histogram(hist) {
  const W = 600, H = 150, gap = 10, n = hist.length;
  const max = Math.max(1, ...hist.map((h) => h.n));
  const svg = frame(W, H, 'R-multiples: ' + hist.map((h) => h.label + ', ' + h.n).join('; ') + '.');
  const bw = (W - gap * (n - 1)) / n;
  hist.forEach((h, i) => {
    const bh = (h.n / max) * (H - 26);
    const x = i * (bw + gap);
    if (h.n) svg.appendChild(s('rect', { x, y: H - 22 - bh, width: bw, height: bh, rx: 2 }, h.up ? 'bar bar--up' : 'bar bar--down'));
    const t = s('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle' }, 'chart__label');
    t.textContent = h.label;
    svg.appendChild(t);
    if (h.n) {
      const c = s('text', { x: x + bw / 2, y: H - 28 - bh, 'text-anchor': 'middle' }, 'chart__count');
      c.textContent = String(h.n);
      svg.appendChild(c);
    }
  });
  return svg;
}

/* a table of groups, each with a bar for its total; colour only with a sign */
export function groupTable(groups, unit, { tone, money }) {
  const wrap = el('div', 'gtable');
  if (!groups.length) { wrap.appendChild(el('p', 'stat__none', 'Nothing recorded for this yet.')); return wrap; }
  const max = Math.max(...groups.map((g) => Math.abs(g.total)), 1e-9);
  const head = el('div', 'gtable__row gtable__row--head');
  ['', 'Trades', 'Total', 'Average', 'Win rate'].forEach((h) => head.appendChild(el('span', '', h)));
  wrap.appendChild(head);
  for (const g of groups) {
    const row = el('div', 'gtable__row');
    const name = el('span', 'gtable__name', g.label);
    const bar = el('span', 'gtable__bar');
    const fill = el('span', g.total >= 0 ? 'bar-h bar-h--up' : 'bar-h bar-h--down');
    fill.style.width = Math.max(2, (Math.abs(g.total) / max) * 100).toFixed(1) + '%';
    bar.appendChild(fill);
    name.appendChild(bar);
    row.appendChild(name);
    row.appendChild(el('span', 'num', String(g.n)));
    row.appendChild(el('span', 'num ' + tone(g.total), fmt(g.total, unit)));
    row.appendChild(el('span', 'num ' + (g.tooFew || g.avg === null ? 'dim' : tone(g.avg)), g.tooFew ? 'Too few' : fmt(g.avg, unit)));
    row.appendChild(el('span', 'num dim', g.tooFew || g.win === null ? 'Too few' : Math.round(g.win * 100) + '%'));
    wrap.appendChild(row);
  }
  return wrap;
}

/* one month of trading days, in greys: darker for larger days, with signs */
export function month(year, mon, totals, counts, unit) {
  const box = el('div', 'heat');
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  names.forEach((d) => box.appendChild(el('span', 'heat__dow', d)));
  const first = new Date(Date.UTC(year, mon, 1));
  const daysIn = new Date(Date.UTC(year, mon + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  for (let i = 0; i < lead; i++) box.appendChild(el('span', 'heat__cell heat__cell--blank'));
  const vals = [];
  for (let d = 1; d <= daysIn; d++) {
    const key = year + '-' + String(mon + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    if (totals.has(key)) vals.push(Math.abs(totals.get(key)));
  }
  const max = Math.max(1e-9, ...vals);
  for (let d = 1; d <= daysIn; d++) {
    const key = year + '-' + String(mon + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const cell = el('span', 'heat__cell');
    cell.appendChild(el('span', 'heat__d', String(d)));
    if (counts.has(key)) {
      const v = totals.get(key) || 0;
      /* shade by size, in grey; the sign carries the direction */
      cell.style.backgroundColor = 'rgb(255 255 255 / ' + (0.04 + 0.22 * (Math.abs(v) / max)).toFixed(3) + ')';
      cell.classList.add('is-traded');
      cell.appendChild(el('span', 'heat__v', fmt(v, unit)));
      cell.appendChild(el('span', 'heat__n', counts.get(key) + (counts.get(key) === 1 ? ' trade' : ' trades')));
      cell.setAttribute('aria-label', key + ': ' + fmt(v, unit) + ', ' + counts.get(key) + ' trades');
    } else cell.setAttribute('aria-label', key + ': no trades');
    box.appendChild(cell);
  }
  return box;
}
