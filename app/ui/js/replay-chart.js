/* A Replay chart, drawn on a canvas. By default: white candles up, black
   candles down, white borders and wicks, on plain black, with hairline
   grids and mono labels; the bid and ask colours only for buying and
   selling (orders, fills, footprint, delta). The reader can change the
   colours of each chart.

   Types: candles; footprint (buys and sells at each price inside each bar,
   from a file of trades, as a full fill or a histogram); TPO (a session's
   prices by period, as letters or blocks, overnight and regular hours
   apart or together). Panes: volume, and delta (each bar's buys less
   sells, with a running total that starts again each session). Profiles:
   volume and delta at price, over the visible bars (in a strip at the
   right), or each day or regular session (against the right end of that
   day), at widths the reader sets, with lines at the point of control and
   the value area's edges. Indicators: VWAP with deviation bands.

   Moving: drag the chart in any direction, past the latest bar too; drag
   the price axis to stretch prices, the time axis to stretch time; the
   wheel zooms time (with Ctrl, prices); a double click on the chart
   returns to the present, on the price axis fits the prices again. A
   footprint puts its latest bar back in the middle of the chart when the
   replay carries the price out of view, but not when the reader has moved
   it out of view. TPO single prints extend to the right until a later
   period trades back into them. Lines: the page
   chooses a tool; a click places a horizontal line, two clicks a trend
   line; a line can be selected, dragged, and removed. Order lines can be
   dragged or cancelled.

   The chart shows the replay up to its present and never past it. Times
   are New York time. */

import { toET, tradingDayNo, LETTERS } from './replay-data.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MINUS = '−';
const INK = '#0a0c10';
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
  tf: 1, type: 'candles', volume: true, delta: false,
  vp: false, dp: false, vpMode: 'visible', dpMode: 'visible', vaPct: 70, profileRow: 0, vpLines: true, profileWidth: 120, dpWidth: 60,
  fpStyle: 'fill',
  tpoSession: 'split', tpoPeriod: 30, tpoRow: 20, tpoVa: 70, tpoShow: 'letters', tpoShade: true, tpoSingles: true, tpoExtend: true, tpoVaOn: true, tpoIb: true, tpoOpen: true,
  indicators: [],
  look: { up: '', down: '', border: '', wick: '', bg: '', grid: true, vol: '', prof: '', va: '', poc: '', buy: '', sell: '', tpoLetter: '', tpoPoc: '', tpoVa: '', tpoSingle: '', tpoIb: '' },
};
/* the colours a chart uses when the reader has not chosen one (buys and
   sells come from the bid and ask tokens) */
export const LOOK_DEFAULTS = {
  up: '#ffffff', down: '#000000', border: '#ffffff', wick: '#ffffff', bg: '#000000', vol: '#ffffff',
  prof: '#6b727c', va: '#98a0aa', poc: '#edeff2',
  tpoLetter: '#98a0aa', tpoPoc: '#ffffff', tpoVa: '#98a0aa', tpoSingle: '#edeff2', tpoIb: '#edeff2',
};
export const VWAP_DEFAULTS = { kind: 'vwap', anchor: 'day', bands: [0.5, 2, 2.5], colour: '#98a0aa', bandColour: '#6b727c' };

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

  setFrame(frame) {
    this.frame = frame;
    if (this.spec.type === 'footprint' && !this.drag && this.wasInView && !this.latestInView()) this.centre();
    this.draw();
  }
  setSpec(spec) { this.spec = spec; this.draw(); }
  setOverlay({ orders, position, markers }) {
    if (orders) this.orders = orders;
    if (position !== undefined) this.position = position;
    if (markers) this.markers = markers;
  }
  toPresent() {
    this.offset = 0; this.tpoOffset = 0; this.yAuto = true;
    if (this.spec.type === 'footprint') this.centre();
    this.draw();
  }
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
    const L = this.spec.look || {}, D = LOOK_DEFAULTS;
    const text = css('--text') || '#edeff2', dim = css('--text-dim') || '#98a0aa', faint = css('--text-faint') || '#6b727c';
    return {
      text, dim, faint,
      up: L.up || D.up, down: L.down || D.down, border: L.border || D.border, wick: L.wick || D.wick, bg: L.bg || D.bg,
      grid: L.grid === false ? null : 'rgba(255,255,255,0.06)', axis: 'rgba(255,255,255,0.12)',
      vol: L.vol ? rgba(L.vol, 0.55) : 'rgba(255,255,255,0.16)',
      prof: L.prof || D.prof, va: L.va || D.va, poc: L.poc || D.poc,
      buy: L.buy || css('--bid'), sell: L.sell || css('--ask'),
      tLetter: L.tpoLetter || D.tpoLetter, tPoc: L.tpoPoc || D.tpoPoc, tVa: L.tpoVa || D.tpoVa, tSingle: L.tpoSingle || D.tpoSingle, tIb: L.tpoIb || D.tpoIb,
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
    /* a profile of the visible bars gets its own strip at the right, so it never covers the latest bars */
    const strip = s.type !== 'tpo' && ((s.vp && (s.vpMode || 'visible') === 'visible') || (s.dp && (s.dpMode || 'visible') === 'visible'));
    const vpOn = s.vp && (s.vpMode || 'visible') === 'visible', dpOn = s.dp && (s.dpMode || 'visible') === 'visible' && f && f.canDelta;
    const profW = strip ? Math.round(Math.min(plotW * 0.5, (vpOn ? s.profileWidth || 120 : 0) + (dpOn ? (s.dpWidth || 60) + (vpOn ? 10 : 0) : 0) + 14)) : 0;
    return { axisW, timeH, top, plotW, barsW: plotW - profW, profW, priceH, priceB: top + priceH, volTop: top + priceH + (showVol ? 6 : 0), volH, dTop: top + priceH + (showVol ? 6 + volH : 0) + (showDelta ? 6 : 0), dH, showVol, showDelta };
  }
  /* which bars show. The offset counts bars back from the latest; below
     zero it leaves that much empty room after the latest bar. */
  basePad(F) {
    const count = Math.max(2, Math.floor(F.barsW / this.barPx));
    return { count, pad: Math.max(1, Math.min(6, Math.floor(count * 0.12))) };
  }
  visible(F) {
    const b = this.frame && this.frame.bars;
    if (!b || !b.n) return null;
    const { count, pad: base } = this.basePad(F);
    const o = this.offset;
    const last = o >= 0 ? Math.max(0, Math.min(b.n - 1, b.n - 1 - Math.round(o))) : b.n - 1;
    const pad = o >= 0 ? base : base - o;
    const first = Math.max(0, Math.min(last, Math.floor(last + pad - count)));
    return { first, last, pad };
  }
  xOf(i, F, V) { return F.barsW - (V.last - i + V.pad) * this.barPx - this.barPx / 2; }
  iAt(x, F, V) { return V.last + V.pad - (F.barsW - x - this.barPx / 2) / this.barPx; }
  clampOffset(o, F) {
    const { count } = this.basePad(F);
    return Math.max(-Math.floor(count * 0.9), Math.min(this.frame.bars.n - 3, o));
  }
  /* is the latest bar, at the last price, inside the chart as it stands? */
  latestInView() {
    const f = this.frame;
    if (!f || !f.bars || !f.bars.n) return false;
    const F = this.layout(), b = f.bars, n = b.n, V = this.visible(F);
    const x = this.xOf(n - 1, F, V);
    if (x < 0 || x > F.barsW) return false;
    if (this.yAuto) return true;
    const y = F.top + (1 - (b.c[n - 1] - this.yLo) / (this.yHi - this.yLo)) * F.priceH;
    return y > F.top && y < F.priceB;
  }
  /* the latest bar in the middle, both ways */
  centre() {
    const f = this.frame;
    if (!f || !f.bars || !f.bars.n) return;
    const F = this.layout(), b = f.bars, n = b.n, lastP = b.c[n - 1];
    const { pad } = this.basePad(F);
    this.offset = Math.min(0, pad - (F.barsW / (2 * this.barPx) - 0.5));
    let span = this.yHi - this.yLo;
    if (this.yAuto || !(span > 0)) {
      const V = this.visible(F);
      let lo = Infinity, hi = -Infinity;
      for (let i = V.first; i <= V.last; i++) { if (b.l[i] < lo) lo = b.l[i]; if (b.h[i] > hi) hi = b.h[i]; }
      span = Math.max(40, Number.isFinite(hi - lo) ? (hi - lo) * 1.25 : 40);
    }
    this.yLo = lastP - span / 2; this.yHi = lastP + span / 2;
    this.yAuto = false;
  }
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
    /* the price range: fitted to the visible bars, or as the reader (or the footprint's follow) left it */
    let lo = Infinity, hi = -Infinity;
    for (let i = V.first; i <= V.last; i++) { if (b.l[i] < lo) lo = b.l[i]; if (b.h[i] > hi) hi = b.h[i]; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = hi = b.c[b.n - 1]; }
    if (hi === lo) { hi += 4; lo -= 4; }
    if (this.yAuto) { const pad = (hi - lo) * 0.08; this.yLo = lo - pad; this.yHi = hi + pad; }
    const Y = (p) => F.top + (1 - (p - this.yLo) / (this.yHi - this.yLo)) * F.priceH;
    this.Y = Y;
    this.P = (y) => this.yLo + (1 - (y - F.top) / F.priceH) * (this.yHi - this.yLo);

    this.rowNote = '';
    this.indTags = [];
    ctx.save();
    ctx.beginPath(); ctx.rect(0, F.top, F.plotW, F.priceH); ctx.clip();
    this.priceGrid(F, C, Y);
    this.sessionLines(F, V, C);
    const wantFoot = this.spec.type === 'footprint';
    const footOK = wantFoot && f.footprint;
    if (this.spec.vp || this.spec.dp) this.profiles(F, V, C, Y);
    if (footOK && this.barPx >= 10) this.footprint(F, V, C, Y);
    else this.candles(F, V, C, Y);
    this.indicators(F, V, C, Y);
    this.drawingsLayer(F, Y);
    this.fills(F, V, C, Y);
    ctx.restore();

    this.priceLabels(F, C, Y);
    this.timeAxis(F, V, C);
    if (this.rowNote) { ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = C.faint; ctx.textBaseline = 'alphabetic'; ctx.fillText(this.rowNote, F.plotW + 8, this.H - 8); }
    if (F.showVol) this.volumePane(F, V, C);
    if (F.showDelta) this.deltaPane(F, V, C);

    /* the last price, indicators, the position and working orders */
    for (const [v, colour] of this.indTags) this.tag(F, Y(v), this.fmt(Math.round(v)), colour, INK);
    this.tag(F, Y(b.c[b.n - 1]), this.fmt(b.c[b.n - 1]), C.text, INK);
    if (this.position && this.position.qty) this.line(F, Y, this.position.avg, this.position.qty > 0 ? C.buy : C.sell, this.position.label, true, null);
    for (const o of this.orders) {
      const price = this.drag && this.drag.kind === 'order' && this.drag.id === o.id ? this.drag.price : o.price;
      this.line(F, Y, price, o.side === 'buy' ? C.buy : C.sell, o.label + ' · ' + this.fmt(price), false, o);
    }
    if (wantFoot && !f.footprint) this.badge(F, 'Footprint needs a file of trades. This file has bars, so candles are shown.');
    else if (wantFoot && this.barPx < 10) this.badge(F, 'Zoom in to see the footprint.');
    if ((this.spec.dp || this.spec.delta) && !f.canDelta) this.badge(F, 'Delta needs a file of trades: this file has bars.', 1);
    if (this.mouse && this.mouse.x < F.plotW && this.mouse.y > F.top && this.mouse.y < this.H - F.timeH) this.crosshair(F, V, C, Y);
    this.wasInView = this.latestInView();
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
  /* bodies filled up or down, outlined in the border colour; wicks apart */
  candles(F, V, C, Y) {
    const ctx = this.ctx, b = this.frame.bars;
    const bw = Math.max(1, Math.floor(this.barPx * 0.7));
    ctx.lineWidth = 1;
    for (let i = V.first; i <= V.last; i++) {
      const x = Math.round(this.xOf(i, F, V)) + 0.5;
      const up = b.c[i] >= b.o[i];
      const yH = Y(b.h[i]), yL = Y(b.l[i]), y1 = Y(Math.max(b.o[i], b.c[i])), y2 = Y(Math.min(b.o[i], b.c[i]));
      if (bw < 3) {
        ctx.strokeStyle = C.border;
        ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
        continue;
      }
      ctx.strokeStyle = C.wick;
      ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, Math.round(y1)); ctx.moveTo(x, Math.round(y2)); ctx.lineTo(x, yL); ctx.stroke();
      const left = Math.round(x - bw / 2) + 0.5, top = Math.round(y1) + 0.5, h = Math.max(1, Math.round(y2) - Math.round(y1));
      ctx.fillStyle = up ? C.up : C.down;
      ctx.fillRect(left, top, bw - 1, h);
      ctx.strokeStyle = C.border;
      ctx.strokeRect(left, top, bw - 1, h);
    }
  }

  /* each bar's sells (left) and buys (right) at every row: as a full fill
     in four flat steps of the sell and buy colours, or as a histogram out
     from the middle; the bar's busiest row boxed */
  footprint(F, V, C, Y) {
    const ctx = this.ctx, f = this.frame, b = f.bars;
    const pxTick = F.priceH / (this.yHi - this.yLo);
    const showText = this.barPx >= 64;
    const rowTicks = nice(Math.max(1, Math.ceil((showText ? 13 : 3) / pxTick)));
    this.rowNote = 'ROW ' + rowTicks + (rowTicks === 1 ? ' TICK' : ' TICKS');
    const hist = this.spec.fpStyle === 'histogram';
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
    const w = Math.max(4, this.barPx - 8);
    ctx.font = (this.barPx >= 90 ? 11 : 10) + 'px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    for (const [i, L] of cells) {
      const xc = this.xOf(i, F, V), x0 = Math.round(xc - w / 2), half = Math.floor(w / 2);
      let poc = 0;
      for (let r = 0; r < L.rows; r++) if (L.vol[r] > L.vol[poc]) poc = r;
      for (let r = 0; r < L.rows; r++) {
        const pLo = (L.lo + r) * rowTicks, yTop = Y(pLo + rowTicks), yBot = Y(pLo), hgt = Math.max(1, yBot - yTop - 1);
        if (hist) {
          const ls = (L.sell[r] / max) * (half - 1), lb = (L.buy[r] / max) * (w - half - 1);
          ctx.fillStyle = rgba(C.sell, 0.6) || C.sell;
          if (ls > 0) ctx.fillRect(x0 + half - 1 - ls, yTop, ls, hgt);
          ctx.fillStyle = rgba(C.buy, 0.6) || C.buy;
          if (lb > 0) ctx.fillRect(x0 + half, yTop, lb, hgt);
        } else {
          const s = step(L.sell[r]), u = step(L.buy[r]);
          if (s) { ctx.fillStyle = rgba(C.sell, alpha[s]) || C.sell; ctx.fillRect(x0, yTop, half - 1, hgt); }
          if (u) { ctx.fillStyle = rgba(C.buy, alpha[u]) || C.buy; ctx.fillRect(x0 + half, yTop, w - half, hgt); }
        }
        if (showText && hgt >= 10) {
          ctx.fillStyle = L.vol[r] ? C.text : C.faint;
          const sv = short(L.sell[r]), bv = short(L.buy[r]);
          ctx.fillText(sv, x0 + half - 4 - ctx.measureText(sv).width, yTop + hgt / 2);
          ctx.fillText(bv, x0 + half + 4, yTop + hgt / 2);
        }
        if (r === poc) { ctx.strokeStyle = C.text; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, Math.round(yTop) + 0.5, w - 1, Math.max(1, Math.round(hgt) - 1)); }
      }
      /* a thin candle at the bar's left edge, and the bar's delta below */
      const yH = Y(b.h[i]), yL = Y(b.l[i]), y1 = Y(Math.max(b.o[i], b.c[i])), y2 = Y(Math.min(b.o[i], b.c[i]));
      const cx = x0 - 3.5;
      ctx.strokeStyle = C.wick; ctx.beginPath(); ctx.moveTo(cx, yH); ctx.lineTo(cx, yL); ctx.stroke();
      ctx.fillStyle = b.c[i] >= b.o[i] ? C.up : C.down;
      ctx.fillRect(cx - 1.5, y1, 3, Math.max(1, y2 - y1));
      ctx.strokeStyle = C.border; ctx.strokeRect(cx - 1.5, y1, 3, Math.max(1, y2 - y1));
      if (this.barPx >= 36 && b.dl) {
        const dv = b.dl[i];
        ctx.fillStyle = dv > 0 ? C.buy : dv < 0 ? C.sell : C.faint;
        const tx = (dv > 0 ? '+' : '') + short(dv);
        ctx.fillText(tx, xc - ctx.measureText(tx).width / 2, Math.min(F.priceB - 8, Y(b.l[i]) + 12));
      }
    }
  }

  /* volume and delta at price: over the visible bars in the strip at the
     right, or each day or regular session in place */
  profiles(F, V, C, Y) {
    const f = this.frame, s = this.spec;
    const pxTick = F.priceH / (this.yHi - this.yLo);
    const rowTicks = s.profileRow > 0 ? s.profileRow : nice(Math.max(1, Math.ceil(3 / pxTick)));
    if (!this.rowNote) this.rowNote = 'ROW ' + rowTicks + (rowTicks === 1 ? ' TICK' : ' TICKS');
    const vpMode = s.vpMode || 'visible', dpMode = s.dpMode || 'visible';
    const vp = s.vp, dp = s.dp && f.canDelta;
    const pw = s.profileWidth || 120, dw = s.dpWidth || 60;
    if (F.profW) {
      this.ctx.fillStyle = C.axis;
      this.ctx.fillRect(F.barsW, F.top, 1, F.priceH);
      const L = f.profile(V.first, V.last, rowTicks);
      if (L) {
        const x0 = F.barsW + 8, x1 = F.plotW - 4;
        const showVp = vp && vpMode === 'visible', showDp = dp && dpMode === 'visible' && L.split;
        const vw = showVp ? Math.min(pw, x1 - x0) : 0;
        if (showVp) this.vpBars(L, rowTicks, x1 - vw, x1, 'right', C, Y, x0, x1, true);
        if (showDp) { const right = showVp ? x1 - vw - 10 : x1; this.dpBars(L, rowTicks, Math.max(x0, right - dw), right, C, Y); }
      }
    }
    if (!f.sessions) return;
    for (const kind of ['vp', 'dp']) {
      const on = kind === 'vp' ? vp : dp, mode = kind === 'vp' ? vpMode : dpMode;
      if (!on || mode === 'visible') continue;
      for (const S of f.sessions(mode, V.first, V.last)) {
        const x0 = this.xOf(S.c0, F, V) - this.barPx / 2, x1 = this.xOf(S.c1, F, V) + this.barPx / 2;
        if (x1 < 0 || x0 > F.barsW) continue;
        const L = f.levelsBase(S.b0, S.b1, rowTicks);
        if (!L) continue;
        /* against the right end of the day, or of the chart while the day's
           end is beyond it, at a fixed width (never wider than the day) */
        const right = Math.min(x1, F.barsW);
        const room = Math.max(8, Math.min(x1 - x0, right - x0)), vw = Math.min(pw, room);
        if (kind === 'vp') this.vpBars(L, rowTicks, right - vw, right, 'right', C, Y, x0, right, false);
        else if (L.split) {
          const end = vp && vpMode === mode ? right - vw - 4 : right;
          this.dpBars(L, rowTicks, end - Math.min(dw, room), end, C, Y);
        }
      }
    }
  }
  /* a volume profile's rows between a and b, growing from one edge; lines
     at the point of control and the value area's edges across la to lb */
  vpBars(L, rowTicks, a, b, from, C, Y, la, lb, labels) {
    const ctx = this.ctx, w = b - a, pxTick = this.F.priceH / (this.yHi - this.yLo);
    const va = valueAreaOf(L, this.spec.vaPct || 70);
    let max = 1;
    for (let r = 0; r < L.rows; r++) if (L.vol[r] > max) max = L.vol[r];
    for (let r = 0; r < L.rows; r++) {
      const pLo = (L.lo + r) * rowTicks, yTop = Y(pLo + rowTicks), hgt = Math.max(1, Y(pLo) - yTop - (pxTick * rowTicks > 4 ? 1 : 0));
      const len = (L.vol[r] / max) * w;
      ctx.fillStyle = r === va.poc ? C.poc : r >= va.vaLo && r <= va.vaHi ? C.va : C.prof;
      ctx.globalAlpha = r === va.poc ? 0.95 : 0.55;
      if (from === 'left') ctx.fillRect(a, yTop, len, hgt); else ctx.fillRect(b - len, yTop, len, hgt);
    }
    ctx.globalAlpha = 1;
    const yPoc = Y((L.lo + va.poc) * rowTicks + rowTicks / 2), yH = Y((L.lo + va.vaHi + 1) * rowTicks), yL = Y((L.lo + va.vaLo) * rowTicks);
    if (this.spec.vpLines !== false) {
      const hl = (y, colour) => { ctx.fillStyle = colour; ctx.fillRect(la, Math.round(y), lb - la, 1); };
      hl(yH, C.va); hl(yL, C.va); hl(yPoc, C.poc);
    }
    if (labels) {
      ctx.font = '10px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.dim;
      const lx = la - 30;
      ctx.fillText('POC', lx, yPoc);
      if (yPoc - yH >= 13) ctx.fillText('VAH', lx, yH);
      if (yL - yPoc >= 13) ctx.fillText('VAL', lx, yL);
    }
  }
  /* a delta profile between a and b: each row's buys less sells out from a zero line */
  dpBars(L, rowTicks, a, b, C, Y) {
    const ctx = this.ctx, pxTick = this.F.priceH / (this.yHi - this.yLo);
    const mid = Math.round((a + b) / 2), half = (b - a) / 2 - 2;
    let dmax = 1;
    for (let r = 0; r < L.rows; r++) dmax = Math.max(dmax, Math.abs(L.buy[r] - L.sell[r]));
    ctx.fillStyle = C.axis;
    ctx.fillRect(mid, Y((L.lo + L.rows) * rowTicks), 1, Y(L.lo * rowTicks) - Y((L.lo + L.rows) * rowTicks));
    ctx.globalAlpha = 0.8;
    for (let r = 0; r < L.rows; r++) {
      const dv = L.buy[r] - L.sell[r];
      if (!dv) continue;
      const pLo = (L.lo + r) * rowTicks, yTop = Y(pLo + rowTicks), hgt = Math.max(1, Y(pLo) - yTop - (pxTick * rowTicks > 4 ? 1 : 0));
      const len = (Math.abs(dv) / dmax) * half;
      ctx.fillStyle = dv > 0 ? C.buy : C.sell;
      ctx.fillRect(dv > 0 ? mid + 1 : mid - len, yTop, len, hgt);
    }
    ctx.globalAlpha = 1;
  }

  /* VWAP and its bands, each starting again at its anchor */
  indicators(F, V, C, Y) {
    const f = this.frame, list = this.spec.indicators || [];
    if (!f.vwap || !list.length) return;
    const ctx = this.ctx;
    for (const ind of list) {
      if (ind.kind !== 'vwap') continue;
      const r = f.vwap(ind, V.first, V.last);
      if (!r) continue;
      const lc = ind.colour || VWAP_DEFAULTS.colour, bc = ind.bandColour || VWAP_DEFAULTS.bandColour;
      const trace = (k, colour, width, dash) => {
        ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.setLineDash(dash);
        ctx.beginPath();
        let on = false, end = null;
        for (let i = V.first; i <= V.last; i++) {
          const j = i - V.first, v = r.v[j];
          if (!Number.isFinite(v)) { on = false; continue; }
          const x = this.xOf(i, F, V), y = Y(v + k * r.sd[j]);
          if (!on || r.brk[j]) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          on = true; end = [x, y];
        }
        ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
        return end;
      };
      ctx.font = '9px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle';
      for (const k of ind.bands || []) {
        for (const sgn of [1, -1]) {
          const end = trace(sgn * k, bc, 1, [4, 3]);
          if (end) { ctx.fillStyle = bc; ctx.fillText((sgn > 0 ? '+' : MINUS) + k + 'σ', end[0] + 5, end[1]); }
        }
      }
      const end = trace(0, lc, 1.6, []);
      if (end) { ctx.fillStyle = lc; ctx.fillText('VWAP', end[0] + 5, end[1]); }
      const j = V.last - V.first;
      if (V.last === f.bars.n - 1 && Number.isFinite(r.v[j])) this.indTags.push([r.v[j], lc]);
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
    this.tag(F, yy, this.fmt(price), colour, INK);
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
    const ctx = this.ctx, f = this.frame, s = this.spec;
    const T = f.tpo ? f.tpo(s) : { n: 0 };
    const mode = s.tpoSession || 'split';
    if (!T.n) { this.note(mode === 'rth' ? 'No regular-hours session yet in this replay.' : 'No session yet.'); return; }
    const L = this.barPx;
    /* columns from the right: the latest session at the present */
    const cols = [];
    let xr = F.plotW - 12 + this.tpoOffset;
    for (let k = T.n - 1; k >= 0 && xr > -400; k--) {
      const S = T.at(k);
      let most = 1;
      for (const m of S.marks) if (m.length > most) most = m.length;
      const w = (most + 2) * L + 10;
      cols.push({ k, S, x0: xr - w, w, most });
      xr -= w + Math.max(10, L);
    }
    let lo = Infinity, hi = -Infinity;
    for (const c of cols) { if (c.x0 + c.w < 0 || c.x0 > F.plotW) continue; lo = Math.min(lo, c.S.lo * c.S.rowTicks); hi = Math.max(hi, (c.S.lo + c.S.rows) * c.S.rowTicks); }
    if (!Number.isFinite(lo)) { lo = cols[0].S.lo * cols[0].S.rowTicks; hi = (cols[0].S.lo + cols[0].S.rows) * cols[0].S.rowTicks; }
    if (this.yAuto) { const pad = (hi - lo) * 0.05; this.yLo = lo - pad; this.yHi = hi + pad; }
    const Y = (p) => F.top + (1 - (p - this.yLo) / (this.yHi - this.yLo)) * F.priceH;
    this.Y = Y; this.P = (y) => this.yLo + (1 - (y - F.top) / F.priceH) * (this.yHi - this.yLo);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, F.top, F.plotW, F.priceH + F.volH + F.dH + 12); ctx.clip();
    this.priceGrid(F, C, Y);
    const shades = s.tpoShade === false ? [1, 1, 1, 1] : [0.5, 0.66, 0.83, 1];
    const blocks = s.tpoShow === 'blocks';
    if (s.tpoSingles !== false && s.tpoExtend !== false && T.zones) this.singleZones(T.zones(), cols, F, C, Y, L, s.tpoRow || 20);
    for (const { S, x0, w, most } of cols) {
      if (x0 > F.plotW || x0 + w < 0) continue;
      const rt = S.rowTicks, rowPx = (F.priceH / (this.yHi - this.yLo)) * rt;
      const letters = !blocks && rowPx >= 8 && L >= 6;
      const lx = x0 + 10;
      const rowTop = (r) => Y((S.lo + r + 1) * rt), rowBot = (r) => Y((S.lo + r) * rt);
      ctx.font = Math.max(7, Math.min(13, Math.min(rowPx - 1, L * 1.25))) + 'px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      /* the initial balance and the value area as bars at the column's left */
      if (s.tpoIb !== false && S.ib) { ctx.fillStyle = C.tIb; ctx.fillRect(x0, rowTop(S.ib.hi), 2, rowBot(S.ib.lo) - rowTop(S.ib.hi)); }
      if (s.tpoVaOn !== false) { ctx.fillStyle = C.tVa; ctx.globalAlpha = 0.7; ctx.fillRect(x0 + 4, rowTop(S.vaHi), 2, rowBot(S.vaLo) - rowTop(S.vaHi)); ctx.globalAlpha = 1; }
      /* single prints: a faint band behind them */
      const single = new Uint8Array(S.rows);
      if (s.tpoSingles !== false) {
        for (const [a, b] of S.singles) {
          for (let r = a; r <= b; r++) single[r] = 1;
          ctx.fillStyle = rgba(C.tSingle, 0.16) || C.tSingle;
          ctx.fillRect(lx - 2, rowTop(b), Math.min(most, 3) * L + 4, rowBot(a) - rowTop(b));
        }
      }
      /* the point of control as a band */
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(lx - 2, rowTop(S.poc), (S.marks[S.poc].length + 0.5) * L + 4, rowBot(S.poc) - rowTop(S.poc));
      const base = S.kind === 'on' ? 26 : 0;
      for (let r = 0; r < S.rows; r++) {
        const y = Y((S.lo + r) * rt + rt / 2);
        if (y < F.top - 10 || y > F.priceB + 10) continue;
        const colour = r === S.poc ? C.tPoc : single[r] ? C.tSingle : C.tLetter;
        S.marks[r].forEach((p, k) => {
          ctx.globalAlpha = r === S.poc || single[r] ? 1 : shades[Math.min(3, Math.floor((p * 4) / Math.max(1, S.periods)))];
          ctx.fillStyle = colour;
          const x = lx + k * L;
          if (letters) ctx.fillText(LETTERS[(base + p) % LETTERS.length], x, y);
          else ctx.fillRect(x, y - Math.max(1, rowPx / 2 - 0.5), Math.max(1, L - 1), Math.max(1, rowPx - 1));
        });
      }
      ctx.globalAlpha = 1;
      /* the open */
      if (s.tpoOpen !== false) {
        ctx.fillStyle = C.text;
        const yo = Y(S.open + 0.5);
        ctx.beginPath(); ctx.moveTo(lx - 7, yo); ctx.lineTo(lx - 2, yo - 3); ctx.lineTo(lx - 2, yo + 3); ctx.closePath(); ctx.fill();
      }
    }
    this.drawingsLayer(F, Y);
    ctx.restore();
    this.priceLabels(F, C, Y);
    ctx.fillStyle = C.bg; ctx.fillRect(0, this.H - F.timeH, F.plotW, F.timeH);
    ctx.font = '11px "JetBrains Mono", monospace'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.faint;
    cols.forEach(({ S, x0, w }, k) => {
      if (x0 > F.plotW || x0 + w < 0) return;
      const dd = dateOf(S.dayET), tail = mode === 'split' ? (S.kind === 'on' ? ' · ON' : ' · RTH') : '';
      const room = (k > 0 ? cols[k - 1].x0 : F.plotW) - Math.max(2, x0) - 8;
      const label = [dd.wd + ' ' + dd.d + ' ' + dd.m + tail, dd.d + ' ' + dd.m + tail, tail ? tail.slice(3) : dd.d + ' ' + dd.m].find((t) => ctx.measureText(t).width <= room);
      if (label) ctx.fillText(label, Math.max(2, x0), this.H - 7);
    });
    const f2 = this.frame.bars;
    this.tag(F, Y(f2.c[f2.n - 1]), this.fmt(f2.c[f2.n - 1]), C.text, INK);
    if (this.position && this.position.qty) this.line(F, Y, this.position.avg, this.position.qty > 0 ? C.buy : C.sell, this.position.label, true, null);
    for (const o of this.orders) this.line(F, Y, this.drag && this.drag.kind === 'order' && this.drag.id === o.id ? this.drag.price : o.price, o.side === 'buy' ? C.buy : C.sell, o.label, false, o);
    const what = mode === 'split' ? 'Overnight (from the 4:00 pm ET close) and regular hours' : mode === 'rth' ? 'Regular hours' : 'Full trading day';
    this.badge(F, what + ', ' + (s.tpoPeriod || 30) + '-minute periods, rows of ' + (s.tpoRow || 20) + ' ticks');
    if (this.mouse && this.mouse.x < F.plotW && this.mouse.y > F.top && this.mouse.y < F.priceB) {
      ctx.strokeStyle = 'rgba(237,239,242,0.35)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(0, Math.round(this.mouse.y) + 0.5); ctx.lineTo(F.plotW, Math.round(this.mouse.y) + 0.5); ctx.stroke(); ctx.setLineDash([]);
      this.tag(F, this.mouse.y, this.fmt(Math.round(this.P(this.mouse.y))), C.dim, INK);
    }
  }

  /* single prints from earlier sessions, as bands running right until a
     later period trades into them (the part traded into stops there; the
     rest runs on) */
  singleZones(Z, cols, F, C, Y, L, rt) {
    const ctx = this.ctx, byK = new Map(cols.map((c) => [c.k, c]));
    const oldest = cols.length ? cols[cols.length - 1].k : Infinity;
    const band = (z, x0, x1) => {
      if (x1 <= x0 || x1 < 0 || x0 > F.plotW) return;
      const yTop = Y((z.hi + 1) * rt), yBot = Y(z.lo * rt);
      ctx.fillStyle = rgba(C.tSingle, 0.09) || C.tSingle;
      ctx.fillRect(x0, yTop, x1 - x0, yBot - yTop);
      ctx.fillStyle = rgba(C.tSingle, 0.4) || C.tSingle;
      ctx.fillRect(x0, Math.round(yTop), x1 - x0, 1);
      ctx.fillRect(x0, Math.round(yBot) - 1, x1 - x0, 1);
    };
    const startOf = (z) => { const c = byK.get(z.from); return c ? c.x0 + 10 + L + 2 : z.from < oldest ? -10 : null; };
    for (const z of Z.ended) {
      const c = byK.get(z.to), x0 = startOf(z);
      if (!c || x0 === null) continue;
      band(z, x0, c.x0 + 8);
    }
    for (const z of Z.live) { const x0 = startOf(z); if (x0 !== null) band(z, x0, F.plotW); }
  }

  crosshair(F, V, C, Y) {
    const ctx = this.ctx, b = this.frame.bars, { x, y } = this.mouse;
    const i = Math.max(V.first, Math.min(V.last, Math.round(this.iAt(x, F, V))));
    const cx = Math.round(this.xOf(i, F, V)) + 0.5;
    ctx.strokeStyle = 'rgba(237,239,242,0.35)'; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, F.top); ctx.lineTo(cx, this.H - F.timeH); ctx.stroke();
    if (y < F.priceB) { ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(F.plotW, Math.round(y) + 0.5); ctx.stroke(); }
    ctx.setLineDash([]);
    if (y < F.priceB) this.tag(F, y, this.fmt(Math.round(this.P(y))), C.dim, INK);
    const et = toET(b.t[i]), dd = dateOf(et);
    const tl = dd.wd + ' ' + dd.d + ' ' + dd.m + ' ' + dd.y + (this.spec.tf === 'D' ? '' : ', ' + hm(et) + ' ET');
    ctx.font = '11px "JetBrains Mono", monospace';
    const w = ctx.measureText(tl).width + 12, lx = Math.max(0, Math.min(F.plotW - w, cx - w / 2));
    ctx.fillStyle = C.dim; ctx.fillRect(lx, this.H - F.timeH + 2, w, F.timeH - 4);
    ctx.fillStyle = INK; ctx.textBaseline = 'middle'; ctx.fillText(tl, lx + 6, this.H - F.timeH / 2);
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
    cv.addEventListener('wheel', (e) => {
      if (!this.frame) return;
      e.preventDefault();
      const p = pos(e), F = this.layout();
      if (e.ctrlKey || this.where(p) === 'price') {
        this.yAuto = false;
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
        this.offset = this.clampOffset(this.offset + (now - anchor), F);
      }
      this.draw();
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      if (!this.frame || !this.frame.bars) return;
      const p = pos(e);
      if (e.button !== 0) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* a pointer the page did not see start */ }
      const zone = this.where(p);
      if (zone === 'price') { this.yAuto = false; this.drag = { kind: 'yscale', y: p.y, lo: this.yLo, hi: this.yHi }; return; }
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
        else this.offset = this.clampOffset(d.offset + (p.x - d.x) / this.barPx, F);
        if (Math.abs(p.y - d.y) > 3 || !d.auto) {
          this.yAuto = false;
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
