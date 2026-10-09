/* The mark, for canvas. Geometry copied exactly from the emblem: a 64 unit
   box, outer ring r=30, inner ring r=24.5, two contract-month rules at x=24
   and x=40, three base ticks at y=50.5, the curve, and the node at (50, 14.5).
   Monochrome always: TEXT on INK. */

export const SEG = [
  [[14, 43], [21, 42], [25.5, 36], [29.5, 27.5]],
  [[29.5, 27.5], [33.5, 19], [40, 15.5], [50, 14.5]],
];
export const NODE = [50, 14.5];

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
export function eOut(t) { return 1 - Math.pow(1 - t, 3); }
export function eIn(t) { return t * t * t; }
export function eIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
/* a small pop with only a tiny overshoot: nothing bouncy */
export function ePop(t) { const c = 1.2; return t <= 0 ? 0 : 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

export function white(a) { return 'rgba(237,239,242,' + clamp(a, 0, 1).toFixed(3) + ')'; }

export function bez(g, t) {
  const u = 1 - t;
  return [
    u * u * u * g[0][0] + 3 * u * u * t * g[1][0] + 3 * u * t * t * g[2][0] + t * t * t * g[3][0],
    u * u * u * g[0][1] + 3 * u * u * t * g[1][1] + 3 * u * t * t * g[2][1] + t * t * t * g[3][1],
  ];
}
/* the derivative, for the normal at a point */
export function bezD(g, t) {
  const u = 1 - t;
  return [
    3 * u * u * (g[1][0] - g[0][0]) + 6 * u * t * (g[2][0] - g[1][0]) + 3 * t * t * (g[3][0] - g[2][0]),
    3 * u * u * (g[1][1] - g[0][1]) + 6 * u * t * (g[2][1] - g[1][1]) + 3 * t * t * (g[3][1] - g[2][1]),
  ];
}

/* The whole curve as one path, sampled by arc length, so a fraction f of the
   way along means the same distance whichever segment it falls in. */
const LUT = (() => {
  const pts = [];
  let len = 0, prev = null;
  for (let i = 0; i <= 400; i++) {
    const s = i < 200 ? 0 : 1, t = i < 200 ? i / 200 : (i - 200) / 200;
    const p = bez(SEG[s], i === 400 ? 1 : t);
    if (prev) len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    pts.push({ s, t: i === 400 ? 1 : t, len });
    prev = p;
  }
  pts.forEach((q) => { q.f = q.len / len; });
  return pts;
})();

/* a point a fraction f along the curve, with its unit normal, in 64-box units */
export function along(f) {
  f = clamp(f, 0, 1);
  let lo = 0, hi = LUT.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (LUT[mid].f < f) lo = mid; else hi = mid;
  }
  const a = LUT[lo], b = LUT[hi];
  const k = b.f === a.f ? 0 : (f - a.f) / (b.f - a.f);
  const q = a.s === b.s ? { s: a.s, t: lerp(a.t, b.t, k) } : (k < 0.5 ? a : b);
  const p = bez(SEG[q.s], q.t), d = bezD(SEG[q.s], q.t), n = Math.hypot(d[0], d[1]) || 1;
  return { x: p[0], y: p[1], nx: -d[1] / n, ny: d[0] / n };
}

/* from 64-box units to screen, for a mark of outer radius r centred at cx, cy */
export function toScreen(cx, cy, r, x, y) {
  const k = r / 30;
  return [cx + (x - 32) * k, cy + (y - 32) * k];
}

function line(ctx, x1, y1, x2, y2, color, lw) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
}
export function dot(ctx, x, y, r, color) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
}

/* o.ring: how much of the rings is drawn (0..1, clockwise from the top)
   o.detail: the inner ring, month rules and base ticks (dropped when small)
   o.curve: the curve's opacity; o.node: the node's scale; o.alpha: overall */
export function emblem(ctx, cx, cy, r, o) {
  const k = r / 30, a = o.alpha == null ? 1 : o.alpha;
  const P = (x, y) => toScreen(cx, cy, r, x, y);
  const lw = Math.max(0.8, k);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  if (o.ring > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * o.ring);
    ctx.strokeStyle = white(0.22 * a); ctx.lineWidth = lw; ctx.stroke();
    if (o.detail > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, 24.5 * k, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * o.ring);
      ctx.strokeStyle = white(0.10 * a * o.detail); ctx.lineWidth = lw; ctx.stroke();
    }
  }
  if (o.detail > 0 && o.ring > 0.55) {
    const f = seg(o.ring, 0.55, 1) * o.detail;
    [24, 40].forEach((x) => { const p = P(x, 16), q = P(x, 44); line(ctx, p[0], p[1], q[0], q[1], white(0.14 * a * f), lw); });
    [18, 28, 38].forEach((x) => { const p = P(x, 50.5), q = P(x + 4, 50.5); line(ctx, p[0], p[1], q[0], q[1], white(0.30 * a * f), lw); });
  }
  if (o.curve > 0) {
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const q = i <= 36 ? bez(SEG[0], i / 36) : bez(SEG[1], (i - 36) / 36);
      const p = P(q[0], q[1]);
      if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
    }
    ctx.strokeStyle = white(a * o.curve);
    ctx.lineWidth = o.width != null ? o.width : Math.max(1.6, 2.2 * k);
    ctx.stroke();
  }
  if (o.node > 0) {
    const n = P(NODE[0], NODE[1]);
    dot(ctx, n[0], n[1], Math.max(1.8, 3.1 * k) * o.node, white(a));
  }
  ctx.restore();
}

/* a bright star: a soft halo, a core, and four thin spikes */
export function star(ctx, x, y, b, size = 1) {
  if (b <= 0.01) return;
  const L = 12 * size * (0.6 + 0.4 * b), w = 1;
  dot(ctx, x, y, 8 * size * b, 'rgba(255,255,255,' + (0.14 * b).toFixed(3) + ')');
  ctx.fillStyle = 'rgba(255,255,255,' + (0.62 * b).toFixed(3) + ')';
  ctx.beginPath();
  ctx.moveTo(x - L, y); ctx.lineTo(x, y - w); ctx.lineTo(x + L, y); ctx.lineTo(x, y + w); ctx.closePath();
  ctx.moveTo(x, y - L); ctx.lineTo(x + w, y); ctx.lineTo(x, y + L); ctx.lineTo(x - w, y); ctx.closePath();
  ctx.fill();
  dot(ctx, x, y, 1.9 * size * (0.7 + 0.3 * b), 'rgba(255,255,255,' + b.toFixed(3) + ')');
}

/* a small seeded generator, so a sky can be the same every time */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
