// Simulated NQ journal for August and September 2026 on a Topstep 50K funded
// account. Every trade is placed on real NQ=F candles from Yahoo (5-minute
// from 11 August, hourly before), so prices, highs and lows are the market's
// own; the trades themselves are simulated and marked as such.
//
// The simulated trader: NQ only, 1 contract (2 on high-confidence setups),
// stops 16 to 30 points, profit at 1.5 to 2.5R, out after 75 minutes if
// neither is hit. Stops trading for the day after two losses or -$650, and
// never risks a trade that could breach the $1,000 daily loss limit or the
// $2,000 max loss (end-of-day trailing, stopping at the $0 starting balance).
//
//   node scripts/simulate-journal.mjs <out.json> [seed] [skill]
//
// The candles are fetched from Yahoo once and kept in dist/cache (not
// committed). Yahoo keeps 5-minute candles for 60 days only, so a later run
// falls back to hourly candles for older days. The journal loaded on
// 9 October 2026 was made with seed 3 and skill 0.6.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const [out, seedArg, skillArg] = process.argv.slice(2);
const SKILL = Number(skillArg || 0.6);
let seed = Number(seedArg || 20260801);
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const CACHE = new URL('../dist/cache/', import.meta.url);
mkdirSync(CACHE, { recursive: true });
async function fetchCandles(name, interval, from, to) {
  const file = new URL(name, CACHE);
  if (existsSync(file)) return;
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/NQ=F?interval=' + interval + '&period1=' + Math.floor(from / 1000) + '&period2=' + Math.floor(to / 1000) + '&includePrePost=true';
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error('Yahoo said ' + r.status + ' for ' + interval + ' candles: ' + (await r.text()).slice(0, 200));
  writeFileSync(file, await r.text());
}
await fetchCandles('nq-60m.json', '60m', Date.UTC(2026, 6, 31), Date.UTC(2026, 9, 1));
await fetchCandles('nq-5m.json', '5m', Date.UTC(2026, 7, 11), Date.UTC(2026, 9, 1)).catch((e) => { console.log(e.message + ' (using hourly candles only)'); writeFileSync(new URL('nq-5m.json', CACHE), JSON.stringify({ chart: { result: [{ timestamp: [], indicators: { quote: [{ open: [], high: [], low: [], close: [] }] } }] } })); });

const load = (f) => {
  const r = JSON.parse(readFileSync(new URL(f, CACHE))).chart.result[0], q = r.indicators.quote[0];
  return r.timestamp.map((t, i) => ({ t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] })).filter((b) => b.c != null && b.h != null && b.l != null);
};
const h60 = load('./nq-60m.json'), m5 = load('./nq-5m.json');
const FIVE_FROM = Date.UTC(2026, 7, 11, 4);
const bars = [...h60.filter((b) => b.t < FIVE_FROM).map((b) => ({ ...b, len: 3600e3 })), ...m5.map((b) => ({ ...b, len: 300e3 }))].sort((a, b) => a.t - b.t);

const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const etParts = (ms) => { const p = Object.fromEntries(ET.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return { day: p.year + '-' + p.month + '-' + p.day, h: +p.hour, m: +p.minute }; };
const tick = 0.25, PV = 20;
const snap = (p) => Math.round(p / tick) * tick;

const SETUPS = [
  ['Opening drive', ['Initiative buying', 'Stacked imbalances'], ['Initiative selling', 'Stacked imbalances'], 'Opening drive through the overnight high', 'Opening drive through the overnight low'],
  ['Overnight sweep', ['Sweep', 'Absorption'], ['Sweep', 'Absorption'], 'Sweep of the overnight low and absorption under it', 'Sweep of the overnight high and absorption above it'],
  ['Value area rejection', ['Value area edge', 'Absorption'], ['Value area edge', 'Exhaustion'], 'Rejection at the value area low', 'Rejection at the value area high'],
  ['VWAP reclaim', ['VWAP', 'Delta divergence'], ['VWAP', 'Delta divergence'], 'VWAP reclaim with delta turning up', 'VWAP loss with delta turning down'],
  ['Initial balance break', ['Initial balance', 'Initiative buying'], ['Initial balance', 'Initiative selling'], 'Break and hold above the initial balance high', 'Break and hold below the initial balance low'],
  ['Failed auction', ['Failed auction', 'Poor high or low'], ['Failed auction', 'Poor high or low'], 'Failed auction at the low', 'Failed auction at the high'],
];
const NOTES_WIN = ['Waited for the retest instead of chasing.', 'Stayed with it through the pullback; the plan held.', 'Clean read, sized as planned.', 'Took the partial where planned and let the rest work.'];
const NOTES_LOSS = ['Read was early; the level gave way.', 'Stop did its job. Nothing to change in the execution.', 'Entered before confirmation. Should have waited for the close of the bar.', 'Took it against the morning\'s direction; noted.'];
const NOTES_FLAT = ['Time stop. It did not go either way.', 'Closed it at the time limit with little in it.'];

const days = [...new Set(bars.map((b) => etParts(b.t).day))].filter((d) => d >= '2026-08-03' && d <= '2026-09-30')
  .filter((d) => { const wd = new Date(d + 'T12:00:00Z').getUTCDay(); return wd >= 1 && wd <= 5 && d !== '2026-09-07'; });

let balance = 0, peakEOD = 0;
const MLL = 2000, DLL = 1000;
const entries = [];

for (const day of days) {
  if (rnd() < 0.22) continue;                       /* not every day is traded */
  const sess = bars.filter((b) => { const p = etParts(b.t); return p.day === day && ((p.h === 9 && p.m >= 30) || (p.h >= 10 && p.h < 16)); });
  if (sess.length < 4) continue;
  const threshold = Math.min(0, peakEOD - MLL);
  let dayNet = 0, losses = 0, i = 0, tradesToday = 0;
  const maxTrades = 1 + Math.floor(rnd() * 4);
  const mood = 1 + Math.min(4, Math.floor(rnd() * 5 + 0.6)), sleep = +(5.5 + rnd() * 3).toFixed(1);

  while (tradesToday < maxTrades && i < sess.length - 3) {
    i += 1 + Math.floor(rnd() * (sess[0].len > 300e3 ? 2 : 10));
    if (i >= sess.length - 3) break;
    const b = sess[i], p = etParts(b.t + b.len);
    if (p.h >= 15 && p.m > 15) break;
    if (p.h >= 12 && p.h < 13 && rnd() < 0.8) continue;   /* rarely trades lunch */

    const setup = pick(SETUPS);
    const conf = 2 + Math.floor(rnd() * 4);
    /* the simulated read: right a little more often than not, looking 30 to 60 minutes ahead */
    const ahead = sess.slice(i + 1, i + 1 + (b.len > 300e3 ? 1 : 9));
    const future = ahead.length ? ahead[ahead.length - 1].c - b.c : 0;
    const right = rnd() < SKILL;
    const dir = (future >= 0) === right ? 1 : -1;
    const stopPts = 12 + Math.floor(rnd() * 13);
    let q = conf >= 4 && rnd() < 0.5 ? 2 : 1;
    const room = Math.min(DLL + dayNet, balance - threshold) - 60;
    if (stopPts * PV * q > room) q = 1;
    if (stopPts * PV * q > room) break;               /* no room for a full loss today */

    const entry = snap(b.c), stop = snap(entry - dir * stopPts), rr = 1.5 + Math.floor(rnd() * 3) * 0.5;
    const target = snap(entry + dir * stopPts * rr);
    const partialAt = q === 2 ? snap(entry + dir * stopPts) : null;
    const entryAt = b.t + b.len;
    let exit = null, exitAt = null, mae = 0, mfe = 0, partial = null;
    const limit = entryAt + 75 * 60e3;
    for (let k = i + 1; k < sess.length; k++) {
      const x = sess[k];
      const adverse = dir > 0 ? entry - x.l : x.h - entry, favour = dir > 0 ? x.h - entry : entry - x.l;
      const hitStop = adverse >= stopPts, hitTarget = favour >= stopPts * rr;
      if (hitStop && hitTarget) { /* both inside one bar: the bar's open decides which came first */
        const openFav = (x.o - entry) * dir >= 0;
        if (openFav) { mfe = Math.max(mfe, stopPts * rr); exit = target; } else { mae = Math.max(mae, stopPts); exit = stop; }
        exitAt = x.t + x.len / 2; break;
      }
      if (partialAt && !partial && favour >= stopPts) partial = { at: new Date(x.t + x.len / 2).toISOString(), price: partialAt, contracts: 1 };
      if (hitStop) { mae = Math.max(mae, stopPts); mfe = Math.max(mfe, favour); exit = stop; exitAt = x.t + x.len / 2; break; }
      if (hitTarget) { mfe = Math.max(mfe, stopPts * rr); mae = Math.max(mae, adverse); exit = target; exitAt = x.t + x.len / 2; break; }
      mae = Math.max(mae, adverse); mfe = Math.max(mfe, favour);
      if (x.t + x.len >= limit || k === sess.length - 1) { exit = snap(x.c); exitAt = x.t + x.len; break; }
    }
    if (exit === null) break;
    if (exit === stop && rnd() < 0.3) exit = snap(stop - dir * tick);          /* a tick of slippage on some stops */

    const legs = partial ? [[partial.price, 1], [exit, q - 1]] : [[exit, q]];
    const gross = legs.reduce((s, [px, n]) => s + (px - entry) * dir * n * PV, 0);
    dayNet += gross; balance += gross; tradesToday++;
    const outcome = gross > 1 ? 'win' : gross < -1 ? 'loss' : 'flat';
    if (outcome === 'loss') losses++;
    const tags = dir > 0 ? setup[1] : setup[2];
    entries.push({
      id: 'sim-' + String(entries.length + 1).padStart(3, '0'), v: 2, simulated: true,
      instrument: 'NQ', direction: dir > 0 ? 'long' : 'short', contracts: q, enteredZone: 'America/New_York',
      entryAt: new Date(entryAt).toISOString(), exitAt: new Date(exitAt).toISOString(),
      entryPrice: entry, exitPrice: exit, confidence: conf, confluence: dir > 0 ? setup[3] : setup[4],
      partials: partial ? [partial] : [], stop, plannedExit: target,
      intendedEntry: rnd() < 0.5 ? snap(entry - dir * tick * Math.floor(rnd() * 3)) : null,
      costs: null, account: 'Topstep 50K funded', bias: rnd() < 0.6 ? (dir > 0 ? 'up' : 'down') : 'balanced',
      orderflow: tags, setup: setup[0], checklist: conf >= 4 ? 'met' : pick(['met', 'partly', 'partly', 'not']),
      mae: +mae.toFixed(2), mfe: +mfe.toFixed(2), mood, sleep,
      followedPlan: outcome === 'loss' && rnd() < 0.25 ? false : true, afterLimit: false, nearNews: null,
      mistakes: outcome === 'loss' && rnd() < 0.35 ? [pick(['Chased the entry', 'Hesitated', 'Exited early'])] : [],
      notes: 'Simulated entry. ' + pick(outcome === 'win' ? NOTES_WIN : outcome === 'loss' ? NOTES_LOSS : NOTES_FLAT),
    });
    if (losses >= 2 || dayNet <= -650) break;          /* the trader's own rule for the day */
    if (dayNet >= 900 && rnd() < 0.7) break;             /* and a good day often ends early */
  }
  peakEOD = Math.max(peakEOD, balance);
}

const account = {
  id: 'sim-topstep-50k', simulated: true, name: 'Topstep 50K funded', firm: 'Topstep', kind: 'funded',
  start: 0, size: 50000, trailing: 2000, trailingType: 'eod', lockAtStart: true, dailyLimit: 1000, consistency: null, profitTarget: null,
  notes: 'Simulated account. Balance starts at $0; the $2,000 max loss trails the end-of-day balance and stops at $0.', ledger: [],
};
writeFileSync(out, JSON.stringify({ schema: 2, entries, accounts: [account] }, null, 1));
const wins = entries.filter((e) => { const p = e.partials.length ? (e.partials[0].price - e.entryPrice) * (e.direction === 'long' ? 1 : -1) * PV : 0; const f = (e.exitPrice - e.entryPrice) * (e.direction === 'long' ? 1 : -1) * PV * (e.contracts - e.partials.length); return p + f > 1; }).length;
console.log(entries.length + ' simulated trades on ' + new Set(entries.map((e) => e.entryAt.slice(0, 10))).size + ' days; ' + wins + ' winners; gross ' + balance.toFixed(2) + '; peak end-of-day balance ' + peakEOD.toFixed(2) + '; MLL line now ' + Math.min(0, peakEOD - MLL).toFixed(2));
console.log('prices ' + Math.min(...entries.map((e) => e.entryPrice)) + ' to ' + Math.max(...entries.map((e) => e.entryPrice)));
