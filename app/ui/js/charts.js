/* Charts for the stats, drawn as SVG by hand, as the site draws its figures:
   greys and hairlines, mono axis labels, and bid green and ask red only for
   results (classes from shared/css/data.css).

   Each chart is drawn at the real pixel size of its panel, so axis text is
   never stretched, and is redrawn when the panel changes size. Moving the
   pointer over a chart shows what is under it in a small glass card (our
   own, never the stock tooltip). Every chart carries a plain description
   for screen readers. Styling is by class or the CSSOM, never inline. */

import { el, unit as fmt, money } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, cls) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (cls) n.setAttribute('class', cls);
  return n;
}
function text(parent, x, y, str, cls, anchor = 'start') {
  const t = s('text', { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': anchor }, cls);
  t.textContent = str;
  parent.appendChild(t);
  return t;
}
const MINUS = '−';

/* ------------------------------------------------------------ tooltip */

let tipEl = null;
function tip() {
  if (!tipEl) {
    tipEl = el('div', 'ctip');
    tipEl.setAttribute('role', 'status');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
/* lines: [heading, [label, value, cls?], ...] */
export function showTip(lines, x, y) {
  const t = tip();
  t.replaceChildren();
  lines.forEach((l, i) => {
    if (typeof l === 'string') { t.appendChild(el('p', i ? 'ctip__l' : 'ctip__h', l)); return; }
    const p = el('p', 'ctip__row');
    p.append(el('span', 'ctip__k', l[0]), el('span', 'ctip__v ' + (l[2] || ''), l[1]));
    t.appendChild(p);
  });
  t.hidden = false;
  const r = t.getBoundingClientRect();
  let left = x + 16, top = y + 16;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 16;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - 16;
  t.style.left = Math.max(8, left) + 'px';
  t.style.top = Math.max(8, top) + 'px';
}
export function hideTip() { if (tipEl) tipEl.hidden = true; }

function hover(node, lines) {
  node.addEventListener('pointermove', (e) => showTip(typeof lines === 'function' ? lines() : lines, e.clientX, e.clientY));
  node.addEventListener('pointerleave', hideTip);
}

/* ------------------------------------------------------------ frames */

/* A panel that draws itself at its own size. draw(svg, W, H) runs when the
   panel is in the page and again whenever its size changes. */
const ro = new ResizeObserver((items) => items.forEach((i) => paint(i.target)));
function paint(box) {
  const W = Math.round(box.clientWidth), H = Math.round(box.clientHeight);
  if (!W || !H || (box.__w === W && box.__h === H)) return;
  box.__w = W; box.__h = H;
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' }, 'chart');
  box.replaceChildren(svg);
  box.__draw(svg, W, H);
}
function chartBox(label, draw, cls = '') {
  const box = el('div', 'chartbox ' + cls);
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', label);
  box.__draw = draw;
  return box;
}
/* start drawing every chart inside a container that is now in the page */
export function observe(root) {
  root.querySelectorAll('.chartbox').forEach((b) => { b.__w = 0; ro.observe(b); });
}

/* "nice" ticks for an axis: 1, 2 or 5 times a power of ten */
function ticks(lo, hi, n = 4) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const step0 = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(step0))), e = step0 / mag;
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
/* short axis labels: +$1.2k, −$800, +12 ticks as +12, +1.5R */
function axisLabel(v, unit) {
  const sign = v > 0 ? '+' : v < 0 ? MINUS : '';
  const a = Math.abs(v);
  if (unit === 'r') return sign + (a < 10 ? a.toFixed(a % 1 ? 1 : 0) : a.toFixed(0)) + 'R';
  if (unit === 'ticks' || unit === 'points') return sign + (a >= 1000 ? (a / 1000).toFixed(1) + 'k' : a % 1 ? a.toFixed(1) : a.toFixed(0));
  if (unit === 'count') return a.toFixed(0);
  return sign + '$' + (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k' : a.toFixed(0));
}
const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', day: 'numeric', month: 'short' });
const dayLabel = (ms) => DAY.format(new Date(ms));
const keyLabel = (k) => DAY.format(new Date(k + 'T16:00:00Z'));

/* a value axis on the left, with hairline gridlines across the plot */
function yAxis(svg, P, lo, hi, unit) {
  const T = ticks(lo, hi, 4);
  const min = Math.min(lo, T[0]), max = Math.max(hi, T[T.length - 1]);
  const Y = (v) => P.t + (1 - (v - min) / (max - min || 1)) * (P.h);
  for (const v of T) {
    svg.appendChild(s('line', { x1: P.l, x2: P.l + P.w, y1: Y(v), y2: Y(v) }, v === 0 ? 'chart__zero' : 'chart__grid'));
    text(svg, P.l - 8, Y(v) + 4, axisLabel(v, unit), 'chart__axis', 'end');
  }
  return Y;
}
function plot(W, H, { left = 58, bottom = 24, top = 10, right = 12 } = {}) {
  return { l: left, t: top, w: W - left - right, h: H - top - bottom, b: H - bottom };
}

/* ------------------------------------------------------------ the charts */

/* cumulative result, its running peak, and the drawdown between them */
export function equity(curve, unit) {
  const last = curve[curve.length - 1];
  const label = curve.length
    ? 'Cumulative result over ' + curve.length + ' trades, ending at ' + fmt(last.eq, unit) + '. Hover for each trade.'
    : 'No trades to draw.';
  return chartBox(label, (svg, W, H) => {
    if (curve.length < 2) { text(svg, W / 2, H / 2, 'Not enough trades to draw yet', 'chart__empty', 'middle'); return; }
    const P = plot(W, H);
    const ys = [0, ...curve.map((c) => c.eq), ...curve.map((c) => c.peak)];
    const Y = yAxis(svg, P, Math.min(...ys), Math.max(...ys), unit);
    const X = (i) => P.l + (i / curve.length) * P.w;
    const pt = (i, v) => X(i).toFixed(1) + ',' + Y(v).toFixed(1);
    const eq = [pt(0, 0), ...curve.map((c, i) => pt(i + 1, c.eq))];
    const pk = [pt(0, 0), ...curve.map((c, i) => pt(i + 1, c.peak))];
    svg.appendChild(s('polygon', { points: [...pk, ...eq.slice().reverse()].join(' ') }, 'chart__dd'));
    svg.appendChild(s('polyline', { points: pk.join(' ') }, 'chart__peak'));
    svg.appendChild(s('polyline', { points: eq.join(' ') }, 'chart__line'));
    [0, Math.floor((curve.length - 1) / 2), curve.length - 1].forEach((i, k) =>
      text(svg, X(i + 1), H - 6, dayLabel(curve[i].at), 'chart__axis', k === 0 ? 'start' : k === 2 ? 'end' : 'middle'));
    /* the pointer: a hairline and a dot on the nearest trade */
    const cross = s('line', { y1: P.t, y2: P.b }, 'chart__cross'), dot = s('circle', { r: 3.5 }, 'chart__dot');
    cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden');
    svg.append(cross, dot);
    const hit = s('rect', { x: P.l, y: P.t, width: P.w, height: P.h }, 'chart__hit');
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(curve.length - 1, Math.round(((e.clientX - r.left - P.l) / P.w) * curve.length) - 1));
      const c = curve[i];
      cross.setAttribute('x1', X(i + 1)); cross.setAttribute('x2', X(i + 1)); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', X(i + 1)); dot.setAttribute('cy', Y(c.eq)); dot.setAttribute('visibility', 'visible');
      showTip(['Trade ' + (i + 1) + ' · ' + dayLabel(c.at), ['Cumulative', fmt(c.eq, unit), c.eq >= 0 ? 'pnl pnl--up' : 'pnl pnl--down'],
        ['Peak so far', fmt(c.peak, unit)], ['Below the peak', c.peak - c.eq > 1e-9 ? fmt(c.eq - c.peak, unit) : 'at the peak', c.peak - c.eq > 1e-9 ? 'pnl pnl--down' : '']], e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', () => { hideTip(); cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
    svg.appendChild(hit);
  });
}

/* each trading day's total, as a bar above or below zero */
export function daily(totals, counts, unit) {
  const days = [...totals.keys()].sort();
  const label = days.length ? days.length + ' trading days. Hover for each day.' : 'No days to draw.';
  return chartBox(label, (svg, W, H) => {
    if (!days.length) { text(svg, W / 2, H / 2, 'No days yet', 'chart__empty', 'middle'); return; }
    const P = plot(W, H);
    const vals = days.map((d) => totals.get(d));
    const Y = yAxis(svg, P, Math.min(0, ...vals), Math.max(0, ...vals), unit);
    const step = P.w / days.length, bw = Math.max(2, Math.min(18, step * 0.7));
    days.forEach((d, i) => {
      const v = totals.get(d), x = P.l + i * step + (step - bw) / 2, y0 = Y(0), y1 = Y(v);
      svg.appendChild(s('rect', { x, y: Math.min(y0, y1), width: bw, height: Math.max(1, Math.abs(y1 - y0)), rx: 1.5 }, v >= 0 ? 'bar bar--up' : 'bar bar--down'));
      const hit = s('rect', { x: P.l + i * step, y: P.t, width: step, height: P.h }, 'chart__hit');
      hover(hit, [keyLabel(d), ['Result', fmt(v, unit), v >= 0 ? 'pnl pnl--up' : 'pnl pnl--down'], ['Trades', String(counts.get(d) || 0)]]);
      svg.appendChild(hit);
    });
    [0, Math.floor((days.length - 1) / 2), days.length - 1].forEach((i, k) =>
      text(svg, P.l + i * step + step / 2, H - 6, keyLabel(days[i]), 'chart__axis', k === 0 ? 'start' : k === 2 ? 'end' : 'middle'));
  });
}

/* winners, losers and breakeven as a ring, with the win rate in the middle */
export function donut(won, lost, even) {
  const n = won + lost + even;
  const parts = [['Winners', won, 'seg seg--up'], ['Losers', lost, 'seg seg--down'], ['Breakeven', even, 'seg seg--flat']].filter((p) => p[1] > 0);
  const label = n ? won + ' winners, ' + lost + ' losers and ' + even + ' at breakeven, of ' + n + ' trades.' : 'No trades yet.';
  return chartBox(label, (svg, W, H) => {
    if (!n) { text(svg, W / 2, H / 2, 'No trades yet', 'chart__empty', 'middle'); return; }
    const R = Math.min(H / 2 - 10, W * 0.24), r = R * 0.62, cx = R + 14, cy = H / 2;
    let a0 = -Math.PI / 2;
    for (const [name, v, cls] of parts) {
      const a1 = a0 + (v / n) * Math.PI * 2;
      let node;
      if (v === n) {
        node = s('path', { d: `M${cx - R},${cy}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0M${cx - r},${cy}a${r},${r} 0 1,1 ${2 * r},0a${r},${r} 0 1,1 ${-2 * r},0`, 'fill-rule': 'evenodd' }, cls);
      } else {
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = (rad, a) => (cx + rad * Math.cos(a)).toFixed(2) + ',' + (cy + rad * Math.sin(a)).toFixed(2);
        node = s('path', { d: `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z` }, cls);
      }
      hover(node, [name, ['Trades', v + ' of ' + n], ['Share', Math.round((v / n) * 100) + '%']]);
      svg.appendChild(node);
      a0 = a1;
    }
    text(svg, cx, cy + 2, Math.round((won / n) * 100) + '%', 'chart__big', 'middle');
    text(svg, cx, cy + 20, 'won', 'chart__axis', 'middle');
    /* the legend beside the ring */
    const lx = cx + R + 22;
    [['Winners', won, 'seg--up'], ['Losers', lost, 'seg--down'], ['Breakeven', even, 'seg--flat']].forEach(([name, v, cls], i) => {
      const y = cy - 26 + i * 26;
      svg.appendChild(s('rect', { x: lx, y: y - 9, width: 10, height: 10, rx: 2 }, 'seg ' + cls));
      text(svg, lx + 18, y, name, 'chart__legend');
      text(svg, W - 12, y, v + '  ·  ' + Math.round((v / n) * 100) + '%', 'chart__axis', 'end');
    });
  });
}

/* the R-multiple distribution, with R values on the bin edges */
export function histogram(hist) {
  const total = hist.reduce((a, h) => a + h.n, 0);
  const label = 'R-multiples: ' + hist.map((h) => h.label + ', ' + h.n).join('; ') + '.';
  return chartBox(label, (svg, W, H) => {
    if (!total) { text(svg, W / 2, H / 2, 'No initial stops recorded yet', 'chart__empty', 'middle'); return; }
    const P = plot(W, H, { left: 40, bottom: 26 });
    const Y = yAxis(svg, P, 0, Math.max(...hist.map((h) => h.n)), 'count');
    const step = P.w / hist.length, gap = Math.min(10, step * 0.18);
    hist.forEach((h, i) => {
      const x = P.l + i * step + gap / 2, y = Y(h.n);
      if (h.n) svg.appendChild(s('rect', { x, y, width: step - gap, height: Math.max(1, P.b - y), rx: 2 }, h.up ? 'bar bar--up' : 'bar bar--down'));
      const hit = s('rect', { x: P.l + i * step, y: P.t, width: step, height: P.h }, 'chart__hit');
      hover(hit, [h.label, ['Trades', String(h.n)], ['Share', Math.round((h.n / total) * 100) + '%']]);
      svg.appendChild(hit);
    });
    /* edges between the bins: −2R, −1R, 0, 1R, 2R, 3R */
    ['−2R', '−1R', '0', '1R', '2R', '3R'].forEach((t, i) => text(svg, P.l + (i + 1) * step, H - 8, t, 'chart__axis', 'middle'));
  });
}

/* the rolling average, with its 95% range as a flat band */
export function rolling(points, unit, window) {
  const last = points[points.length - 1];
  const label = points.length
    ? 'Average of the last ' + window + ' trades, now ' + fmt(last.m, unit) + ', likely between ' + fmt(last.lo, unit) + ' and ' + fmt(last.hi, unit) + '.'
    : 'Not enough trades for a rolling average yet.';
  return chartBox(label, (svg, W, H) => {
    if (points.length < 2) { text(svg, W / 2, H / 2, 'Needs ' + window + ' trades', 'chart__empty', 'middle'); return; }
    const P = plot(W, H);
    const Y = yAxis(svg, P, Math.min(0, ...points.map((p) => p.lo)), Math.max(0, ...points.map((p) => p.hi)), unit);
    const X = (i) => P.l + (i / (points.length - 1)) * P.w;
    const pt = (i, v) => X(i).toFixed(1) + ',' + Y(v).toFixed(1);
    svg.appendChild(s('polygon', { points: [...points.map((p, i) => pt(i, p.hi)), ...points.map((p, i) => pt(i, p.lo)).reverse()].join(' ') }, 'chart__band'));
    svg.appendChild(s('polyline', { points: points.map((p, i) => pt(i, p.m)).join(' ') }, 'chart__line'));
    text(svg, P.l, H - 6, 'Trade ' + (points[0].i + 1), 'chart__axis', 'start');
    text(svg, P.l + P.w, H - 6, 'Trade ' + (last.i + 1), 'chart__axis', 'end');
    const cross = s('line', { y1: P.t, y2: P.b }, 'chart__cross');
    cross.setAttribute('visibility', 'hidden');
    svg.appendChild(cross);
    const hit = s('rect', { x: P.l, y: P.t, width: P.w, height: P.h }, 'chart__hit');
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left - P.l) / P.w) * (points.length - 1))));
      const p = points[i];
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      showTip(['Trades ' + (p.i - window + 2) + ' to ' + (p.i + 1), ['Average', fmt(p.m, unit), p.m >= 0 ? 'pnl pnl--up' : 'pnl pnl--down'], ['Likely range', fmt(p.lo, unit) + ' to ' + fmt(p.hi, unit)]], e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', () => { hideTip(); cross.setAttribute('visibility', 'hidden'); });
    svg.appendChild(hit);
  });
}

/* a group's total as a bar (time of day, weekday...) */
export function groupBars(groups, unit, short = (l) => l) {
  const label = groups.map((g) => g.label + ': ' + fmt(g.total, unit) + ' over ' + g.n + ' trades').join('; ') + '.';
  return chartBox(label, (svg, W, H) => {
    if (!groups.length) { text(svg, W / 2, H / 2, 'Nothing recorded yet', 'chart__empty', 'middle'); return; }
    const P = plot(W, H);
    const vals = groups.map((g) => g.total);
    const Y = yAxis(svg, P, Math.min(0, ...vals), Math.max(0, ...vals), unit);
    const step = P.w / groups.length, bw = Math.min(64, step * 0.56);
    groups.forEach((g, i) => {
      const x = P.l + i * step + (step - bw) / 2, y0 = Y(0), y1 = Y(g.total);
      svg.appendChild(s('rect', { x, y: Math.min(y0, y1), width: bw, height: Math.max(1, Math.abs(y1 - y0)), rx: 2 }, g.total >= 0 ? 'bar bar--up' : 'bar bar--down'));
      text(svg, P.l + i * step + step / 2, H - 6, short(g.label), 'chart__axis', 'middle');
      const hit = s('rect', { x: P.l + i * step, y: P.t, width: step, height: P.h }, 'chart__hit');
      hover(hit, [g.label, ['Total', fmt(g.total, unit), g.total >= 0 ? 'pnl pnl--up' : 'pnl pnl--down'],
        ['Average', g.tooFew || g.avg === null ? 'too few to say' : fmt(g.avg, unit)], ['Win rate', g.tooFew || g.win === null ? 'too few to say' : Math.round(g.win * 100) + '%'], ['Trades', String(g.n)]]);
      svg.appendChild(hit);
    });
  });
}

/* ------------------------------------------------------------ tables */

/* a table of groups, each with a bar for its total; colour only with a sign */
export function groupTable(groups, unit, { tone }) {
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
    hover(row, [g.label, ['Trades', String(g.n)], ['Total', fmt(g.total, unit), g.total >= 0 ? 'pnl pnl--up' : 'pnl pnl--down'],
      ['Average', g.tooFew || g.avg === null ? 'too few to say' : fmt(g.avg, unit)], ['Win rate', g.tooFew || g.win === null ? 'too few to say' : Math.round(g.win * 100) + '%']]);
    wrap.appendChild(row);
  }
  return wrap;
}

/* One month of trading days. In greys (the Calendar page): darker for larger
   days, the sign carrying the direction. In colour (the Stats page): bid
   green and ask red in four flat steps by size, still with the sign. */
export function month(year, mon, totals, counts, unit, { colour = false } = {}) {
  const box = el('div', 'heat');
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d) => box.appendChild(el('span', 'heat__dow', d)));
  const first = new Date(Date.UTC(year, mon, 1));
  const daysIn = new Date(Date.UTC(year, mon + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  for (let i = 0; i < lead; i++) box.appendChild(el('span', 'heat__cell heat__cell--blank'));
  const key = (d) => year + '-' + String(mon + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const vals = [];
  for (let d = 1; d <= daysIn; d++) if (totals.has(key(d))) vals.push(Math.abs(totals.get(key(d))));
  const max = Math.max(1e-9, ...vals);
  for (let d = 1; d <= daysIn; d++) {
    const k = key(d);
    const cell = el('span', 'heat__cell');
    cell.appendChild(el('span', 'heat__d', String(d)));
    if (counts.has(k)) {
      const v = totals.get(k) || 0, size = Math.abs(v) / max;
      if (colour) {
        const step = Math.min(4, 1 + Math.floor(size * 4));
        cell.classList.add(v >= 0 ? 'heat--up-' + step : 'heat--down-' + step);
      } else {
        cell.style.backgroundColor = 'rgb(255 255 255 / ' + (0.04 + 0.22 * size).toFixed(3) + ')';
      }
      cell.classList.add('is-traded');
      cell.appendChild(el('span', 'heat__v', fmt(v, unit)));
      cell.appendChild(el('span', 'heat__n', counts.get(k) + (counts.get(k) === 1 ? ' trade' : ' trades')));
      cell.setAttribute('aria-label', k + ': ' + fmt(v, unit) + ', ' + counts.get(k) + ' trades');
      hover(cell, [keyLabel(k), ['Result', fmt(v, unit), v >= 0 ? 'pnl pnl--up' : 'pnl pnl--down'], ['Trades', String(counts.get(k))]]);
    } else cell.setAttribute('aria-label', k + ': no trades');
    box.appendChild(cell);
  }
  return box;
}

export { money };
