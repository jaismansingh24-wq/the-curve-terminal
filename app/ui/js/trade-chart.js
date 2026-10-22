/* An entry's trade drawn on the reader's own Replay file, when one covers
   its time: the prices around it, the entry, partial exits and exit, the
   initial stop and planned exit, and how far the price went against the
   position (MAE) and in its favour (MFE) while it was open.

   Only the reader's own files are used, read from the app's folder; nothing
   is fetched. A file is used when it is for the same index (a micro trade
   is drawn on its mini's prices, which differ a little print by print), it
   covers the trade's time, and the prices it traded around the entry and
   the exit include the ones typed. If they do not, the file is likely
   another contract month, or its time zone was read differently, and the
   page says so instead of drawing.

   MAE and MFE are measured from the entry price, in points, over the time
   the trade was open: to the second when the entry's times have seconds,
   otherwise across the whole entry and exit minutes, which can count a
   little before the entry or after the exit. From a file of one-minute
   bars, always across whole minutes. */

import * as R from './replay-data.js';
import { get as instrument, formatPrice } from './instruments.js';
import { el } from './format.js';
import { timeBoth, shortDateET, ET } from './time.js';

const FAMILY = { MES: 'ES', MNQ: 'NQ', MYM: 'YM', M2K: 'RTY', MCL: 'CL', MGC: 'GC', SIL: 'SI' };
const family = (code) => FAMILY[code] || code;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* files read so far, newest use last; at most two are kept in memory */
const loaded = new Map();
function load(id) {
  if (loaded.has(id)) { const p = loaded.get(id); loaded.delete(id); loaded.set(id, p); return p; }
  const p = R.open(id);
  loaded.set(id, p);
  p.catch(() => loaded.delete(id));
  while (loaded.size > 2) loaded.delete(loaded.keys().next().value);
  return p;
}

/* the file to draw a trade on: trades before bars, then the newest */
async function sourceFor(e, entryMs, exitMs) {
  await R.loadIndex().catch(() => []);
  const a = Math.floor(entryMs / 60000), b = Math.floor(exitMs / 60000);
  const fam = family(e.instrument);
  const fits = R.files().filter((f) => family(f.instrument) === fam && f.first <= a && f.last >= b);
  fits.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'trades' ? -1 : 1));
  return fits[0] || null;
}

const toSec = (ms) => Math.floor(ms / 1000);
const hasSeconds = (iso) => { const ms = Date.parse(iso); return Number.isFinite(ms) && ms % 60000 !== 0; };

/* prices traded (lowest and highest, in ticks) over [a, b] in ms */
function rangeIn(d, a, b) {
  let lo = Infinity, hi = -Infinity, iLo = -1, iHi = -1;
  if (d.kind === 'trades') {
    const i0 = R.lowerBound(d.t, d.n, toSec(a)), i1 = R.lowerBound(d.t, d.n, toSec(b) + 1);
    for (let i = i0; i < i1; i++) { const p = d.p[i]; if (p < lo) { lo = p; iLo = i; } if (p > hi) { hi = p; iHi = i; } }
    return { lo, hi, tLo: iLo >= 0 ? d.t[iLo] * 1000 : null, tHi: iHi >= 0 ? d.t[iHi] * 1000 : null };
  }
  const i0 = R.lowerBound(d.t, d.n, Math.floor(a / 60000)), i1 = R.lowerBound(d.t, d.n, Math.floor(b / 60000) + 1);
  for (let i = i0; i < i1; i++) { if (d.l[i] < lo) { lo = d.l[i]; iLo = i; } if (d.h[i] > hi) { hi = d.h[i]; iHi = i; } }
  return { lo, hi, tLo: iLo >= 0 ? d.t[iLo] * 60000 : null, tHi: iHi >= 0 ? d.t[iHi] * 60000 : null };
}

/* bars for the chart over [a, b] ms: about 60 to 160 of them, of a round
   number of seconds (from trades) or minutes (from bars) */
function barsIn(d, a, b) {
  const span = (b - a) / 1000;
  const out = [];
  if (d.kind === 'trades') {
    const step = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800].find((s) => span / s <= 160) || 3600;
    const i0 = R.lowerBound(d.t, d.n, toSec(a)), i1 = R.lowerBound(d.t, d.n, toSec(b) + 1);
    let cur = null;
    for (let i = i0; i < i1; i++) {
      const k = Math.floor(d.t[i] / step), p = d.p[i];
      if (!cur || cur.k !== k) { cur = { k, t: k * step * 1000, o: p, h: p, l: p, c: p }; out.push(cur); }
      if (p > cur.h) cur.h = p; if (p < cur.l) cur.l = p; cur.c = p;
    }
    return { bars: out, step: step * 1000 };
  }
  const base = d.base || 1;
  const step = [1, 2, 5, 10, 15, 30, 60].find((m) => m >= base && span / 60 / m <= 160) || 120;
  const i0 = R.lowerBound(d.t, d.n, Math.floor(a / 60000)), i1 = R.lowerBound(d.t, d.n, Math.floor(b / 60000) + 1);
  let cur = null;
  for (let i = i0; i < i1; i++) {
    const k = Math.floor(d.t[i] / step);
    if (!cur || cur.k !== k) { cur = { k, t: k * step * 60000, o: d.o[i], h: d.h[i], l: d.l[i], c: d.c[i] }; out.push(cur); }
    if (d.h[i] > cur.h) cur.h = d.h[i]; if (d.l[i] < cur.l) cur.l = d.l[i]; cur.c = d.c[i];
  }
  return { bars: out, step: step * 60000 };
}

/* ------------------------------------------------------------ the measure */

/* Everything the page shows, or { why } when the file cannot be used. */
export async function study(e) {
  const ins = instrument(e.instrument);
  const entryMs = Date.parse(e.entryAt), exitMs = e.exitAt ? Date.parse(e.exitAt) : null;
  if (!ins || !Number.isFinite(entryMs)) return { why: 'none' };
  if (!exitMs) return { why: 'noexit' };
  const f = await sourceFor(e, entryMs, exitMs);
  if (!f) return { why: 'nofile', entryMs, exitMs };
  const d = await load(f.id);
  const tick = d.tick;
  const T = (price) => Math.round(price / tick);
  const exact = d.kind === 'trades' && (hasSeconds(e.entryAt) || hasSeconds(e.exitAt));
  /* the time open: exact, or whole minutes */
  const openFrom = exact ? entryMs : Math.floor(entryMs / 60000) * 60000;
  const openTo = exact ? exitMs : Math.floor(exitMs / 60000) * 60000 + 59999;
  /* do the file's prices around the entry and exit include the ones typed? */
  const near = (ms, price) => {
    const r = rangeIn(d, Math.floor(ms / 60000) * 60000 - 60000, Math.floor(ms / 60000) * 60000 + 119999);
    return Number.isFinite(r.lo) && T(price) >= r.lo - 2 && T(price) <= r.hi + 2;
  };
  if (!near(entryMs, e.entryPrice) || !near(exitMs, e.exitPrice)) return { why: 'mismatch', file: f, entryMs, exitMs };
  const open = rangeIn(d, openFrom, openTo);
  const long = e.direction !== 'short';
  const entryT = T(e.entryPrice);
  const pts = (ticks) => Math.max(0, ticks) * tick;
  const mae = long ? pts(entryT - open.lo) : pts(open.hi - entryT);
  const mfe = long ? pts(open.hi - entryT) : pts(entryT - open.lo);
  /* what the chart shows: some time either side of the trade */
  const hold = Math.max(60000, exitMs - entryMs);
  const pad = Math.min(90 * 60000, Math.max(10 * 60000, hold * 0.6));
  const firstMs = (d.kind === 'trades' ? d.t[0] * 1000 : d.t[0] * 60000), lastMs = (d.kind === 'trades' ? d.t[d.n - 1] * 1000 : d.t[d.n - 1] * 60000 + 59999);
  const from = Math.max(firstMs, entryMs - pad), to = Math.min(lastMs, exitMs + pad);
  const { bars, step } = barsIn(d, from, to);
  return {
    file: f, kind: d.kind, tick, exact, ins, long, bars, step, from, to, entryMs, exitMs,
    mae: round(mae, ins.decimals), mfe: round(mfe, ins.decimals),
    maeAt: long ? open.tLo : open.tHi, mfeAt: long ? open.tHi : open.tLo,
    maePrice: (long ? open.lo : open.hi) * tick, mfePrice: (long ? open.hi : open.lo) * tick,
    sameFamily: family(e.instrument) !== e.instrument,
  };
}
const round = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

/* ------------------------------------------------------------ drawing */

const SEC = new Intl.DateTimeFormat('en-GB', { timeZone: ET, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const MIN = new Intl.DateTimeFormat('en-GB', { timeZone: ET, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const clockET = (ms, seconds = false) => (seconds ? SEC : MIN).format(new Date(ms));
const NICE_MS = [5e3, 10e3, 15e3, 30e3, 60e3, 120e3, 300e3, 600e3, 900e3, 1800e3, 3600e3, 7200e3];
const NICE_P = [1, 2, 2.5, 5];

export function drawChart(host, e, S) {
  const cv = document.createElement('canvas');
  cv.className = 'tchart__canvas';
  cv.setAttribute('role', 'img');
  const side = (buy) => (buy ? 'bought' : 'sold');
  cv.setAttribute('aria-label', e.instrument + ' ' + e.direction + ': ' + side(S.long) + ' ' + formatPrice(e.instrument, e.entryPrice) + ' at ' + clockET(S.entryMs, S.exact) + ' ET, ' + side(!S.long) + ' ' + formatPrice(e.instrument, e.exitPrice) + ' at ' + clockET(S.exitMs, S.exact) + ' ET. Against the position at most ' + S.mae + ' points, in its favour at most ' + S.mfe + ' points.');
  host.replaceChildren(cv);
  const ctx = cv.getContext('2d');
  let mouse = null;
  const C = { text: css('--text') || '#edeff2', dim: css('--text-dim') || '#98a0aa', faint: css('--text-faint') || '#6b727c', buy: css('--bid'), sell: css('--ask') };
  const tick = S.tick, dec = S.ins.decimals;
  /* the price range: the bars, the fills, the stop and the planned exit */
  let lo = Infinity, hi = -Infinity;
  for (const b of S.bars) { lo = Math.min(lo, b.l * tick); hi = Math.max(hi, b.h * tick); }
  for (const p of [e.entryPrice, e.exitPrice, e.stop, e.plannedExit, ...(e.partials || []).map((x) => x.price)]) if (Number.isFinite(p)) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
  const padP = Math.max((hi - lo) * 0.08, tick * 4);
  lo -= padP; hi += padP;
  const fills = [
    { at: S.entryMs, price: e.entryPrice, buy: S.long, label: 'Entry' },
    ...(e.partials || []).filter((x) => Number.isFinite(x.price) && x.at && Number.isFinite(Date.parse(x.at))).map((x) => ({ at: Date.parse(x.at), price: x.price, buy: !S.long, label: 'Partial exit' })),
    { at: S.exitMs, price: e.exitPrice, buy: !S.long, label: 'Exit' },
  ];

  function draw() {
    const W = Math.max(280, Math.floor(host.getBoundingClientRect().width)), H = 300;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const axisR = 74, axisB = 22, top = 10, plotW = W - axisR, plotH = H - axisB - top;
    const X = (ms) => ((ms - S.from) / (S.to - S.from)) * plotW;
    const Y = (p) => top + (1 - (p - lo) / (hi - lo)) * plotH;
    ctx.font = '10.5px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    /* the price grid */
    const rawStep = (hi - lo) / 6;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const pStep = Math.max(tick, (NICE_P.find((k) => k * mag >= rawStep) || 10) * mag);
    for (let p = Math.ceil(lo / pStep) * pStep; p <= hi; p += pStep) {
      const y = Math.round(Y(p)) + 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, y, plotW, 1);
      ctx.fillStyle = C.faint; ctx.fillText(formatPrice(e.instrument, round(p, dec)), plotW + 8, y);
    }
    /* the time the trade was open */
    const x0 = X(S.entryMs), x1 = X(S.exitMs);
    ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fillRect(x0, top, Math.max(1, x1 - x0), plotH);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(Math.round(x0), top, 1, plotH); ctx.fillRect(Math.round(x1), top, 1, plotH);
    /* the bars, in greys: light up, dim down */
    const bw = Math.max(1, Math.min(14, (plotW * S.step) / (S.to - S.from) * 0.66));
    for (const b of S.bars) {
      const cx = X(b.t + S.step / 2);
      if (cx < -bw || cx > plotW + bw) continue;
      const up = b.c >= b.o, col = up ? 'rgba(237,239,242,0.82)' : 'rgba(152,160,170,0.5)';
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(cx), Y(b.h * tick), 1, Math.max(1, Y(b.l * tick) - Y(b.h * tick)));
      const yo = Y(b.o * tick), yc = Y(b.c * tick);
      ctx.fillRect(Math.round(cx - bw / 2), Math.min(yo, yc), Math.max(1, Math.round(bw)), Math.max(1, Math.abs(yc - yo)));
    }
    /* the plan: initial stop and planned exit, across the trade and on */
    const level = (p, label) => {
      if (!Number.isFinite(p)) return;
      const y = Math.round(Y(p)) + 0.5;
      ctx.strokeStyle = C.dim; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(plotW, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.dim; ctx.textAlign = 'right'; ctx.fillText(label + ' ' + formatPrice(e.instrument, p), plotW - 4, y - 7); ctx.textAlign = 'left';
    };
    level(e.stop, 'Initial stop');
    level(e.plannedExit, 'Planned exit');
    /* the fills joined, then each as a dot: buys in the bid colour, sells in the ask colour */
    ctx.strokeStyle = 'rgba(237,239,242,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); fills.forEach((f, i) => { const x = X(f.at), y = Y(f.price); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
    for (const f of fills) {
      const x = X(f.at), y = Y(f.price);
      ctx.fillStyle = f.buy ? C.buy : C.sell;
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0a0c10'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = C.text;
      const label = f.label + ' ' + formatPrice(e.instrument, f.price);
      const w = ctx.measureText(label).width;
      const lx = x + 8 + w > plotW ? x - 8 - w : x + 8;
      ctx.fillText(label, lx, y + (f.label === 'Entry' ? (S.long ? 12 : -12) : (S.long ? -12 : 12)));
    }
    /* the worst and best prices while open, as rings */
    const ring = (at, p, label) => {
      if (!Number.isFinite(at)) return;
      const x = X(at), y = Y(p);
      ctx.strokeStyle = C.dim; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = C.dim;
      const w = ctx.measureText(label).width;
      ctx.fillText(label, x + 10 + w > plotW ? x - 10 - w : x + 10, y);
    };
    if (S.mae > 0) ring(S.maeAt, S.maePrice, 'MAE');
    if (S.mfe > 0) ring(S.mfeAt, S.mfePrice, 'MFE');
    /* the time axis, New York time */
    ctx.fillStyle = C.faint; ctx.textBaseline = 'alphabetic';
    const tStep = NICE_MS.find((s) => (plotW * s) / (S.to - S.from) >= 70) || 14400e3;
    for (let t = Math.ceil(S.from / tStep) * tStep; t <= S.to; t += tStep) {
      const x = X(t);
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(Math.round(x), top + plotH, 1, 4);
      ctx.fillStyle = C.faint;
      const lab = clockET(t, tStep < 60e3);
      const w = ctx.measureText(lab).width;
      if (x - w / 2 > 0 && x + w / 2 < plotW) ctx.fillText(lab, x - w / 2, H - 6);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, top + plotH, plotW, 1); ctx.fillRect(plotW, top, 1, plotH);
    /* under the pointer: the bar's time and prices */
    if (mouse && mouse.x < plotW) {
      const t = S.from + (mouse.x / plotW) * (S.to - S.from);
      const b = S.bars.reduce((best, x) => (Math.abs(x.t + S.step / 2 - t) < Math.abs(best.t + S.step / 2 - t) ? x : best), S.bars[0]);
      if (b) {
        const x = Math.round(X(b.t + S.step / 2)) + 0.5;
        ctx.strokeStyle = 'rgba(237,239,242,0.35)'; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotH); ctx.stroke(); ctx.setLineDash([]);
        const f = (v) => formatPrice(e.instrument, v * tick);
        const tag = clockET(b.t, S.step < 60e3) + ' ET  O ' + f(b.o) + '  H ' + f(b.h) + '  L ' + f(b.l) + '  C ' + f(b.c);
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(tag).width + 12;
        const tx = Math.max(0, Math.min(plotW - w, x - w / 2));
        ctx.fillStyle = 'rgba(14,17,22,0.92)'; ctx.fillRect(tx, top, w, 20);
        ctx.fillStyle = C.text; ctx.fillText(tag, tx + 6, top + 10);
      }
    }
  }
  cv.addEventListener('mousemove', (ev) => { const r = cv.getBoundingClientRect(); mouse = { x: ev.clientX - r.left, y: ev.clientY - r.top }; draw(); });
  cv.addEventListener('mouseleave', () => { mouse = null; draw(); });
  const ro = new ResizeObserver(() => { if (!host.isConnected) { ro.disconnect(); return; } draw(); });
  ro.observe(host);
  draw();
}

/* ------------------------------------------------------------ the section */

/* A section for an entry's page: filled in when the file has been read.
   `alive` says whether the page still shows this entry; `keep` saves MAE
   and MFE to the entry. */
export function section(e, { alive, keep }) {
  const sec = el('section', 'dgroup dchart glass glass--quiet');
  sec.appendChild(el('h2', 'kicker', 'The trade, on your Replay file'));
  const body = el('div', 'dchart__body');
  body.appendChild(el('p', 'note', 'Looking for one of your Replay files that covers this trade.'));
  sec.appendChild(body);
  sec.setAttribute('aria-busy', 'true');
  study(e).then((S) => {
    if (!alive()) return;
    sec.removeAttribute('aria-busy');
    body.replaceChildren();
    if (S.why) {
      const when = S.entryMs ? e.instrument + ', ' + shortDateET(S.entryMs) + ', ' + clockET(S.entryMs) + ' to ' + clockET(S.exitMs) + ' ET' : '';
      const say = {
        none: 'There is nothing to draw: the entry has no instrument or entry time that can be read.',
        noexit: 'There is no exit time on this entry, so the trade cannot be placed on a file.',
        nofile: 'None of your Replay files covers this trade (' + when + '). Replay, under Practice, keeps exports of trades or one-minute bars you load; any that covers a trade\'s time draws it here, with its MAE and MFE.',
        mismatch: S.file ? 'Your Replay file ' + S.file.name + ' covers this time, but the prices it traded around the entry or the exit do not include the ones on this entry. It is likely another contract month, or its times were read in another zone. Nothing is drawn from it.' : '',
      }[S.why];
      body.appendChild(el('p', 'note', say));
      /* nothing drawn: a short note at the foot of the page instead of the top */
      sec.classList.add('dchart--empty');
      if (sec.parentNode) sec.parentNode.appendChild(sec);
      return;
    }
    const host = el('div', 'tchart');
    body.appendChild(host);
    drawChart(host, e, S);
    const imported = S.file.importedAt ? ', loaded ' + new Date(S.file.importedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    body.appendChild(el('p', 'note dchart__src', 'From your Replay file ' + S.file.name + ' (' + (S.kind === 'trades' ? 'trades' : 'one-minute bars') + imported + '), in ' + (S.step < 60000 ? S.step / 1000 + '-second' : S.step / 60000 + '-minute') + ' bars, New York time.' + (S.sameFamily ? ' Drawn on ' + S.file.instrument + ' prices: ' + e.instrument + ' trades at nearly the same prices, but its own prints differ a little.' : '') + ' Buys are dots in the bid colour, sells in the ask colour; rings mark the worst (MAE) and best (MFE) prices while the trade was open.'));
    const dl = el('dl');
    const row = (k, v, sub) => { const r = el('div', 'row'); r.append(el('dt', '', k)); const dd = el('dd', 'num', v); if (sub) dd.appendChild(el('span', 'sub', sub)); r.appendChild(dd); dl.appendChild(r); };
    const at = (ms, p) => (Number.isFinite(ms) ? 'at ' + formatPrice(e.instrument, p) + ', ' + (S.kind === 'trades' ? clockET(ms, true) + ' ET' : 'in the minute from ' + timeBoth(ms)) : '');
    const typed = (v) => (Number.isFinite(v) ? 'You typed ' + v + ' points.' : 'Not typed on the entry.');
    row('Against you (MAE)', S.mae + ' points', at(S.maeAt, S.maePrice) + '. ' + typed(e.mae));
    row('In your favour (MFE)', S.mfe + ' points', at(S.mfeAt, S.mfePrice) + '. ' + typed(e.mfe));
    body.appendChild(dl);
    body.appendChild(el('p', 'note dchart__how', 'Measured from the entry price over the time the trade was open, ' + (S.exact ? 'to the second, as the entry\'s times are recorded.' : S.kind === 'trades' ? 'across the whole entry and exit minutes, as the entry\'s times are to the minute; that can count a little before the entry or after the exit.' : 'across whole minutes, as the file holds one-minute bars; that can count a little before the entry or after the exit.') + ' With partial exits, it runs to the final exit.'));
    if (e.mae !== S.mae || e.mfe !== S.mfe) {
      const b = el('button', 'btn btn--sm', Number.isFinite(e.mae) || Number.isFinite(e.mfe) ? 'Use these on the entry instead' : 'Keep these on the entry');
      b.type = 'button';
      b.addEventListener('click', () => { b.disabled = true; keep(S.mae, S.mfe); });
      body.appendChild(b);
    }
  }).catch((err) => {
    if (!alive()) return;
    sec.removeAttribute('aria-busy');
    body.replaceChildren(el('p', 'note', 'The Replay file could not be read: ' + String(err && err.message ? err.message : err)));
  });
  return sec;
}
