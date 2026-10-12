/* A Replay chart, drawn on a canvas in the Terminal's way: greys and
   hairlines and mono labels by default, the bid and ask colours only for
   buying and selling (orders, fills, footprint, delta). The reader can
   change the candle, background and profile colours for each chart.

   Types: candles; footprint (buys and sells at each price inside each bar,
   from a file of trades); TPO (a session's prices by half hour, as
   letters). Panes: volume, and delta (each bar's buys less sells, with a
   running total that starts again each session). Profiles: volume and
   delta at price, over the visible bars or for each session; the point of
   control in the main text colour, the value area mid grey, the rest faint.

   Moving: drag the chart in any direction; drag the price axis to stretch
   prices, the time axis to stretch time; the wheel zooms time (with Ctrl,
   prices); a double click on the chart returns to the present, on the
   price axis fits the prices again. Lines: the page chooses a tool; a
   click places a horizontal line, two clicks a trend line; a line can be
   selected, dragged, and removed. Order lines can be dragged or cancelled.

   The chart shows the replay up to its present and never past it. Times
   are New York time. */

import { toET, tradingDayNo, LETTERS } from './replay-data.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MINUS = '−';
const hm = (et) => { const m = ((et % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const dateOf = (et) => { const d = new Date(Math.floor(et / 1440) * 864e5); return { wd: DAY[d.getUTCDay()], d: d.getUTCDate(), m: MON[d.getUTCMonth()], y: d.getUTCFullYear() }; };
const NICE = [1, 2, 4, 5, 8, 10, 20, 25, 40, 50, 100, 200, 400, 1000];
const nice = (x) => NICE.find((k) => k >= x) || NICE[NICE.length - 1];
const short = (v) => { const a = Math.abs(v); return (v < 0 ? MINUS : '') + (a >= 10000 ? (a / 1000).toFixed(0) + 'k' : a >= 1000 ? (a / 1000).toFixed(1) + 'k' : String(Math.round(a))); };
function rgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

export const DEFAULT_SPEC = {
  tf: 1, type: 'candles', volume: true, delta: false, vp: false, dp: false, profileMode: 'visible', vaPct: 70, profileRow: 0,
  tpoRth: true, tpoRow: 20, tpoPeriod: 30,
  look: { up: '', down: '', bg: '', grid: true, vol: '', prof: '', va: '', poc: '', buy: '', sell: '' },
};

export class ReplayChart {
  constructor(host, cb = {}) {
    this.host = host;
    this.cv = document.createElement('canvas');
    this.cv.className = 'rp-canvas';
    this.cv.setAttribute('role', 'img');
    host.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.cb = cb;
    this.barPx = 9;
    this.offset = 0;
    this.tpoOffset = 0;
    this.yAuto = true;
    this.yLo = 0; this.yHi = 1;
    this.frame = null;
    this.spec = JSON.parse(JSON.stringify(DEFAULT_SPEC));
    this.orders = []; this.position = null; this.markers = [];
    this.mouse = null; this.drag = null; this.pending = null; this.selected = null;
    this.bind();
    new ResizeObserver(() => this.size()).observe(host);
    this.size();
  }

  /* ------------------------------------------------------------ input */

  setFrame(frame) { this.frame = frame; this.draw(); }
  setSpec(spec) { this.spec = spec; this.draw(); }
  setOverlay({ orders, position, markers }) {
    if (orders) this.orders = orders;
    if (position !== undefined) this.position = position;
    if (markers) this.markers = markers;
  }
  toPresent() { this.offset = 0; this.tpoOffset = 0; this.yAuto = true; this.draw(); }
  fitPrices() { this.yAuto = true; this.draw(); }

  size() {
    const box = this.host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.W = Math.max(160, Math.floor(box.width));
    this.H = Math.max(160, Math.floor(box.height));
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.cv.style.width = this.W + 'px';
    this.cv.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  colours() {
    const L = this.spec.look || {};
    const text = css('--text') || '#edeff2', dim = css('--text-dim') || '#98a0aa', faint = css('--text-faint') || '#6b727c';
    return {
      text, dim, faint,
      up: L.up || text, down: L.down || dim, bg: L.bg || css('--ink-raised') || '#0e1116',
      grid: L.grid === false ? null : 'rgba(255,255,255,0.05)', axis: 'rgba(255,255,255,0.10)',
      vol: L.vol ? rgba(L.vol, 0.55) : 'rgba(255,255,255,0.13)',
      prof: L.prof || faint, va: L.va || dim, poc: L.poc || text,
      buy: L.buy || css('--bid'), sell: L.sell || css('--ask'),
    };
  }

  /* ------------------------------------------------------------ geometry */

  layout() {
    const axisW = 80, timeH = 24, top = 6;
    const plotW = this.W - axisW, all = this.H - timeH - top;
    const s = this.spec, f = this.frame;
    const showVol = s.volume && s.type !== 'tpo';
    const showDelta = s.delta && s.type !== 'tpo' && f && f.canDelta;
    const volH = showVol ? Math.round(all * 0.13) : 0;
    const dH = showDelta ? Math.round(all * 0.17) : 0;
    const gaps = (showVol ? 6 : 0) + (showDelta ? 6 : 0);
    const priceH = all - volH - dH - gaps;
    /* profiles of the visible bars get their own strip at the right, so they never cover the latest bars */
    const profW = (s.vp || s.dp) && s.profileMode !== 'session' && s.type !== 'tpo' ? Math.round(Math.min(240, Math.max(110, plotW * 0.24))) : 0;
    return { axisW, timeH, top, plotW, barsW: plotW - profW, profW, priceH, priceB: top + priceH, volTop: top + priceH + (showVol ? 6 : 0), volH, dTop: top + priceH + (showVol ? 6 + volH : 0) + (showDelta ? 6 : 0), dH, showVol, showDelta };
  }
  visible(F) {
    const b = this.frame && this.frame.bars;
    if (!b || !b.n) return null;
    const count = Math.max(2, Math.floor(F.barsW / this.barPx));
    /* a little room after the latest bar: up to six bars, less when zoomed in */
    const pad = Math.max(1, Math.min(6, Math.floor(count * 0.12)));
    const last = Math.max(0, Math.min(b.n - 1, b.n - 1 - Math.round(this.offset)));
    const first = Math.max(0, Math.min(last, last - count + pad));
    return { first, last, pad };
  }
  xOf(i, F, V) { return F.barsW - (V.last - i + V.pad) * this.barPx - this.barPx / 2; }
  iAt(x, F, V) { return V.last + V.pad - (F.barsW - x - this.barPx / 2) / this.barPx; }
  /* a time (UTC seconds) as a fractional bar index, and back */
  idxOfTime(sec) {
    const b = this.frame.bars, m = sec / 60;
    let lo = 0, hi = b.n - 1;
    if (m < b.t[0]) return (m - b.t[0]) / this.tfMinutes();
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (b.t[mid] <= m) lo = mid; else hi = mid - 1; }
    const span = lo + 1 < b.n ? b.t[lo + 1] - b.t[lo] : this.tfMinutes();
    return lo + Math.min(1, (m - b.t[lo]) / (span || 1));
  }
  timeOfIdx(x) {
    const b = this.frame.bars;
    const i = Math.max(0, Math.min(b.n - 1, Math.floor(x)));
    const span = i + 1 < b.n ? b.t[i + 1] - b.t[i] : this.tfMinutes();
    return (b.t[i] + (x - i) * span) * 60;
  }
  tfMinutes() { return this.spec.tf === 'D' ? 1440 : this.spec.tf || 1; }
  fmt(ticks) {
    const f = this.frame, p = ticks * f.tick;
    return (p < 0 ? MINUS : '') + Math.abs(p).toLocaleString('en-GB', { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals });
  }

  /* ------------------------------------------------------------ drawing */

  draw() {
    const ctx = this.ctx, C = this.colours(), F = this.layout();
    this.C = C; this.F = F;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.W, this.H);
    this.hits = [];
    const f = this.frame;
    if (!f || !f.bars || !f.bars.n) { this.note('No bars to show yet.'); return; }
    if (this.spec.type === 'tpo') { this.drawTPO(F, C); return; }
    const V = this.visible(F);
    this.V = V;
    const b = f.bars;
    /* the price range: fitted to the visible bars, or as the reader left it */
    let lo = Infinity, hi = -Infinity;
    for (let i = V.first; i <= V.last; i++) { if (b.l[i] < lo) lo = b.l[i]; if (b.h[i] > hi) hi = b.h[i]; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = hi = b.c[b.n - 1]; }
    if (hi === lo) { hi += 4; lo -= 4; }
    if (this.yAuto) { const pad = (hi - lo) * 0.08; this.yLo = lo - pad; this.yHi = hi + pad; }
    const Y = (p) => F.top + (1 - (p - this.yLo) / (this.yHi - this.yLo)) * F.priceH;
    this.Y = Y;
    this.P = (y) => this.yLo + (1 - (y - F.top) / F.priceH) * (this.yHi - this.yLo);

    this.rowNote = '';
    ctx.save();
    ctx.beginPath(); ctx.rect(0, F.top, F.plotW, F.priceH); ctx.clip();
    this.priceGrid(F, C, Y);
    this.sessionLines(F, V, C);
    const wantFoot = this.spec.type === 'footprint';
    const footOK = wantFoot && f.footprint;
    if (this.spec.vp || this.spec.dp) this.profiles(F, V, C, Y);
    if (footOK && this.barPx >= 10) this.footprint(F, V, C, Y);
    else this.candles(F, V, C, Y);
    this.drawingsLayer(F, Y);
    this.fills(F, V, C, Y);
    ctx.restore();

    this.priceLabels(F, C, Y);
    this.timeAxis(F, V, C);
    if (this.rowNote) { ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = C.faint; ctx.textBaseline = 'alphabetic'; ctx.fillText(this.rowNote, F.plotW + 8, this.H - 8); }
    if (F.showVol) this.volumePane(F, V, C);
    if (F.showDelta) this.deltaPane(F, V, C);

    /* the last price, the position and working orders */
    this.tag(F, Y(b.c[b.n - 1]), this.fmt(b.c[b.n - 1]), C.text, '#0a0c10');
    if (this.position && this.position.qty) this.line(F, Y, this.position.avg, this.position.qty > 0 ? C.buy : C.sell, this.position.label, true, null);
    for (const o of this.orders) {
      const price = this.drag && this.drag.kind === 'order' && this.drag.id === o.id ? this.drag.price : o.price;
      this.line(F, Y, price, o.side === 'buy' ? C.buy : C.sell, o.label + ' · ' + this.fmt(price), false, o);
    }
    if (wantFoot && !f.footprint) this.badge(F, 'Footprint needs a file of trades. This file has bars, so candles are shown.');
    else if (wantFoot && this.barPx < 10) this.badge(F, 'Zoom in to see the footprint.');
    if ((this.spec.dp || this.spec.delta) && !f.canDelta) this.badge(F, 'Delta needs a file of trades: this file has bars.', 1);
    if (this.mouse && this.mouse.x < F.plotW && this.mouse.y > F.top && this.mouse.y < this.H - F.timeH) this.crosshair(F, V, C, Y);
  }

  note(text) {
    const ctx = this.ctx;
    ctx.fillStyle = this.C.faint;
    ctx.font = '13px "Source Serif 4", serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, (this.W - 80) / 2, this.H / 2);
    ctx.textAlign = 'start';
  }
  badge(F, text, row = 0) {
    const ctx = this.ctx;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = 'rgba(10,12,16,0.92)';
    ctx.fillRect(8, F.top + 6 + row * 24, w, 20);
    ctx.fillStyle = this.C.dim;
    ctx.fillText(text, 15, F.top + 16 + row * 24);
  }

  priceStep(F) {
    const range = (this.yHi - this.yLo) * this.frame.tick;
    const raw = range / Math.max(2, F.priceH / 46), mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag;
    const step = (e >= 5 ? 10 : e >= 2.5 ? 5 : e >= 1.2 ? 2.5 : 1) * mag;
    return Math.max(1, Math.round(step / this.frame.tick));
  }
  priceGrid(F, C, Y) {
    if (!C.grid) return;
    const ctx = this.ctx, st = this.priceStep(F);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let p = Math.ceil(this.yLo / st) * st; p <= this.yHi; p += st) {
      const y = Math.round(Y(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(F.plotW, y); ctx.stroke();
    }
  }
  priceLabels(F, C, Y) {
    const ctx = this.ctx, st = this.priceStep(F);
    ctx.fillStyle = C.bg; ctx.fillRect(F.plotW, 0, F.axisW, this.H);
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.faint;
    for (let p = Math.ceil(this.yLo / st) * st; p <= this.yHi; p += st) {
      const y = Y(p);
      if (y > F.top + 6 && y < F.priceB - 4) ctx.fillText(this.fmt(Math.round(p)), F.plotW + 8, y);
    }
    ctx.strokeStyle = C.axis;
    ctx.beginPath(); ctx.moveTo(F.plotW + 0.5, 0); ctx.lineTo(F.plotW + 0.5, this.H); ctx.stroke();
  }
  sessionLines(F, V, C) {
    if (this.spec.tf === 'D') return;
    const ctx = this.ctx, b = this.frame.bars;
    ctx.strokeStyle = C.axis; ctx.setLineDash([2, 4]);
    let last = null;
    for (let i = V.first; i <= V.last; i++) {
      const d = tradingDayNo(b.t[i]);
      if (last !== null && d !== last) { const x = Math.round(this.xOf(i, F, V) - this.barPx / 2) + 0.5; ctx.beginPath(); ctx.moveTo(x, F.top); ctx.lineTo(x, F.priceB); ctx.stroke(); }
      last = d;
    }
    ctx.setLineDash([]);
  }
  candles(F, V, C, Y) {
    const ctx = this.ctx, b = this.frame.bars;
    const bw = Math.max(1, Math.floor(this.barPx * 0.7));
    for (let i = V.first; i <= V.last; i++) {
      const x = Math.round(this.xOf(i, F, V)) + 0.5;
      const colr = b.c[i] >= b.o[i] ? C.up : C.down;
      ctx.strokeStyle = colr; ctx.fillStyle = colr;
      ctx.beginPath(); ctx.moveTo(x, Y(b.h[i])); ctx.lineTo(x, Y(b.l[i])); ctx.stroke();
      if (bw >= 3) { const y1 = Y(Math.max(b.o[i], b.c[i])), y2 = Y(Math.min(b.o[i], b.c[i])); ctx.fillRect(Math.round(x - bw / 2), y1, bw, Math.max(1, y2 - y1)); }
    }
  }

  /* each bar's sells (left) and buys (right) at every row, shaded in four
     flat steps of the sell and buy colours, the bar's busiest row boxed */
  footprint(F, V, C, Y) {
    const ctx = this.ctx, f = this.frame, b = f.bars;
    const pxTick = F.priceH / (this.yHi - this.yLo);
    const showText = this.barPx >= 64;
    const rowTicks = nice(Math.max(1, Math.ceil((showText ? 13 : 3) / pxTick)));
    this.rowNote = 'ROW ' + rowTicks + (rowTicks === 1 ? ' TICK' : ' TICKS');
    const cells = [];
    let max = 1;
    for (let i = V.first; i <= V.last; i++) {
      const L = f.footprint(i, rowTicks);
      if (!L) continue;
      cells.push([i, L]);
      for (let r = 0; r < L.rows; r++) { if (L.buy[r] > max) max = L.buy[r]; if (L.sell[r] > max) max = L.sell[r]; }
    }
    const step = (v) => (v <= 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 4)));
    const alpha = [0, 0.10, 0.18, 0.28, 0.40];
    const w = Math.max(4, this.barPx - 4);
    ctx.font = (this.barPx >= 90 ? 11 : 10) + 'px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    for (const [i, L] of cells) {
      const xc = this.xOf(i, F, V), x0 = Math.round(xc - w / 2), half = Math.floor(w / 2);
      let poc = 0;
      for (let r = 0; r < L.rows; r++) if (L.vol[r] > L.vol[poc]) poc = r;
      for (let r = 0; r < L.rows; r++) {
        const pLo = (L.lo + r) * rowTicks, yTop = Y(pLo + rowTicks), yBot = Y(pLo), hgt = Math.max(1, yBot - yTop - 1);
        const s = step(L.sell[r]), u = step(L.buy[r]);
        if (s) { ctx.fillStyle = rgba(C.sell, alpha[s]) || C.sell; ctx.fillRect(x0, yTop, half - 1, hgt); }
        if (u) { ctx.fillStyle = rgba(C.buy, alpha[u]) || C.buy; ctx.fillRect(x0 + half, yTop, w - half, hgt); }
        if (showText && hgt >= 10) {
          ctx.fillStyle = L.vol[r] ? C.text : C.faint;
          const sv = short(L.sell[r]), bv = short(L.buy[r]);
          ctx.fillText(sv, x0 + half - 4 - ctx.measureText(sv).width, yTop + hgt / 2);
          ctx.fillText(bv, x0 + half + 4, yTop + hgt / 2);
        }
        if (r === poc) { ctx.strokeStyle = C.text; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, Math.round(yTop) + 0.5, w - 1, Math.max(1, Math.round(hgt) - 1)); }
      }
      /* the open-to-close line at the bar's left edge, and its delta below */
      ctx.fillStyle = b.c[i] >= b.o[i] ? C.up : C.down;
      ctx.fillRect(x0 - 3, Y(Math.max(b.o[i], b.c[i])), 2, Math.max(1, Y(Math.min(b.o[i], b.c[i])) - Y(Math.max(b.o[i], b.c[i]))));
      if (this.barPx >= 36 && b.dl) {
        const dv = b.dl[i];
        ctx.fillStyle = dv > 0 ? C.buy : dv < 0 ? C.sell : C.faint;
        const tx = (dv > 0 ? '+' : '') + short(dv);
        ctx.fillText(tx, xc - ctx.measureText(tx).width / 2, Math.min(F.priceB - 8, Y(b.l[i]) + 12));
      }
    }
  }

  /* volume and delta at price: over the visible bars at the right edge, or
     for each session in place */
  profiles(F, V, C, Y) {
    const f = this.frame;
    const pxTick = F.priceH / (this.yHi - this.yLo);
    const rowTicks = this.spec.profileRow > 0 ? this.spec.profileRow : nice(Math.max(1, Math.ceil(3 / pxTick)));
    if (!this.rowNote) this.rowNote = 'ROW ' + rowTicks + (rowTicks === 1 ? ' TICK' : ' TICKS');
    const ranges = [];
    if (this.spec.profileMode === 'session') {
      const b = f.bars;
      let s = V.first, day = tradingDayNo(b.t[V.first]);
      for (let i = V.first; i <= V.last + 1; i++) {
        const d = i <= V.last ? tradingDayNo(b.t[i]) : null;
        if (d !== day) {
          let s0 = s; while (s0 > 0 && tradingDayNo(b.t[s0 - 1]) === day) s0--;
          ranges.push({ i0: s0, i1: i - 1, x0: this.xOf(s, F, V) - this.barPx / 2, x1: this.xOf(i - 1, F, V) + this.barPx / 2 });
          s = i; day = d;
        }
      }
    } else {
      ranges.push({ i0: V.first, i1: V.last, x0: F.barsW + 8, x1: F.plotW - 4, right: true });
      this.ctx.fillStyle = C.axis;
      this.ctx.fillRect(F.barsW, F.top, 1, F.priceH);
    }
    for (const R of ranges) {
      const L = f.profile(R.i0, R.i1, rowTicks);
      if (!L) continue;
      const va = this.spec.vp ? valueAreaOf(L, this.spec.vaPct || 70) : null;
      const width = R.x1 - R.x0;
      const vpW = R.right ? width * (this.spec.dp && L.split ? 0.58 : 1) : width * 0.4;
      let max = 1, dmax = 1;
      for (let r = 0; r < L.rows; r++) { if (L.vol[r] > max) max = L.vol[r]; if (L.split) dmax = Math.max(dmax, Math.abs(L.buy[r] - L.sell[r])); }
      const ctx = this.ctx;
      for (let r = 0; r < L.rows; r++) {
        const pLo = (L.lo + r) * rowTicks, yTop = Y(pLo + rowTicks), hgt = Math.max(1, Y(pLo) - yTop - (pxTick * rowTicks > 4 ? 1 : 0));
        if (this.spec.vp) {
          const len = (L.vol[r] / max) * vpW;
          ctx.fillStyle = va && r === va.poc ? C.poc : va && r >= va.vaLo && r <= va.vaHi ? C.va : C.prof;
          ctx.globalAlpha = va && r === va.poc ? 0.95 : 0.55;
          if (R.right) ctx.fillRect(R.x1 - len, yTop, len, hgt); else ctx.fillRect(R.x0, yTop, len, hgt);
        }
        if (this.spec.dp && L.split) {
          const dv = L.buy[r] - L.sell[r];
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = dv >= 0 ? C.buy : C.sell;
          if (R.right) {
            const mid = R.x0 + (width - vpW) / 2 - 6, len = (Math.abs(dv) / dmax) * ((width - vpW) / 2 - 8);
            if (r === 0) { ctx.globalAlpha = 1; ctx.fillStyle = C.axis; ctx.fillRect(Math.round(mid), Y((L.lo + L.rows) * rowTicks), 1, Y(L.lo * rowTicks) - Y((L.lo + L.rows) * rowTicks)); ctx.globalAlpha = 0.75; ctx.fillStyle = dv >= 0 ? C.buy : C.sell; }
            ctx.fillRect(dv >= 0 ? mid : mid - len, yTop, len, hgt);
          } else {
            const len = (Math.abs(dv) / dmax) * width * 0.25;
            ctx.fillRect(R.x1 - len, yTop, len, hgt);
          }
        }
      }
      ctx.globalAlpha = 1;
      if (va && R.right) {
        ctx.font = '10px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.dim;
        const yPoc = Y((L.lo + va.poc) * rowTicks + rowTicks / 2), yH = Y((L.lo + va.vaHi + 1) * rowTicks), yL = Y((L.lo + va.vaLo) * rowTicks);
        const lx = R.x0 - 30;
        ctx.fillText('POC', lx, yPoc);
        if (yPoc - yH >= 13) ctx.fillText('VAH', lx, yH);
        if (yL - yPoc >= 13) ctx.fillText('VAL', lx, yL);
      }
    }
  }

  fills(F, V, C, Y) {
    const ctx = this.ctx;
    for (const m of this.markers) {
      const k = this.idxOfTime(m.t);
      if (k < V.first - 1 || k > V.last + 1) continue;
      const x = this.xOf(Math.floor(k), F, V), y = Y(m.price), s = m.side === 'buy' ? 1 : -1;
      ctx.fillStyle = m.side === 'buy' ? C.buy : C.sell;
      ctx.beginPath(); ctx.moveTo(x, y + s * 2); ctx.lineTo(x - 5, y + s * 10); ctx.lineTo(x + 5, y + s * 10); ctx.closePath(); ctx.fill();
    }
  }

  volumePane(F, V, C) {
    const ctx = this.ctx, b = this.frame.bars;
    let vmax = 1;
    for (let i = V.first; i <= V.last; i++) if (b.v[i] > vmax) vmax = b.v[i];
    const bw = Math.max(1, Math.floor(this.barPx * 0.7));
    ctx.fillStyle = C.vol;
    for (let i = V.first; i <= V.last; i++) {
      const x = this.xOf(i, F, V), h = Math.max(1, (b.v[i] / vmax) * F.volH);
      ctx.fillRect(Math.round(x - bw / 2), F.volTop + F.volH - h, bw, h);
    }
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = C.faint; ctx.textBaseline = 'top';
    ctx.fillText('VOL ' + short(vmax), F.plotW + 8, F.volTop);
  }
  /* each bar's delta as a bar, and the running total for the session as a line */
  deltaPane(F, V, C) {
    const ctx = this.ctx, b = this.frame.bars;
    if (!b.dl) return;
    const cum = new Float64Array(V.last - V.first + 1);
    let run = 0, day = null, dmax = 1, cmax = 1;
    for (let i = V.first; i <= V.last; i++) {
      const d = tradingDayNo(b.t[i]);
      if (d !== day) {
        run = 0;
        for (let k = i - 1; k >= 0 && tradingDayNo(b.t[k]) === d; k--) run += b.dl[k];
        day = d;
      }
      run += b.dl[i];
      cum[i - V.first] = run;
      dmax = Math.max(dmax, Math.abs(b.dl[i]));
      cmax = Math.max(cmax, Math.abs(run));
    }
    const mid = F.dTop + F.dH / 2, bw = Math.max(1, Math.floor(this.barPx * 0.7));
    ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(0, Math.round(mid) + 0.5); ctx.lineTo(F.plotW, Math.round(mid) + 0.5); ctx.stroke();
    for (let i = V.first; i <= V.last; i++) {
      const x = this.xOf(i, F, V), h = (b.dl[i] / dmax) * (F.dH / 2 - 2);
      ctx.fillStyle = b.dl[i] >= 0 ? rgba(C.buy, 0.7) || C.buy : rgba(C.sell, 0.7) || C.sell;
      ctx.fillRect(Math.round(x - bw / 2), h >= 0 ? mid - h : mid, bw, Math.max(1, Math.abs(h)));
    }
    ctx.strokeStyle = C.text; ctx.lineWidth = 1.2; ctx.beginPath();
    let lastDay = null;
    for (let i = V.first; i <= V.last; i++) {
      const x = this.xOf(i, F, V), y = mid - (cum[i - V.first] / cmax) * (F.dH / 2 - 2);
      const d = tradingDayNo(b.t[i]);
      if (d !== lastDay) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      lastDay = d;
    }
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = C.faint; ctx.textBaseline = 'top';
    ctx.fillText('DELTA', F.plotW + 8, F.dTop);
    ctx.fillText('Σ ' + short(cum[cum.length - 1]), F.plotW + 8, F.dTop + 14);
  }

  timeAxis(F, V, C) {
    const ctx = this.ctx, b = this.frame.bars;
    ctx.fillStyle = C.bg; ctx.fillRect(0, this.H - F.timeH, F.plotW, F.timeH);
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textBaseline = 'alphabetic';
    let lastEnd = -1e9, lastDay = null, first = true;
    for (let i = V.first; i <= V.last; i++) {
      const day = tradingDayNo(b.t[i]);
      const x = this.xOf(i, F, V);
      const newDay = lastDay !== null && day !== lastDay;
      lastDay = day;
      if (x - lastEnd < 40) continue;
      const et = toET(b.t[i]), dd = dateOf(et);
      const label = this.spec.tf === 'D' ? dd.d + ' ' + dd.m + (dd.m === 'Jan' ? ' ' + dd.y : '') : (newDay || first ? dd.wd + ' ' + dd.d + ' ' + dd.m + ' ' + hm(et) : hm(et));
      const w = ctx.measureText(label).width;
      const lx = Math.max(2, Math.min(F.plotW - w - 2, x - w / 2));
      if (lx < lastEnd + 18) continue;
      ctx.fillStyle = C.faint;
      ctx.fillText(label, lx, this.H - 7);
      lastEnd = lx + w;
      first = false;
    }
    ctx.strokeStyle = C.axis;
    ctx.beginPath(); ctx.moveTo(0, this.H - F.timeH + 0.5); ctx.lineTo(F.plotW, this.H - F.timeH + 0.5); ctx.stroke();
  }

  tag(F, y, text, bg, fg) {
    const ctx = this.ctx;
    if (y < F.top - 2 || y > F.priceB + 2) return;
    ctx.fillStyle = bg; ctx.fillRect(F.plotW + 1, y - 9, F.axisW - 2, 18);
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(text, F.plotW + 7, y);
  }

  /* an order or position line, pinned to the edge with an arrow when its
     price is off the chart */
  line(F, Y, price, colour, label, dashed, order) {
    const ctx = this.ctx;
    let y = Y(price), pin = '';
    if (y < F.top + 10) { y = F.top + 10; pin = '↑ '; }
    if (y > F.priceB - 10) { y = F.priceB - 10; pin = '↓ '; }
    const yy = Math.round(y) + 0.5;
    ctx.strokeStyle = colour; ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [6, 4] : pin ? [2, 3] : []);
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(F.plotW, yy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle';
    const text = pin + label;
    const w = ctx.measureText(text).width + 14 + (order ? 18 : 0);
    const x0 = F.plotW - w - 6;
    ctx.fillStyle = this.C.bg; ctx.fillRect(x0, yy - 10, w, 20);
    ctx.strokeStyle = colour; ctx.strokeRect(x0 + 0.5, yy - 9.5, w - 1, 19);
    ctx.fillStyle = this.C.text; ctx.fillText(text, x0 + 7, yy + 0.5);
    if (order) {
      const cx = x0 + w - 12;
      ctx.fillStyle = this.C.dim; ctx.fillText('×', cx - 3, yy + 0.5);
      this.hits.push({ kind: 'cancel', id: order.id, x0: cx - 8, x1: cx + 8, y0: yy - 10, y1: yy + 10 });
      this.hits.push({ kind: 'order', id: order.id, x0: 0, x1: x0 + w - 18, y0: yy - 5, y1: yy + 5, pinned: !!pin });
    }
    this.tag(F, yy, this.fmt(price), colour, '#0a0c10');
  }

  /* ------------------------------------------------------------ lines the reader draws */

  drawingsLayer(F, Y) {
    const ctx = this.ctx, list = (this.cb.drawings && this.cb.drawings()) || [];
    const show = [...list];
    if (this.pending) show.push(this.pending);
    for (const d of show) {
      const sel = this.selected === d.id;
      const colour = d.colour || this.C.text;
      ctx.strokeStyle = colour; ctx.lineWidth = sel ? 2 : 1.3;
      if (d.kind === 'h') {
        const y = Math.round(Y(d.price)) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(F.plotW, y); ctx.stroke();
        ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = colour; ctx.textBaseline = 'bottom';
        ctx.fillText(this.fmt(d.price), 6, y - 2);
        if (d.id) this.hits.push({ kind: 'drawing', id: d.id, test: (p) => Math.abs(p.y - y) < 5 && p.x < F.plotW });
      } else if (d.kind === 'trend' && this.spec.type !== 'tpo') {
        const a = { x: this.xOf(this.idxOfTime(d.a.t), F, this.V), y: Y(d.a.p) };
        const b = { x: this.xOf(this.idxOfTime(d.b.t), F, this.V), y: Y(d.b.p) };
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (sel) { ctx.fillStyle = colour; [a, b].forEach((q) => { ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Math.PI * 2); ctx.fill(); }); }
        if (d.id) {
          this.hits.push({ kind: 'drawing', id: d.id, end: 'a', test: (p) => Math.hypot(p.x - a.x, p.y - a.y) < 7 });
          this.hits.push({ kind: 'drawing', id: d.id, end: 'b', test: (p) => Math.hypot(p.x - b.x, p.y - b.y) < 7 });
          this.hits.push({ kind: 'drawing', id: d.id, test: (p) => segDist(p, a, b) < 5 });
        }
      }
      ctx.lineWidth = 1;
    }
  }

  /* ------------------------------------------------------------ TPO */

  drawTPO(F, C) {
    const ctx = this.ctx, f = this.frame;
    const T = f.tpo ? f.tpo(this.spec) : { n: 0 };
    if (!T.n) { this.note(this.spec.tpoRth ? 'No regular-hours session yet in this replay.' : 'No session yet.'); return; }
    const L = this.barPx;
    /* columns from the right: the latest session at the present */
    const cols = [];
    let xr = F.plotW - 12 + this.tpoOffset;
    for (let k = T.n - 1; k >= 0 && xr > -400; k--) {
      const s = T.at(k);
      let most = 1;
      for (const m of s.marks) if (m.length > most) most = m.length;
      const w = (most + 2) * L;
      cols.push({ s, x0: xr - w, w });
      xr -= w + Math.max(10, L);
    }
    let lo = Infinity, hi = -Infinity;
    for (const c of cols) { if (c.x0 + c.w < 0 || c.x0 > F.plotW) continue; lo = Math.min(lo, c.s.lo * c.s.rowTicks); hi = Math.max(hi, (c.s.lo + c.s.rows) * c.s.rowTicks); }
    if (!Number.isFinite(lo)) { lo = cols[0].s.lo * cols[0].s.rowTicks; hi = (cols[0].s.lo + cols[0].s.rows) * cols[0].s.rowTicks; }
    if (this.yAuto) { const pad = (hi - lo) * 0.05; this.yLo = lo - pad; this.yHi = hi + pad; }
    const Y = (p) => F.top + (1 - (p - this.yLo) / (this.yHi - this.yLo)) * F.priceH;
    this.Y = Y; this.P = (y) => this.yLo + (1 - (y - F.top) / F.priceH) * (this.yHi - this.yLo);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, F.top, F.plotW, F.priceH + F.volH + F.dH + 12); ctx.clip();
    this.priceGrid(F, C, Y);
    const steps = [C.faint, rgba(C.dim, 0.75) || C.dim, C.dim, C.text];
    for (const { s, x0 } of cols) {
      if (x0 > F.plotW || x0 + 400 < 0) continue;
      const rowPx = (F.priceH / (this.yHi - this.yLo)) * s.rowTicks;
      const letters = rowPx >= 8 && L >= 6;
      ctx.font = Math.max(7, Math.min(13, Math.min(rowPx - 1, L * 1.25))) + 'px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      /* the value area as a bar at the column's left, the point of control as a band */
      ctx.fillStyle = C.va; ctx.globalAlpha = 0.6;
      ctx.fillRect(x0, Y((s.lo + s.vaHi + 1) * s.rowTicks), 2, Y((s.lo + s.vaLo) * s.rowTicks) - Y((s.lo + s.vaHi + 1) * s.rowTicks));
      ctx.globalAlpha = 1;
      const yP = Y((s.lo + s.poc + 1) * s.rowTicks), hP = Y((s.lo + s.poc) * s.rowTicks) - yP;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x0 + 4, yP, (s.marks[s.poc].length + 1) * L, hP);
      for (let r = 0; r < s.rows; r++) {
        const y = Y((s.lo + r) * s.rowTicks + s.rowTicks / 2);
        if (y < F.top - 10 || y > F.priceB + 10) continue;
        s.marks[r].forEach((p, k) => {
          const stepIdx = Math.min(3, Math.floor((p * 4) / Math.max(1, s.periods)));
          ctx.fillStyle = r === s.poc ? C.poc : steps[stepIdx];
          const x = x0 + 6 + k * L;
          if (letters) ctx.fillText(LETTERS[p % LETTERS.length], x, y);
          else ctx.fillRect(x, y - Math.max(1, rowPx / 2 - 0.5), Math.max(1, L - 1), Math.max(1, rowPx - 1));
        });
      }
      /* the open, and the date under the column */
      ctx.fillStyle = C.text;
      const yo = Y(s.open + 0.5);
      ctx.beginPath(); ctx.moveTo(x0 - 1, yo); ctx.lineTo(x0 + 4, yo - 3); ctx.lineTo(x0 + 4, yo + 3); ctx.closePath(); ctx.fill();
    }
    this.drawingsLayer(F, Y);
    ctx.restore();
    this.priceLabels(F, C, Y);
    ctx.fillStyle = C.bg; ctx.fillRect(0, this.H - F.timeH, F.plotW, F.timeH);
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.faint;
    for (const { s, x0 } of cols) {
      if (x0 > F.plotW || x0 < -200) continue;
      const dd = dateOf(s.dayET);
      ctx.fillText(dd.wd + ' ' + dd.d + ' ' + dd.m, Math.max(2, x0), this.H - 7);
    }
    const f2 = this.frame.bars;
    this.tag(F, Y(f2.c[f2.n - 1]), this.fmt(f2.c[f2.n - 1]), C.text, '#0a0c10');
    if (this.position && this.position.qty) this.line(F, Y, this.position.avg, this.position.qty > 0 ? C.buy : C.sell, this.position.label, true, null);
    for (const o of this.orders) this.line(F, Y, this.drag && this.drag.kind === 'order' && this.drag.id === o.id ? this.drag.price : o.price, o.side === 'buy' ? C.buy : C.sell, o.label, false, o);
    this.badge(F, (this.spec.tpoRth ? 'Regular hours' : 'Full session') + ', ' + (this.spec.tpoPeriod || 30) + '-minute letters, rows of ' + (this.spec.tpoRow || 20) + ' ticks');
    if (this.mouse && this.mouse.x < F.plotW && this.mouse.y > F.top && this.mouse.y < F.priceB) {
      ctx.strokeStyle = 'rgba(237,239,242,0.35)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(0, Math.round(this.mouse.y) + 0.5); ctx.lineTo(F.plotW, Math.round(this.mouse.y) + 0.5); ctx.stroke(); ctx.setLineDash([]);
      this.tag(F, this.mouse.y, this.fmt(Math.round(this.P(this.mouse.y))), C.dim, '#0a0c10');
    }
  }

  crosshair(F, V, C, Y) {
    const ctx = this.ctx, b = this.frame.bars, { x, y } = this.mouse;
    const i = Math.max(V.first, Math.min(V.last, Math.round(this.iAt(x, F, V))));
    const cx = Math.round(this.xOf(i, F, V)) + 0.5;
    ctx.strokeStyle = 'rgba(237,239,242,0.35)'; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, F.top); ctx.lineTo(cx, this.H - F.timeH); ctx.stroke();
    if (y < F.priceB) { ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(F.plotW, Math.round(y) + 0.5); ctx.stroke(); }
    ctx.setLineDash([]);
    if (y < F.priceB) this.tag(F, y, this.fmt(Math.round(this.P(y))), C.dim, '#0a0c10');
    const et = toET(b.t[i]), dd = dateOf(et);
    const tl = dd.wd + ' ' + dd.d + ' ' + dd.m + ' ' + dd.y + (this.spec.tf === 'D' ? '' : ', ' + hm(et) + ' ET');
    ctx.font = '11px "JetBrains Mono", monospace';
    const w = ctx.measureText(tl).width + 12, lx = Math.max(0, Math.min(F.plotW - w, cx - w / 2));
    ctx.fillStyle = C.dim; ctx.fillRect(lx, this.H - F.timeH + 2, w, F.timeH - 4);
    ctx.fillStyle = '#0a0c10'; ctx.textBaseline = 'middle'; ctx.fillText(tl, lx + 6, this.H - F.timeH / 2);
    if (this.cb.onHover) this.cb.onHover(i, this);
  }

  /* ------------------------------------------------------------ the pointer */

  where(p) {
    const F = this.F || this.layout();
    if (p.x >= F.plotW) return 'price';
    if (p.y >= this.H - F.timeH) return 'time';
    return 'plot';
  }
  bind() {
    const cv = this.cv;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const hitAt = (p) => (this.hits || []).find((h) => (h.test ? h.test(p) : p.x >= h.x0 && p.x <= h.x1 && p.y >= h.y0 && p.y <= h.y1));
    const manualY = () => { if (this.yAuto) { this.yAuto = false; } };
    cv.addEventListener('wheel', (e) => {
      if (!this.frame) return;
      e.preventDefault();
      const p = pos(e), F = this.layout();
      if (e.ctrlKey || this.where(p) === 'price') {
        manualY();
        const at = this.P ? this.P(p.y) : (this.yLo + this.yHi) / 2, k = e.deltaY < 0 ? 0.88 : 1 / 0.88;
        this.yLo = at - (at - this.yLo) * k; this.yHi = at + (this.yHi - at) * k;
      } else if (this.spec.type === 'tpo') {
        this.barPx = Math.max(3, Math.min(30, this.barPx * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      } else {
        const V = this.visible(F);
        if (!V) return;
        const anchor = this.iAt(Math.min(p.x, F.barsW), F, V);
        this.barPx = Math.max(2, Math.min(160, this.barPx * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const now = this.iAt(Math.min(p.x, F.barsW), F, this.visible(F));
        this.offset = Math.max(0, Math.min(this.frame.bars.n - 3, this.offset + (now - anchor)));
      }
      this.draw();
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      if (!this.frame || !this.frame.bars) return;
      const p = pos(e);
      if (e.button !== 0) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* a pointer the page did not see start */ }
      const zone = this.where(p);
      if (zone === 'price') { manualY(); this.drag = { kind: 'yscale', y: p.y, lo: this.yLo, hi: this.yHi }; return; }
      if (zone === 'time') { this.drag = { kind: 'xscale', x: p.x, px: this.barPx }; return; }
      const tool = this.cb.tool ? this.cb.tool() : 'cursor';
      if (tool === 'h') { this.cb.addDrawing && this.cb.addDrawing({ kind: 'h', price: Math.round(this.P(p.y)) }); return; }
      if (tool === 'trend' && this.spec.type !== 'tpo') {
        const pt = { t: this.timeOfIdx(this.iAt(p.x, this.F, this.V)), p: Math.round(this.P(p.y)) };
        if (!this.pending) { this.pending = { kind: 'trend', a: pt, b: pt, colour: this.cb.colour ? this.cb.colour() : '' }; this.draw(); return; }
        this.pending.b = pt;
        const d = this.pending; this.pending = null;
        this.cb.addDrawing && this.cb.addDrawing({ kind: 'trend', a: d.a, b: d.b });
        return;
      }
      const h = hitAt(p);
      if (h && h.kind === 'cancel') { this.cb.onOrderCancel && this.cb.onOrderCancel(h.id); return; }
      if (h && h.kind === 'order' && !h.pinned) { const o = this.orders.find((x) => x.id === h.id); this.drag = { kind: 'order', id: h.id, price: o.price, from: o.price }; return; }
      if (h && h.kind === 'drawing') {
        this.selected = h.id;
        this.cb.onSelect && this.cb.onSelect(h.id);
        const d = (this.cb.drawings() || []).find((x) => x.id === h.id);
        this.drag = { kind: 'drawing', id: h.id, end: h.end || null, start: p, orig: JSON.parse(JSON.stringify(d)) };
        this.draw();
        return;
      }
      if (this.selected) { this.selected = null; this.cb.onSelect && this.cb.onSelect(null); }
      this.drag = { kind: 'pan', x: p.x, y: p.y, offset: this.offset, tpo: this.tpoOffset, lo: this.yLo, hi: this.yHi, auto: this.yAuto };
      cv.classList.add('is-panning');
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      this.mouse = p;
      const d = this.drag, F = this.F;
      if (d && d.kind === 'pan') {
        if (this.spec.type === 'tpo') this.tpoOffset = d.tpo + (p.x - d.x);
        else this.offset = Math.max(0, Math.min(this.frame.bars.n - 3, d.offset + (p.x - d.x) / this.barPx));
        if (Math.abs(p.y - d.y) > 3 || !d.auto) {
          if (this.yAuto) { this.yAuto = false; }
          const per = (d.hi - d.lo) / F.priceH;
          this.yLo = d.lo + (p.y - d.y) * per; this.yHi = d.hi + (p.y - d.y) * per;
        }
      } else if (d && d.kind === 'yscale') {
        const k = Math.exp((p.y - d.y) * 0.006), mid = (d.lo + d.hi) / 2, half = ((d.hi - d.lo) / 2) * k;
        this.yLo = mid - half; this.yHi = mid + half;
      } else if (d && d.kind === 'xscale') {
        this.barPx = Math.max(2, Math.min(160, d.px * Math.exp((p.x - d.x) * 0.006)));
      } else if (d && d.kind === 'order') {
        d.price = Math.round(this.P(p.y));
      } else if (d && d.kind === 'drawing') {
        const dy = Math.round(this.P(p.y) - this.P(d.start.y));
        const nd = JSON.parse(JSON.stringify(d.orig));
        if (nd.kind === 'h') nd.price = d.orig.price + dy;
        else {
          const dt = this.timeOfIdx(this.iAt(p.x, F, this.V)) - this.timeOfIdx(this.iAt(d.start.x, F, this.V));
          if (d.end) { nd[d.end].p = d.orig[d.end].p + dy; nd[d.end].t = d.orig[d.end].t + dt; }
          else { nd.a.p += dy; nd.b.p += dy; nd.a.t += dt; nd.b.t += dt; }
        }
        this.cb.updateDrawing && this.cb.updateDrawing(nd, false);
      } else if (this.pending) {
        this.pending.b = { t: this.timeOfIdx(this.iAt(p.x, this.F, this.V)), p: Math.round(this.P(p.y)) };
      } else {
        const zone = this.where(p), h = zone === 'plot' ? hitAt(p) : null;
        cv.dataset.over = zone === 'price' ? 'price' : zone === 'time' ? 'time' : h ? h.kind : (this.cb.tool && this.cb.tool() !== 'cursor' ? 'tool' : '');
      }
      this.draw();
    });
    const end = () => {
      const d = this.drag;
      if (d && d.kind === 'order' && d.price !== d.from) this.cb.onOrderMove && this.cb.onOrderMove(d.id, d.price);
      if (d && d.kind === 'drawing') { const cur = (this.cb.drawings() || []).find((x) => x.id === d.id); if (cur) this.cb.updateDrawing && this.cb.updateDrawing(cur, true); }
      this.drag = null;
      cv.classList.remove('is-panning');
      this.draw();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (!this.drag) { this.mouse = null; this.draw(); } });
    cv.addEventListener('dblclick', (e) => { const p = pos(e); if (this.where(p) === 'price') this.fitPrices(); else this.toPresent(); });
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.frame || !this.P) return;
      const p = pos(e);
      if (this.where(p) !== 'plot' || p.y > this.F.priceB) return;
      const h = hitAt(p);
      this.cb.onContext && this.cb.onContext({ price: Math.round(this.P(p.y)), x: e.clientX, y: e.clientY, drawing: h && h.kind === 'drawing' ? h.id : null });
    });
  }
}

function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
/* the point of control and value area of a profile (kept here to draw it) */
function valueAreaOf(L, pct) {
  let poc = 0, total = 0;
  for (let r = 0; r < L.rows; r++) { total += L.vol[r]; if (L.vol[r] > L.vol[poc]) poc = r; }
  let a = poc, b = poc, sum = L.vol[poc];
  while (sum < total * pct / 100 && (a > 0 || b < L.rows - 1)) {
    const down = a > 0 ? L.vol[a - 1] : -1, up = b < L.rows - 1 ? L.vol[b + 1] : -1;
    if (up >= down) { b++; sum += L.vol[b]; } else { a--; sum += L.vol[a]; }
  }
  return { poc, vaLo: a, vaHi: b };
}
