/* The stats, worked out from the journal. Pure arithmetic on the entries:
   nothing is stored, so every figure follows the latest entries and settings.

   Rules the figures keep:
   - Net of costs by default; gross on request. A win is a trade closed in
     profit on that basis, a loss one closed at a loss; breakeven is neither.
   - Results are in the unit chosen (money, ticks or points per contract,
     or R). In R, only trades with an initial stop count, and each figure
     says how many that was.
   - Every figure carries its sample size. Estimates (rates, averages,
     ratios) give a range where one makes sense, and say "too few to say"
     below MIN trades instead of showing a number.
   - Simulations (streaks, chance) use a fixed seed made from the data, so
     the same journal always gives the same answer. */

import * as J from './journal.js';
import { tradingDay, weekOf, monthOf, etClock, wallToUtc, ET } from './time.js';
import { nearNews } from './news.js';

export const MIN = 10;          /* trades before an estimate is shown */
export const MIN_GROUP = 5;     /* trades in a group (time of day, weekday...) */
export const MIN_DAYS = 10;     /* trading days before a correlation is shown */
export const MIN_CHANCE = 20;   /* trades before the chance comparison */

/* ------------------------------------------------------------- helpers */

const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : null);
export function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function sd(a) {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}
/* the Wilson interval for a rate: honest at small samples and near 0 or 1 */
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
/* a 95% range for an average (normal approximation; shown from MIN trades) */
function meanRange(a) {
  if (a.length < 2) return null;
  const h = (1.96 * sd(a)) / Math.sqrt(a.length);
  return [mean(a) - h, mean(a) + h];
}
function pearson(x, y) {
  if (x.length < 3) return null;
  const mx = mean(x), my = mean(y);
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; }
  return b && c ? a / Math.sqrt(b * c) : null;
}
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pct(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))]; }

/* a trade's excursion (points per contract, as typed) in the chosen unit */
function excursion(t, pts, unit) {
  if (!Number.isFinite(pts)) return null;
  const { ins } = t.r, q = t.e.contracts;
  if (unit === 'ticks') return pts / ins.tick;
  if (unit === 'points') return pts;
  if (unit === 'r') return t.r.risk ? (pts * ins.point * q) / t.r.risk : null;
  return pts * ins.point * q;
}

/* ------------------------------------------------------------- the trades */

export function prepare(list, s) {
  return list.map((e) => {
    const r = J.result(e, s);
    if (!r) return null;
    const money = s.basis === 'gross' ? r.gross : r.net;
    return {
      e, r, money,
      v: J.inUnit(r, e, s.units, s.basis),
      R: r.risk ? money / r.risk : null,
      at: r.at, day: r.day,
      entryAt: Date.parse(e.entryAt),
      exitAt: e.exitAt ? Date.parse(e.exitAt) : null,
      win: money > 1e-9, loss: money < -1e-9,
    };
  }).filter(Boolean).sort((a, b) => a.at - b.at);
}

export function group(label, items) {
  const vals = items.filter((t) => t.v !== null).map((t) => t.v);
  const wins = items.filter((t) => t.win).length;
  return {
    label, n: items.length, nv: vals.length,
    total: sum(vals), avg: vals.length ? mean(vals) : null,
    win: items.length ? wins / items.length : null,
    tooFew: items.length < MIN_GROUP,
  };
}
const groupBy = (T, keyFn, order) => {
  const m = new Map();
  for (const t of T) for (const k of [].concat(keyFn(t) || [])) { if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
  const keys = order ? order.filter((k) => m.has(k)) : [...m.keys()].sort((a, b) => m.get(b).length - m.get(a).length);
  return keys.map((k) => group(k, m.get(k)));
};

/* ------------------------------------------------------------ all of it */

export function compute(T, s, extra = {}) {
  const vals = T.filter((t) => t.v !== null).map((t) => t.v);
  const n = T.length, nv = vals.length;
  const out = { n, nv, from: n ? T[0].at : null, to: n ? T[n - 1].at : null };

  /* --- results ----------------------------------------------------------- */
  const wins = T.filter((t) => t.win), losses = T.filter((t) => t.loss);
  const winVals = wins.filter((t) => t.v !== null).map((t) => t.v);
  const lossVals = losses.filter((t) => t.v !== null).map((t) => t.v);
  const grossAll = sum(T.map((t) => t.r.gross)), costsAll = sum(T.map((t) => t.r.costs));
  const avgWin = mean(winVals), avgLoss = mean(lossVals);
  const grossWins = sum(winVals), grossLosses = -sum(lossVals);
  const sortedDesc = vals.slice().sort((a, b) => b - a);
  const total = sum(vals);
  const Rs = T.filter((t) => t.R !== null).map((t) => t.R);
  const moneyAll = T.map((t) => t.money);

  out.results = {
    net: { v: total, n: nv },
    costsShare: { costs: costsAll, gross: grossAll, share: grossAll > 0 ? costsAll / grossAll : null, n },
    winRate: { k: wins.length, n, be: n - wins.length - losses.length, rate: n ? wins.length / n : null, range: wilson(wins.length, n), tooFew: n < MIN },
    avgWin: { v: avgWin, n: winVals.length },
    avgLoss: { v: avgLoss, n: lossVals.length },
    payoff: { v: avgWin !== null && avgLoss ? avgWin / Math.abs(avgLoss) : null, tooFew: n < MIN },
    expectancy: { v: mean(vals), range: meanRange(vals), money: mean(moneyAll), r: mean(Rs), nR: Rs.length, n: nv, tooFew: nv < MIN },
    profitFactor: { v: grossLosses > 0 ? grossWins / grossLosses : null, noLosses: grossLosses === 0 && grossWins > 0, wins: grossWins, losses: grossLosses, tooFew: n < MIN },
    median: { v: median(vals), avg: mean(vals), n: nv, tooFew: nv < MIN },
    withoutBest: [1, 3, 5].map((k) => ({ k, v: nv > k ? total - sum(sortedDesc.slice(0, k)) : null })),
  };

  /* --- risk and drawdown --------------------------------------------------- */
  let eq = 0, peak = 0, peakAt = T.length ? T[0].entryAt : null, maxDD = 0, ddPeakAt = null, ddTroughAt = null;
  let openDD = 0, openN = 0, under = null, longest = 0, recover = null;
  const curve = [];
  for (const t of T) {
    if (t.v === null) continue;
    const adverse = excursion(t, t.e.mae, s.units);
    if (adverse !== null) { openN++; openDD = Math.max(openDD, peak - (eq - Math.abs(adverse))); }
    eq += t.v;
    curve.push({ at: t.at, eq, peak: Math.max(peak, eq) });
    if (eq >= peak) {
      if (under !== null) { longest = Math.max(longest, t.at - under); if (ddPeakAt === under && recover === null) recover = t.at - ddTroughAt; }
      under = null; peak = eq; peakAt = t.at;
    } else {
      if (under === null) under = peakAt;
      if (peak - eq > maxDD) { maxDD = peak - eq; ddPeakAt = under; ddTroughAt = t.at; recover = null; }
    }
  }
  const stillUnder = under !== null ? Date.now() - under : null;

  const dayTotals = new Map(), dayCounts = new Map();
  for (const t of T) {
    if (t.v !== null) dayTotals.set(t.day, (dayTotals.get(t.day) || 0) + t.v);
    dayCounts.set(t.day, (dayCounts.get(t.day) || 0) + 1);
  }
  const weekTotals = new Map();
  for (const [d, v] of dayTotals) weekTotals.set(weekOf(d), (weekTotals.get(weekOf(d)) || 0) + v);
  const worst = (m) => { let k = null, v = Infinity; for (const [a, b] of m) if (b < v) { k = a; v = b; } return k === null ? null : { key: k, v }; };

  const hist = [[-Infinity, -2, 'Under −2R'], [-2, -1, '−2R to −1R'], [-1, 0, '−1R to 0'], [0, 1, '0 to 1R'], [1, 2, '1R to 2R'], [2, 3, '2R to 3R'], [3, Infinity, '3R or more']]
    .map(([a, b, label]) => ({ label, n: Rs.filter((x) => x >= a && x < b).length, up: a >= 0 }));
  const losersWithRisk = losses.filter((t) => t.r.risk);
  const beyond = losersWithRisk.map((t) => Math.abs(t.money) / t.r.risk);

  let run = 0, longestLoss = 0;
  for (const t of T) { if (t.loss) { run++; longestLoss = Math.max(longestLoss, run); } else run = 0; }
  let streakChance = null;
  if (n >= MIN && losses.length) {
    const q = losses.length / n, R0 = rng(n * 7919 + losses.length * 104729), runs = [];
    for (let k = 0; k < 4000; k++) {
      let r0 = 0, best = 0;
      for (let i = 0; i < n; i++) { if (R0() < q) { r0++; if (r0 > best) best = r0; } else r0 = 0; }
      runs.push(best);
    }
    runs.sort((a, b) => a - b);
    streakChance = { median: pct(runs, 0.5), lo: pct(runs, 0.05), hi: pct(runs, 0.95), q };
  }

  out.risk = {
    maxDD: { closed: maxDD, open: openN ? Math.max(openDD, maxDD) : null, openN, peakAt: ddPeakAt, troughAt: ddTroughAt, n: nv },
    ddLength: { longest: longest || null, stillUnder, recovery: recover, n: nv },
    worstDay: worst(dayTotals), worstWeek: worst(weekTotals),
    rMultiples: { avg: mean(Rs), median: median(Rs), n: Rs.length, of: n, hist },
    beyondPlan: { avg: mean(beyond), over: beyond.filter((x) => x > 1.0001).length, n: beyond.length, losers: losses.length },
    streak: { longest: longestLoss, chance: streakChance, tooFew: n < MIN },
    curve,
  };

  /* --- execution ----------------------------------------------------------- */
  const exAvg = (items, key) => {
    const xs = items.map((t) => excursion(t, t.e[key], s.units)).filter((x) => x !== null);
    return { v: mean(xs), n: xs.length };
  };
  /* points kept per contract against the best open profit (MFE), as a
     ratio of totals: an average of per-trade ratios lets one loser with a
     tiny MFE swamp everything */
  const withMfe = T.filter((t) => Number.isFinite(t.e.mfe) && t.e.mfe > 0);
  const kept = (items) => {
    const mfe = sum(items.map((t) => t.e.mfe));
    return mfe > 0 ? Math.min(1, sum(items.map((t) => t.r.gross / (t.r.ins.point * t.e.contracts))) / mfe) : null;
  };
  const eff = withMfe;
  const held = (items) => items.filter((t) => t.exitAt).map((t) => t.exitAt - t.entryAt);
  const slips = T.filter((t) => Number.isFinite(t.e.intendedEntry))
    .map((t) => ((t.e.entryPrice - t.e.intendedEntry) * (t.e.direction === 'short' ? -1 : 1)) / t.r.ins.tick);
  out.execution = {
    mae: { win: exAvg(wins, 'mae'), loss: exAvg(losses, 'mae') },
    mfe: { win: exAvg(wins, 'mfe'), loss: exAvg(losses, 'mfe') },
    efficiency: { v: kept(eff), winners: kept(eff.filter((t) => t.win)), nWin: eff.filter((t) => t.win).length, n: eff.length, tooFew: eff.length < MIN },
    hold: { win: median(held(wins)), loss: median(held(losses)), nWin: held(wins).length, nLoss: held(losses).length },
    slippage: { v: mean(slips), n: slips.length },
    timeInMarket: timeInMarket(T, s),
  };

  /* --- when and how -------------------------------------------------------- */
  const bucket = (t) => {
    const c = etClock(t.entryAt), m = c.h * 60 + c.mi;
    if (m >= 570 && m < 600) return 'First 30 minutes';
    if (m >= 600 && m < 720) return 'Morning';
    if (m >= 720 && m < 960) return 'Afternoon';
    return 'Overnight';
  };
  const WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekday = (t) => WD[(new Date(t.day + 'T12:00:00Z').getUTCDay() + 6) % 7];
  const SIZE = { micro: 'Micros', mini: 'Minis', standard: 'Standard contracts' };

  const days = [...dayCounts.keys()];
  const perDayR = days.length >= MIN_DAYS ? pearson(days.map((d) => dayCounts.get(d)), days.map((d) => dayTotals.get(d) || 0)) : null;
  const countBuckets = [['1 trade', 1, 1], ['2 trades', 2, 2], ['3 trades', 3, 3], ['4 or more', 4, Infinity]].map(([label, a, b]) => {
    const ds = days.filter((d) => dayCounts.get(d) >= a && dayCounts.get(d) <= b);
    return { label, days: ds.length, avg: ds.length ? mean(ds.map((d) => dayTotals.get(d) || 0)) : null };
  });

  /* what came next, after a loss and after a win */
  const byEntry = T.slice().sort((a, b) => a.entryAt - b.entryAt);
  const gapsLoss = [], gapsWin = [], quick = [], later = [], sizeAfterLoss = [], sizeAfterWin = [];
  for (const t of byEntry) {
    const prev = T.filter((p) => p !== t && (p.exitAt || p.at) <= t.entryAt).pop();
    if (!prev) continue;
    const gap = t.entryAt - (prev.exitAt || prev.at);
    if (prev.loss) { gapsLoss.push(gap); (gap <= 15 * 60000 ? quick : later).push(t); sizeAfterLoss.push(t.e.contracts); }
    if (prev.win) { gapsWin.push(gap); sizeAfterWin.push(t.e.contracts); }
  }

  const news = T.map((t) => ({ t, nn: nearNews(t.e) }));
  const limit = s.dailyLimit > 0 ? s.dailyLimit : null;
  let autoAfter = [];
  if (limit) {
    const running = new Map();
    for (const t of byEntry) {
      const r = running.get(t.day) || 0;
      if (r <= -limit) autoAfter.push(t);
      running.set(t.day, r + t.r.net);
    }
  }
  const moodKey = (t) => (!t.e.mood ? null : t.e.mood <= 2 ? 'Low (1 to 2)' : t.e.mood === 3 ? 'Middle (3)' : 'High (4 to 5)');
  const sleepKey = (t) => (!Number.isFinite(t.e.sleep) ? null : t.e.sleep < 6 ? 'Under 6 hours' : t.e.sleep < 7 ? '6 to 7 hours' : '7 hours or more');
  const CHECK = { met: 'Checklist met', partly: 'Partly met', not: 'Not met' };

  out.when = {
    timeOfDay: groupBy(T, bucket, ['First 30 minutes', 'Morning', 'Afternoon', 'Overnight']),
    weekday: groupBy(T, weekday, WD),
    instrument: groupBy(T, (t) => t.e.instrument),
    size: groupBy(T, (t) => SIZE[t.r.ins.size], Object.values(SIZE)),
    tags: groupBy(T, (t) => t.e.orderflow || []),
    setups: groupBy(T, (t) => t.e.setup || null),
    checklist: groupBy(T, (t) => CHECK[t.e.checklist] || null, Object.values(CHECK)),
    perDay: { r: perDayR, days: days.length, buckets: countBuckets, tooFew: days.length < MIN_DAYS },
    afterLoss: { gapLoss: median(gapsLoss), gapWin: median(gapsWin), nLoss: gapsLoss.length, nWin: gapsWin.length, quick: group('Within 15 minutes of a loss', quick), later: group('Later than 15 minutes', later) },
    sizeAfter: { loss: mean(sizeAfterLoss), win: mean(sizeAfterWin), nLoss: sizeAfterLoss.length, nWin: sizeAfterWin.length },
    news: { yes: group('Near a release', news.filter((x) => x.nn.status === 'yes').map((x) => x.t)), no: group('Not near one', news.filter((x) => x.nn.status === 'no').map((x) => x.t)), unknown: news.filter((x) => x.nn.status === 'unknown').length },
    afterLimit: {
      flagged: group('Marked as after your limit', T.filter((t) => t.e.afterLimit === true)),
      within: group('Marked as within it', T.filter((t) => t.e.afterLimit === false)),
      auto: limit ? group('After the day reached your limit', autoAfter) : null, limit,
    },
    mood: groupBy(T, moodKey, ['Low (1 to 2)', 'Middle (3)', 'High (4 to 5)']),
    sleep: groupBy(T, sleepKey, ['Under 6 hours', '6 to 7 hours', '7 hours or more']),
  };

  /* --- consistency --------------------------------------------------------- */
  const dv = [...dayTotals.values()];
  const green = dv.filter((x) => x > 1e-9), red = dv.filter((x) => x < -1e-9);
  const best = dv.length ? Math.max(...dv) : null;
  const w = extra.window || 20;
  const rolling = [];
  for (let i = w - 1; i < vals.length; i++) {
    const sl = vals.slice(i - w + 1, i + 1), r = meanRange(sl);
    rolling.push({ i, m: mean(sl), lo: r[0], hi: r[1] });
  }
  out.consistency = {
    days: dv.length, greenShare: dv.length ? green.length / dv.length : null,
    green: { days: green.length, avg: mean(green) }, red: { days: red.length, avg: mean(red) },
    bestDay: { v: best, total, share: total > 0 && best > 0 ? best / total : null },
    calendar: { totals: dayTotals, counts: dayCounts },
    rolling: { window: w, points: rolling, tooFew: vals.length < w },
  };

  /* --- reliability --------------------------------------------------------- */
  let chance = null;
  if (nv >= MIN_CHANCE) {
    const R1 = rng(nv * 31337 + Math.round(Math.abs(total) * 100)), abs = vals.map(Math.abs), sims = 10000;
    let atLeast = 0;
    for (let k = 0; k < sims; k++) {
      let t = 0;
      for (const x of abs) t += R1() < 0.5 ? -x : x;
      if (t >= total) atLeast++;
    }
    chance = { p: atLeast / sims, sims };
  }
  out.reliability = { chance, n: nv, tooFew: nv < MIN_CHANCE };

  /* --- costs ---------------------------------------------------------------- */
  const months = n ? monthsSpanned(T[0].day, T[n - 1].day) : 0;
  const fees = (s.monthlyFees || 0) * months;
  const contracts = sum(T.map((t) => t.e.contracts));
  out.costs = {
    trade: costsAll, fees, months, total: costsAll + fees,
    perRoundTurn: contracts ? (costsAll + fees) / contracts : null,
    perDay: dv.length || dayCounts.size ? (costsAll + fees) / dayCounts.size : null,
    contracts, days: dayCounts.size,
  };
  return out;
}

function monthsSpanned(a, b) {
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma) + 1;
}

/* the share of each traded day's session with a position open */
function timeInMarket(T, s) {
  const byDay = new Map();
  for (const t of T) if (t.exitAt) { if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push([t.entryAt, t.exitAt]); }
  const shares = [];
  for (const [day, spans] of byDay) {
    const prev = new Date(Date.parse(day + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
    const start = s.dayStart === 18 ? wallToUtc(prev + 'T18:00', ET) : wallToUtc(day + 'T00:00', ET);
    const end = s.dayStart === 18 ? wallToUtc(day + 'T17:00', ET) : wallToUtc(day + 'T23:59', ET) + 60000;
    const cl = spans.map(([a, b]) => [Math.max(a, start), Math.min(b, end)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    let covered = 0, curA = null, curB = null;
    for (const [a, b] of cl) {
      if (curB === null || a > curB) { if (curB !== null) covered += curB - curA; curA = a; curB = b; } else curB = Math.max(curB, b);
    }
    if (curB !== null) covered += curB - curA;
    shares.push(covered / (end - start));
  }
  return { v: mean(shares), days: shares.length };
}

/* ----------------------------------------------------------- prop accounts */

/* Each account's distance to its rules, worked out from its own entries in
   money, net of costs (the way firms count). Closed trades only: a firm
   that trails the drawdown intraday may see a higher peak than this. */
export function account(acc, s, now = Date.now()) {
  const T = prepare(J.entriesFor(acc), { ...s, basis: 'net', units: 'money' });
  const start = Number.isFinite(acc.start) ? acc.start : Number.isFinite(acc.size) ? acc.size : 0;
  let bal = start, peak = start;
  const eod = new Map();
  for (const t of T) { bal += t.money; peak = Math.max(peak, bal); eod.set(t.day, bal); }
  const peakEOD = Math.max(start, ...eod.values());
  let threshold = null;
  if (Number.isFinite(acc.trailing) && acc.trailing > 0) {
    if (acc.trailingType === 'static') threshold = start - acc.trailing;
    else if (acc.trailingType === 'eod') threshold = peakEOD - acc.trailing;
    else threshold = peak - acc.trailing;
    if (acc.lockAtStart && acc.trailingType !== 'static') threshold = Math.min(threshold, start);
  }
  const today = tradingDay(now, s.dayStart);
  const todayNet = sum(T.filter((t) => t.day === today).map((t) => t.money));
  const dayTotals = new Map();
  for (const t of T) dayTotals.set(t.day, (dayTotals.get(t.day) || 0) + t.money);
  const profit = bal - start, best = dayTotals.size ? Math.max(...dayTotals.values()) : null;
  const ledger = acc.ledger || [];
  const spent = sum(ledger.filter((l) => l.type !== 'payout').map((l) => l.amount || 0));
  const paid = sum(ledger.filter((l) => l.type === 'payout').map((l) => l.amount || 0));
  return {
    n: T.length, start, balance: bal, peak,
    drawdown: threshold === null ? null : { threshold, distance: bal - threshold },
    daily: Number.isFinite(acc.dailyLimit) && acc.dailyLimit > 0 ? { limit: acc.dailyLimit, today: todayNet, left: acc.dailyLimit + Math.min(0, todayNet) } : null,
    consistency: Number.isFinite(acc.consistency) && acc.consistency > 0 && profit > 0 && best > 0
      ? { rule: acc.consistency / 100, share: best / profit, needed: Math.max(0, best / (acc.consistency / 100) - profit) }
      : (Number.isFinite(acc.consistency) && acc.consistency > 0 ? { rule: acc.consistency / 100, share: null } : null),
    goal: Number.isFinite(acc.profitTarget) && acc.profitTarget > 0 ? { target: acc.profitTarget, progress: profit / acc.profitTarget, left: acc.profitTarget - profit } : null,
    spent, paid, net: paid - spent,
  };
}
