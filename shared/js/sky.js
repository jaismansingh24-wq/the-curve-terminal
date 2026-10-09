/* The night sky, the optional background. The same sky as thecurve.in, from
   the same seed: the galaxy band with its dust lane, the stars, the bright
   few with four-point spikes, tonight's moon in its real phase (worked out
   here, nothing fetched) and a hidden constellation that draws the mark.

   The still sky is one SVG set as a CSS custom property through the CSSOM.
   SkyMotion adds what moves on a canvas over it: slow glints, the odd
   shooting star, and the constellation joining up for anyone who sits still.
   Greys only. With reduced motion, only the still sky is shown. */

import { rng } from './mark.js';

let SKY = null;

export function skyData() {
  if (SKY) return SKY;
  const r = rng(2026);
  const W = 1920, H = 1080, ang = -0.42, ca = Math.cos(ang), sa = Math.sin(ang), x0 = -120, y0 = 1010, len = 2300;
  const deg = (ang * 180 / Math.PI).toFixed(1), f = (v) => v.toFixed(1);
  const along = (t, off) => [x0 + ca * len * t - sa * off, y0 + sa * len * t + ca * off];
  const ell = (p, rx, ry, op) =>
    '<ellipse cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" opacity="' + op.toFixed(3) +
    '" transform="rotate(' + deg + ' ' + f(p[0]) + ' ' + f(p[1]) + ')"/>';
  let haze = '', core = '', dust = '', stars = '', bright = '';
  const B = [];

  /* the band of the galaxy, brightest a little past the middle */
  for (let i = 0; i < 16; i++) {
    const t = i / 15, k = Math.exp(-Math.pow((t - 0.6) / 0.18, 2));
    haze += ell(along(t, (r() - 0.5) * 70), 220 + r() * 240, 60 + r() * 60 + k * 70, 0.018 + k * 0.03 + r() * 0.01);
  }
  core = ell(along(0.6, 0), 280, 120, 0.04) + ell(along(0.64, 12), 170, 80, 0.035);
  /* the dark lane of dust down its middle */
  for (let i = 0; i < 7; i++) { const t = 0.22 + i * 0.09; dust += ell(along(t, 6 + (r() - 0.5) * 16), 260 + r() * 140, 22 + r() * 16, 0.22); }
  for (let i = 0; i < 640; i++) {
    const x = r() * W, y = r() * H, dx = x - x0, dy = y - y0, off = Math.abs(-dx * sa + dy * ca);
    if (r() > 0.28 + 0.72 * Math.exp(-Math.pow(off / 190, 2))) continue;
    const rad = 0.45 + Math.pow(r(), 3) * 1.25;
    stars += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + rad.toFixed(2) + '" opacity="' + (0.22 + r() * 0.6).toFixed(2) +
             '" fill="' + (r() < 0.2 ? '#dbe3ff' : '#ffffff') + '"/>';
  }
  /* the brightest few, with the four-point spikes a telescope gives them */
  for (let i = 0; i < 11; i++) {
    const bx = 40 + r() * (W - 80), by = 30 + r() * (H - 60), s = 0.6 + r() * 0.8, L = 9 + 15 * s, w = 0.7, eight = r() < 0.3;
    B.push({ x: bx, y: by, s, ph: r() * 6.283, sp: 0.6 + r() * 0.9 });
    bright += '<circle cx="' + f(bx) + '" cy="' + f(by) + '" r="' + f(4.5 * s) + '" opacity="0.14" filter="url(#b)"/>' +
      '<path opacity="0.42" d="M' + f(bx - L) + ' ' + f(by) + 'L' + f(bx) + ' ' + f(by - w) + 'L' + f(bx + L) + ' ' + f(by) + 'L' + f(bx) + ' ' + f(by + w) + 'Z' +
      'M' + f(bx) + ' ' + f(by - L) + 'L' + f(bx + w) + ' ' + f(by) + 'L' + f(bx) + ' ' + f(by + L) + 'L' + f(bx - w) + ' ' + f(by) + 'Z"/>' +
      (eight ? '<path opacity="0.3" transform="rotate(45 ' + f(bx) + ' ' + f(by) + ')" d="M' + f(bx - L * 0.45) + ' ' + f(by) + 'L' + f(bx) + ' ' + f(by - w) + 'L' + f(bx + L * 0.45) + ' ' + f(by) + 'L' + f(bx) + ' ' + f(by + w) + 'Z"/>' : '') +
      '<circle cx="' + f(bx) + '" cy="' + f(by) + '" r="' + f(1.5 * s) + '"/>';
  }

  /* the hidden constellation: brighter stars along the curve of the mark,
     ending in the node */
  const CON = [];
  let con = '';
  const segs = [[[5, 19], [8.5, 18.4], [11, 15.6], [13.2, 11.6]], [[13.2, 11.6], [15.4, 7.6], [17.8, 5.9], [21, 5.5]]];
  const at = [[0, 0], [0, 0.45], [0, 0.85], [1, 0.25], [1, 0.6], [1, 1]];
  at.forEach((q, i) => {
    const g = segs[q[0]], t = q[1], u = 1 - t;
    const x = u * u * u * g[0][0] + 3 * u * u * t * g[1][0] + 3 * u * t * t * g[2][0] + t * t * t * g[3][0];
    const y = u * u * u * g[0][1] + 3 * u * u * t * g[1][1] + 3 * u * t * t * g[2][1] + t * t * t * g[3][1];
    const px = 200 + x * 15, py = 520 + y * 15, last = i === at.length - 1;
    CON.push([px, py]);
    con += '<circle cx="' + f(px) + '" cy="' + f(py) + '" r="' + (last ? 2.4 : 1.5 + (i % 2) * 0.3).toFixed(2) + '" opacity="' + (last ? 0.95 : 0.8) + '"/>';
    if (last) con += '<circle cx="' + f(px) + '" cy="' + f(py) + '" r="6" opacity="0.16" filter="url(#b)"/>';
  });

  /* the moon in tonight's phase: its age from a known new moon over the mean
     synodic month, lit on the right while it waxes (northern hemisphere) */
  let moon = '';
  {
    const SYN = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14) / 864e5;
    const ph = ((((Date.now() / 864e5 - ref) % SYN) + SYN) % SYN) / SYN, k = Math.cos(2 * Math.PI * ph);
    const lit = (1 - k) / 2, cx = 1590, cy = 168, R = 34, rx = Math.abs(k) * R, wax = ph < 0.5;
    const edge = 'M' + cx + ' ' + (cy - R) + 'A' + R + ' ' + R + ' 0 0 ' + (wax ? 1 : 0) + ' ' + cx + ' ' + (cy + R);
    const term = 'A' + f(rx) + ' ' + R + ' 0 0 ' + (wax ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0)) + ' ' + cx + ' ' + (cy - R) + 'Z';
    moon = '<circle cx="' + cx + '" cy="' + cy + '" r="' + f(R * 2.6) + '" fill="#dfe3ea" opacity="' + (0.03 + 0.07 * lit).toFixed(3) + '" filter="url(#m)"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="#171a21"/>' +
      (lit > 0.015 ? '<clipPath id="mc"><path d="' + edge + term + '"/></clipPath>' +
        '<path d="' + edge + term + '" fill="#d9dde4" opacity="0.9"/>' +
        '<g clip-path="url(#mc)" fill="#8f96a1" opacity="0.32"><ellipse cx="' + (cx - 9) + '" cy="' + (cy - 8) + '" rx="9" ry="7"/>' +
        '<ellipse cx="' + (cx + 8) + '" cy="' + (cy + 4) + '" rx="7" ry="9"/><ellipse cx="' + (cx - 4) + '" cy="' + (cy + 14) + '" rx="6" ry="4"/>' +
        '<circle cx="' + (cx + 14) + '" cy="' + (cy - 14) + '" r="3"/></g>' : '');
  }

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">' +
    '<defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="55"/></filter>' +
    '<filter id="l" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>' +
    '<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter>' +
    '<filter id="m" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter></defs>' +
    '<rect width="1920" height="1080" fill="#0a0c10"/>' +
    '<g fill="#d2d5db" filter="url(#g)">' + haze + '</g>' +
    '<g fill="#dcdcdc" filter="url(#g)">' + core + '</g>' +
    '<g fill="#0a0c10" filter="url(#l)">' + dust + '</g>' +
    '<g>' + stars + '</g><g fill="#ffffff">' + bright + con + '</g>' + moon + '</svg>';

  SKY = { url: 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")', bright: B, con: CON };
  return SKY;
}

/* set the still sky on <html>, or take it away */
export function applySky(on) {
  const d = document.documentElement;
  if (on) d.style.setProperty('--sky', skyData().url);
  else d.style.removeProperty('--sky');
}

/* ----------------------------------------------------------- what moves */

export class SkyMotion {
  constructor() {
    this.cv = null; this.ctx = null; this.raf = 0;
    this.W = 0; this.H = 0; this.dpr = 1; this.last = 0;
    this.meteors = true;
    this.still = Date.now();
    this.frame = this.frame.bind(this);
    this.size = this.size.bind(this);
    this.onVis = this.onVis.bind(this);
    this.onMove = () => { this.still = Date.now(); };
  }

  start() {
    if (this.cv) return;
    const cv = document.createElement('canvas');
    cv.className = 'sky-motion';
    cv.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(cv, document.body.firstChild);
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.size();
    window.addEventListener('resize', this.size);
    document.addEventListener('visibilitychange', this.onVis);
    ['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach((e) => window.addEventListener(e, this.onMove, { passive: true }));
    this.last = 0;
    if (!document.hidden) this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this.size);
    document.removeEventListener('visibilitychange', this.onVis);
    ['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach((e) => window.removeEventListener(e, this.onMove));
    if (this.cv) this.cv.remove();
    this.cv = this.ctx = null;
  }

  onVis() {
    if (!this.cv) return;
    if (document.hidden) { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
    else if (!this.raf) { this.last = 0; this.raf = requestAnimationFrame(this.frame); }
  }

  size() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.last = 0;
  }

  /* where a point of the 1920x1080 sky lands, as the background covers the window */
  map(x, y) {
    const k = Math.max(this.W / 1920, this.H / 1080);
    return [this.W / 2 + (x - 960) * k, this.H / 2 + (y - 540) * k, k];
  }

  spikes(x, y, L, w, a) {
    const c = this.ctx;
    c.globalAlpha = a;
    c.beginPath();
    c.moveTo(x - L, y); c.lineTo(x, y - w); c.lineTo(x + L, y); c.lineTo(x, y + w); c.closePath();
    c.moveTo(x, y - L); c.lineTo(x + w, y); c.lineTo(x, y + L); c.lineTo(x - w, y); c.closePath();
    c.fill();
  }

  glints(t) {
    const c = this.ctx;
    c.fillStyle = '#ffffff';
    skyData().bright.forEach((b) => {
      const g = 0.5 + 0.5 * Math.sin(t * b.sp + b.ph), p = this.map(b.x, b.y), k = p[2];
      const pulse = Math.pow(g, 4);
      if (pulse < 0.02) return;
      this.spikes(p[0], p[1], (9 + 15 * b.s) * k * (1 + 0.6 * pulse), 0.85 * k, 0.4 * pulse);
      c.globalAlpha = 0.5 * pulse;
      c.beginPath(); c.arc(p[0], p[1], 2.1 * b.s * k, 0, Math.PI * 2); c.fill();
    });
    c.globalAlpha = 1;
  }

  /* each 6 second slot of the clock may hold one shooting star */
  meteor(slot) {
    const r = rng(slot * 7919 + 13);
    const rr = (a, b) => a + (b - a) * r();
    if (r() > 0.55) return null;
    const right = r() < 0.5, ang = right ? rr(0.32, 0.62) : Math.PI - rr(0.32, 0.62);
    return { t0: slot * 6 + r() * 3.5, dur: rr(0.75, 1.15), x: rr(0.12, 0.92), y: rr(0.04, 0.42), ang, speed: rr(0.65, 1.0), tail: rr(0.11, 0.2) };
  }

  drawMeteor(m, t) {
    const c = this.ctx, age = t - m.t0;
    if (age < 0 || age > m.dur) return;
    const span = Math.max(this.W, this.H), v = m.speed * span, len = m.tail * span;
    const dx = Math.cos(m.ang), dy = Math.sin(m.ang);
    const hx = m.x * this.W + dx * v * age, hy = m.y * this.H + dy * v * age;
    const env = Math.min(1, age / 0.12) * Math.min(1, (m.dur - age) / 0.4);
    for (let i = 0; i < 16; i++) {
      const a0 = i / 16, a1 = (i + 1) / 16;
      c.globalAlpha = env * 0.8 * Math.pow(1 - a0, 1.6);
      c.lineWidth = 2.2 * (1 - a0) + 0.3;
      c.beginPath();
      c.moveTo(hx - dx * len * a0, hy - dy * len * a0);
      c.lineTo(hx - dx * len * a1, hy - dy * len * a1);
      c.stroke();
    }
    c.globalAlpha = env * 0.3;
    c.beginPath(); c.arc(hx, hy, 4.5, 0, Math.PI * 2); c.fill();
    c.globalAlpha = env;
    c.beginPath(); c.arc(hx, hy, 1.6, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  }

  /* after twenty seconds of stillness, faint lines join the hidden stars */
  constellation() {
    const a = Math.min(1, Math.max(0, (Date.now() - this.still - 20000) / 5000));
    if (!a) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = 0.38 * a;
    c.strokeStyle = '#e9edf4'; c.lineWidth = 1; c.setLineDash([3, 5]);
    c.beginPath();
    skyData().con.forEach((q, i) => { const p = this.map(q[0], q[1]); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
    c.stroke();
    c.restore();
  }

  frame(now) {
    this.raf = requestAnimationFrame(this.frame);
    const t = Date.now() / 1000, slot = Math.floor(t / 6);
    const ms = this.meteors ? [this.meteor(slot - 1), this.meteor(slot)].filter(Boolean) : [];
    const flying = ms.some((m) => t >= m.t0 && t <= m.t0 + m.dur);
    /* the glints are slow: a few frames a second is plenty unless a star is falling */
    if (!flying && now - this.last < 90) return;
    this.last = now;
    const c = this.ctx;
    c.clearRect(0, 0, this.W, this.H);
    this.glints(t);
    this.constellation();
    c.strokeStyle = '#eef1f8'; c.fillStyle = '#ffffff'; c.lineCap = 'round';
    ms.forEach((m) => this.drawMeteor(m, t));
  }
}
