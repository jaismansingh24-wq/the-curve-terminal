/* Replay's candlestick chart, drawn on a canvas in the Terminal's own way:
   greys and hairlines, mono labels, candles light for up and dim for down
   (price bars are not coloured by direction), and the bid and ask colours
   only for the buy and sell sides of orders, the position and fills.

   The chart shows bars up to the replay's present and never past it.
   Wheel zooms, dragging pans, a double click returns to the present. Order
   lines can be dragged to a new price, or cancelled with their ×. A right
   click hands the price under the pointer to the page, which offers orders
   there. Times are New York time. */

import { toET, tradingDayNo } from './replay-data.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MINUS = '−';
const hm = (et) => { const m = ((et % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const dateOf = (et) => { const d = new Date(Math.floor(et / 1440) * 864e5); return { wd: DAY[d.getUTCDay()], d: d.getUTCDate(), m: MON[d.getUTCMonth()], y: d.getUTCFullYear() }; };

export class CandleChart {
  constructor(canvas, { onContext, onOrderMove, onOrderCancel, onHover } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.barPx = 9;
    this.offset = 0;         /* bars scrolled back from the present */
    this.bars = null;        /* { n, t, o, h, l, c, v } up to the present */
    this.tick = 0.25;
    this.decimals = 2;
    this.tfDay = false;
    this.orders = [];        /* { id, side, type, price (ticks), qty, label } */
    this.position = null;    /* { qty, avg (ticks), label } */
    this.markers = [];       /* { t (UTC min), price (ticks), side } */
    this.mouse = null;
    this.drag = null;
    this.cb = { onContext, onOrderMove, onOrderCancel, onHover };
    this.readColours();
    this.bind();
    new ResizeObserver(() => this.size()).observe(canvas.parentElement);
    this.size();
  }

  readColours() {
    this.col = {
      text: css('--text') || '#edeff2', dim: css('--text-dim') || '#98a0aa', faint: css('--text-faint') || '#6b727c',
      grid: 'rgba(255,255,255,0.05)', axis: 'rgba(255,255,255,0.10)', vol: 'rgba(255,255,255,0.13)',
      bid: css('--bid'), ask: css('--ask'), bg: css('--ink-raised') || '#0e1116',
    };
  }

  size() {
    const box = this.cv.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.W = Math.max(200, Math.floor(box.width));
    this.H = Math.max(200, Math.floor(box.height));
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.cv.style.width = this.W + 'px';
    this.cv.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  setBars(bars, { tick, decimals, day = false, keepView = true } = {}) {
    this.bars = bars;
    if (tick) this.tick = tick;
    if (decimals !== undefined) this.decimals = decimals;
    this.tfDay = day;
    if (!keepView) this.offset = 0;
    this.draw();
  }
  setOverlay({ orders, position, markers }) {
    if (orders) this.orders = orders;
    this.position = position === undefined ? this.position : position;
    if (markers) this.markers = markers;
    this.draw();
  }
  toPresent() { this.offset = 0; this.draw(); }

  /* ------------------------------------------------------------ geometry */

  frame() {
    const axisW = 78, timeH = 24, top = 8;
    const plotW = this.W - axisW, plotH = this.H - timeH - top;
    const volH = Math.round(plotH * 0.16);
    return { axisW, timeH, top, plotW, plotH, priceH: plotH - volH - 6, volTop: top + plotH - volH, volH };
  }
  visible(F) {
    const b = this.bars;
    if (!b || !b.n) return null;
    const pad = 6;
    const count = Math.max(5, Math.floor(F.plotW / this.barPx));
    const last = Math.min(b.n - 1, b.n - 1 - Math.round(this.offset));
    const first = Math.max(0, last - count + pad + 1);
    return { first, last, count, pad };
  }
  xOf(i, F, V) { return F.plotW - (V.last - i + V.pad) * this.barPx - this.barPx / 2; }
  iAt(x, F, V) { return Math.round(V.last + V.pad - (F.plotW - x - this.barPx / 2) / this.barPx); }
  fmt(ticks) { const p = ticks * this.tick; return (p < 0 ? MINUS : '') + Math.abs(p).toLocaleString('en-GB', { minimumFractionDigits: this.decimals, maximumFractionDigits: this.decimals }); }

  /* ------------------------------------------------------------ drawing */

  draw() {
    const ctx = this.ctx, F = this.frame(), C = this.col;
    ctx.clearRect(0, 0, this.W, this.H);
    const V = this.visible(F);
    if (!V) { this.empty(F); return; }
    const b = this.bars;
    let lo = Infinity, hi = -Infinity, vmax = 1;
    for (let i = V.first; i <= V.last; i++) { if (b.l[i] < lo) lo = b.l[i]; if (b.h[i] > hi) hi = b.h[i]; if (b.v[i] > vmax) vmax = b.v[i]; }
    if (hi === lo) { hi += 4; lo -= 4; }
    const span = hi - lo, padP = span * 0.08;
    lo -= padP; hi += padP;
    this.scale = { lo, hi, F, V };
    const Y = (p) => F.top + (1 - (p - lo) / (hi - lo)) * F.priceH;
    this.Y = Y;
    this.P = (y) => lo + (1 - (y - F.top) / F.priceH) * (hi - lo);

    /* grid and price labels */
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    const steps = this.niceStep((hi - lo) * this.tick, F.priceH / 46);
    const stepT = steps / this.tick;
    ctx.lineWidth = 1;
    for (let p = Math.ceil(lo / stepT) * stepT; p <= hi; p += stepT) {
      const y = Math.round(Y(p)) + 0.5;
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(F.plotW, y); ctx.stroke();
      ctx.fillStyle = C.faint; ctx.fillText(this.fmt(Math.round(p)), F.plotW + 8, y);
    }

    /* session lines and time labels */
    this.timeAxis(F, V, Y);

    /* volume */
    const bw = Math.max(1, Math.floor(this.barPx * 0.7));
    ctx.fillStyle = C.vol;
    for (let i = V.first; i <= V.last; i++) {
      const x = this.xOf(i, F, V), hgt = Math.max(1, (b.v[i] / vmax) * F.volH);
      ctx.fillRect(Math.round(x - bw / 2), F.volTop + F.volH - hgt, bw, hgt);
    }

    /* candles: light for up, dim for down */
    for (let i = V.first; i <= V.last; i++) {
      const x = Math.round(this.xOf(i, F, V)) + 0.5;
      const up = b.c[i] >= b.o[i];
      const colr = up ? C.text : C.dim;
      ctx.strokeStyle = colr; ctx.fillStyle = colr;
      ctx.beginPath(); ctx.moveTo(x, Y(b.h[i])); ctx.lineTo(x, Y(b.l[i])); ctx.stroke();
      const y1 = Y(Math.max(b.o[i], b.c[i])), y2 = Y(Math.min(b.o[i], b.c[i]));
      const hgt = Math.max(1, y2 - y1);
      if (bw >= 3) ctx.fillRect(Math.round(x - bw / 2), y1, bw, hgt);
    }

    /* the last price */
    const lastC = b.c[b.n - 1];
    this.priceTag(F, Y(lastC), this.fmt(lastC), C.text, '#0a0c10');

    /* fills */
    for (const m of this.markers) {
      const i = this.indexOfTime(m.t);
      if (i < V.first || i > V.last) continue;
      const x = this.xOf(i, F, V), y = Y(m.price), s = m.side === 'buy' ? 1 : -1;
      ctx.fillStyle = m.side === 'buy' ? C.bid : C.ask;
      ctx.beginPath(); ctx.moveTo(x, y + s * 2); ctx.lineTo(x - 5, y + s * 10); ctx.lineTo(x + 5, y + s * 10); ctx.closePath(); ctx.fill();
    }

    /* the position and working orders */
    this.hits = [];
    if (this.position && this.position.qty) {
      const side = this.position.qty > 0 ? 'buy' : 'sell';
      this.line(F, this.position.avg, side === 'buy' ? C.bid : C.ask, this.position.label, true, null);
    }
    for (const o of this.orders) {
      const price = this.drag && this.drag.id === o.id ? this.drag.price : o.price;
      this.line(F, price, o.side === 'buy' ? C.bid : C.ask, o.label + ' · ' + this.fmt(price), false, o);
    }

    /* crosshair */
    if (this.mouse && this.mouse.x < F.plotW && this.mouse.y > F.top && this.mouse.y < F.top + F.plotH) this.crosshair(F, V);
  }

  empty(F) {
    const ctx = this.ctx;
    ctx.fillStyle = this.col.faint;
    ctx.font = '13px "Source Serif 4", serif';
    ctx.textAlign = 'center';
    ctx.fillText('No bars to show yet.', F.plotW / 2, this.H / 2);
    ctx.textAlign = 'start';
  }

  niceStep(range, n) {
    const raw = range / Math.max(2, n), mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag;
    const step = (e >= 5 ? 10 : e >= 2.5 ? 5 : e >= 1.2 ? 2.5 : e >= 1 ? 1 : 1) * mag;
    return Math.max(this.tick, Math.round(step / this.tick) * this.tick);
  }

  indexOfTime(t) {
    const b = this.bars;
    let lo = 0, hi = b.n - 1;
    if (t < b.t[0]) return -1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (b.t[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }

  timeAxis(F, V, Y) {
    const ctx = this.ctx, b = this.bars, C = this.col;
    ctx.textBaseline = 'alphabetic';
    const minGap = 86;
    let lastX = -1e9, lastDay = null;
    for (let i = V.first; i <= V.last; i++) {
      const day = tradingDayNo(b.t[i]);
      const x = this.xOf(i, F, V);
      if (lastDay !== null && day !== lastDay && !this.tfDay) {
        ctx.strokeStyle = C.axis; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(Math.round(x - this.barPx / 2) + 0.5, F.top); ctx.lineTo(Math.round(x - this.barPx / 2) + 0.5, F.top + F.plotH); ctx.stroke();
        ctx.setLineDash([]);
      }
      const newDay = lastDay !== null && day !== lastDay;
      lastDay = day;
      if (x - lastX < minGap) continue;
      const et = toET(b.t[i]);
      const dd = dateOf(et);
      const label = this.tfDay ? dd.d + ' ' + dd.m + (dd.m === 'Jan' ? ' ' + dd.y : '') : (newDay || lastX < -1e8 ? dd.wd + ' ' + dd.d + ' ' + dd.m + ' ' + hm(et) : hm(et));
      ctx.fillStyle = C.faint;
      ctx.fillText(label, Math.max(2, Math.min(F.plotW - ctx.measureText(label).width - 2, x - ctx.measureText(label).width / 2)), this.H - 7);
      lastX = x;
    }
    ctx.strokeStyle = C.axis;
    ctx.beginPath(); ctx.moveTo(0, this.H - F.timeH + 0.5); ctx.lineTo(F.plotW, this.H - F.timeH + 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(F.plotW + 0.5, 0); ctx.lineTo(F.plotW + 0.5, this.H); ctx.stroke();
  }

  priceTag(F, y, text, bg, fg) {
    const ctx = this.ctx;
    if (y < F.top - 2 || y > F.top + F.priceH + 2) return;
    ctx.fillStyle = bg;
    ctx.fillRect(F.plotW + 1, y - 9, F.axisW - 2, 18);
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(text, F.plotW + 7, y);
  }

  /* an order or position line, pinned to the edge (with an arrow) when its
     price is outside the visible range */
  line(F, price, colour, label, dashed, order) {
    const ctx = this.ctx;
    let y = this.Y(price), pin = '';
    if (y < F.top + 8) { y = F.top + 8; pin = '↑ '; }
    if (y > F.top + F.priceH - 8) { y = F.top + F.priceH - 8; pin = '↓ '; }
    const yy = Math.round(y) + 0.5;
    ctx.strokeStyle = colour; ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [6, 4] : pin ? [2, 3] : []);
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(F.plotW, yy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    const text = pin + label;
    const w = ctx.measureText(text).width + 14 + (order ? 18 : 0);
    const x0 = F.plotW - w - 6;
    ctx.fillStyle = this.col.bg; ctx.fillRect(x0, yy - 10, w, 20);
    ctx.strokeStyle = colour; ctx.strokeRect(x0 + 0.5, yy - 9.5, w - 1, 19);
    ctx.fillStyle = this.col.text; ctx.fillText(text, x0 + 7, yy + 0.5);
    if (order) {
      const cx = x0 + w - 12;
      ctx.fillStyle = this.col.dim; ctx.fillText('×', cx - 3, yy + 0.5);
      this.hits.push({ kind: 'cancel', id: order.id, x0: cx - 8, x1: cx + 8, y0: yy - 10, y1: yy + 10 });
      this.hits.push({ kind: 'order', id: order.id, x0: 0, x1: x0 + w - 18, y0: yy - 5, y1: yy + 5, pinned: !!pin });
    }
    this.priceTag(F, yy, this.fmt(price), colour, '#0a0c10');
  }

  crosshair(F, V) {
    const ctx = this.ctx, C = this.col, { x, y } = this.mouse, b = this.bars;
    const i = Math.max(V.first, Math.min(V.last, this.iAt(x, F, V)));
    const cx = Math.round(this.xOf(i, F, V)) + 0.5;
    ctx.strokeStyle = 'rgba(237,239,242,0.35)'; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, F.top); ctx.lineTo(cx, F.top + F.plotH); ctx.stroke();
    if (y < F.top + F.priceH) { ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(F.plotW, Math.round(y) + 0.5); ctx.stroke(); }
    ctx.setLineDash([]);
    if (y < F.top + F.priceH) this.priceTag(F, y, this.fmt(Math.round(this.P(y))), C.dim, '#0a0c10');
    const et = toET(b.t[i]), dd = dateOf(et);
    const tl = dd.wd + ' ' + dd.d + ' ' + dd.m + ' ' + dd.y + (this.tfDay ? '' : ', ' + hm(et) + ' ET');
    ctx.font = '11px "JetBrains Mono", monospace';
    const w = ctx.measureText(tl).width + 12;
    const lx = Math.max(0, Math.min(F.plotW - w, cx - w / 2));
    ctx.fillStyle = C.dim; ctx.fillRect(lx, this.H - F.timeH + 2, w, F.timeH - 4);
    ctx.fillStyle = '#0a0c10'; ctx.textBaseline = 'middle'; ctx.fillText(tl, lx + 6, this.H - F.timeH / 2);
    if (this.cb.onHover) this.cb.onHover(i);
  }

  /* ------------------------------------------------------------ the pointer */

  bind() {
    const cv = this.cv;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const hit = (p) => (this.hits || []).find((h) => p.x >= h.x0 && p.x <= h.x1 && p.y >= h.y0 && p.y <= h.y1);
    cv.addEventListener('wheel', (e) => {
      if (!this.bars) return;
      e.preventDefault();
      const F = this.frame(), V = this.visible(F), p = pos(e);
      const anchor = this.iAt(Math.min(p.x, F.plotW), F, V);
      const from = this.barPx;
      this.barPx = Math.max(2, Math.min(40, this.barPx * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      if (from !== this.barPx) {
        const V2 = this.visible(F);
        const now = this.iAt(Math.min(p.x, F.plotW), F, V2);
        this.offset = Math.max(0, Math.min(this.bars.n - 5, this.offset + (now - anchor)));
      }
      this.draw();
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.bars) return;
      const p = pos(e), h = hit(p);
      cv.setPointerCapture(e.pointerId);
      if (h && h.kind === 'cancel') { this.cb.onOrderCancel && this.cb.onOrderCancel(h.id); return; }
      if (h && h.kind === 'order' && !h.pinned) {
        const o = this.orders.find((x) => x.id === h.id);
        this.drag = { id: h.id, price: o.price, from: o.price };
        cv.classList.add('is-dragging-order');
        return;
      }
      this.drag = { pan: true, x: p.x, offset: this.offset };
      cv.classList.add('is-panning');
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      this.mouse = p;
      if (this.drag && this.drag.pan) {
        this.offset = Math.max(0, Math.min((this.bars ? this.bars.n : 0) - 5, this.drag.offset + (p.x - this.drag.x) / this.barPx));
      } else if (this.drag && this.drag.id) {
        this.drag.price = Math.round(this.P(p.y));
      } else {
        const h = hit(p);
        cv.classList.toggle('is-over-order', !!(h && h.kind === 'order' && !h.pinned));
        cv.classList.toggle('is-over-cancel', !!(h && h.kind === 'cancel'));
      }
      this.draw();
    });
    const end = () => {
      if (this.drag && this.drag.id && this.drag.price !== this.drag.from) this.cb.onOrderMove && this.cb.onOrderMove(this.drag.id, this.drag.price);
      this.drag = null;
      cv.classList.remove('is-panning', 'is-dragging-order');
      this.draw();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (!this.drag) { this.mouse = null; this.draw(); } });
    cv.addEventListener('dblclick', () => this.toPresent());
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.bars || !this.P) return;
      const p = pos(e), F = this.frame();
      if (p.x > F.plotW || p.y > F.top + F.priceH) return;
      this.cb.onContext && this.cb.onContext(Math.round(this.P(p.y)), e.clientX, e.clientY);
    });
  }
}
