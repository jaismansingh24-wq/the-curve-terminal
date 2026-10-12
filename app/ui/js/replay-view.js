/* The Replay page: load a file of bars or of trades, choose where to
   start, then play the market forward and practise orders against it, on
   one, two or four charts.

   Every trade here is practice: simulated from past data, never sent
   anywhere, labelled Practice wherever it shows, and kept in its own log,
   apart from the journal. The files are the reader's own exports; they stay
   on this computer, and their provider's terms apply to them. */

import * as R from './replay-data.js';
import { createEngine } from './replay-engine.js';
import { ReplayChart, DEFAULT_SPEC } from './replay-chart.js';
import { INSTRUMENTS, get as instrument } from './instruments.js';
import * as settings from './settings.js';
import { invoke, isNative } from '../shared/js/native.js';
import { el, money, int } from './format.js';
import { timeBoth, timeET, shortDateET, ET } from './time.js';

const TFS = [[1, '1m'], [5, '5m'], [15, '15m'], [30, '30m'], [60, '1h'], [240, '4h'], ['D', '1D']];
const SPEEDS = [[1, '1×'], [5, '5×'], [20, '20×'], [60, '60×'], [300, '300×'], [900, '900×'], [3600, '3600×']];
const LAYOUTS = [['1', 'One chart'], ['2h', 'Two, side by side'], ['2v', 'Two, stacked'], ['4', 'Four']];
const TYPES = [['candles', 'Candles'], ['footprint', 'Footprint'], ['tpo', 'TPO']];
const MINUS = '−';
const S = () => settings.get();

const st = {
  root: null, meta: null, data: null, base: null, ins: null, engine: null,
  charts: [], aggs: new Map(), cache: new Map(), tpoCache: new Map(),
  playing: false, raf: 0, simT: 0, lastT: 0,
  session: null, menu: null, log: { sessions: [] }, logLoaded: false,
  tool: 'cursor', colour: '', draw: { files: {} }, drawLoaded: false, selected: null,
};
let confirmBox = null;

/* ------------------------------------------------------------ helpers */

const trades = () => st.data && st.data.kind === 'trades';
/* a data index's time in UTC seconds */
const timeAt = (i) => (trades() ? st.data.t[i] : st.data.t[i] * 60);
const when = (sec) => shortDateET(sec * 1000) + ', ' + timeBoth(sec * 1000);
/* with a file of trades the clock shows the second as well */
const whenExact = (sec) => (trades() ? shortDateET(sec * 1000) + ', ' + timeBoth(sec * 1000).replace(/^(\d{1,2}:\d{2})/, '$1:' + String(((sec % 60) + 60) % 60).padStart(2, '0')) : when(sec));
const whenET = (sec) => shortDateET(sec * 1000) + ', ' + timeET(sec * 1000);
const count = (n, one, many) => int(n) + ' ' + (n === 1 ? one : many);
function price(ticks) {
  if (ticks === null || ticks === undefined || !Number.isFinite(ticks)) return '';
  const d = st.ins ? st.ins.decimals : 2, p = ticks * st.meta.tick;
  return (p < 0 ? MINUS : '') + Math.abs(p).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
}
const signedTicks = (v) => (Math.abs(v) < 1e-9 ? '0 ticks' : (v > 0 ? '+' : MINUS) + (Math.abs(v) % 1 ? Math.abs(v).toFixed(1) : Math.abs(v)) + ' ticks');
const tone = (v) => (Math.abs(v) < 1e-9 ? 'pnl pnl--flat' : v > 0 ? 'pnl pnl--up' : 'pnl pnl--down');
function btn(text, cls, run, label) {
  const b = el('button', 'btn ' + (cls || 'btn--quiet'), text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', run);
  return b;
}
function seg(label, opts, value, pick) {
  const g = el('div', 'seg seg--sm');
  g.setAttribute('role', 'radiogroup');
  g.setAttribute('aria-label', label);
  const list = opts.map(([v, text]) => {
    const b = el('button', 'seg__opt', text);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.value = String(v);
    b.setAttribute('aria-checked', String(v) === String(value) ? 'true' : 'false');
    b.tabIndex = String(v) === String(value) ? 0 : -1;
    b.addEventListener('click', () => { list.forEach((x) => { x.setAttribute('aria-checked', x === b ? 'true' : 'false'); x.tabIndex = x === b ? 0 : -1; }); pick(v); });
    return b;
  });
  g.append(...list);
  g.addEventListener('keydown', (e) => {
    const i = list.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const n = e.key === 'ArrowRight' ? (i + 1) % list.length : e.key === 'ArrowLeft' ? (i - 1 + list.length) % list.length : -1;
    if (n < 0) return;
    e.preventDefault();
    list[n].click();
    list[n].focus();
  });
  return g;
}
function field(label, input) { const f = el('label', 'tf rp-field'); f.append(el('span', 'kicker', label), input); return f; }
function group(label, node) { const f = el('div', 'tf rp-field'); f.setAttribute('role', 'group'); f.setAttribute('aria-label', label); f.append(el('span', 'kicker', label), node); return f; }
function toggle(text, on, run) {
  const b = el('button', 'rp-tog', text);
  b.type = 'button';
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.addEventListener('click', () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', v ? 'true' : 'false'); run(v); });
  return b;
}
function say(text) { const s = st.root && st.root.querySelector('[data-rp-say]'); if (s) s.textContent = text; }

/* the instrument a file is for, from its name (ENQZ26 is NQ, EP is ES) */
function guessInstrument(name) {
  const base = String(name).toUpperCase().replace(/\.[A-Z0-9]+$/, '').replace(/^.*[\\/]/, '');
  if (/^EP[A-Z]\d/.test(base)) return 'ES';
  const s = base.replace(/^E(?=NQ|S)/, '');
  const codes = INSTRUMENTS.map((i) => i.code).sort((a, b) => b.length - a.length);
  return codes.find((c) => s.startsWith(c)) || 'NQ';
}
const wallText = (sec) => new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ');

/* ------------------------------------------------------------ loading a file */

function loader(first, join = null) {
  const box = el('section', 'rp-load glass glass--quiet');
  box.appendChild(el('h2', 'title rp-load__h', join ? 'Add an export to ' + join.name : first ? 'Load a file' : 'Load another file'));
  box.appendChild(el('p', 'rp-p', join
    ? 'Choose a later (or earlier) tick export of the same contract. Exports of the latest trades overlap; the later file takes over from its first full second, so nothing is counted twice.'
    : 'An export from your platform, either of bars (each line a date and time, then open, high, low, close and volume) or of trades (each line a date and time, then price, bid, ask and size). MotiveWave\'s exports (Data, Export) are read as they are. Trades give the footprint and delta: a trade at the ask is counted as a buy, at the bid as a sell. The files stay on this computer; the app keeps a compact copy in its own folder and sends nothing anywhere. Your data provider\'s terms still apply to them.'));
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.txt,text/csv,text/plain';
  input.className = 'rp-file';
  const status = el('p', 'rp-p rp-status', '');
  status.setAttribute('role', 'status');
  const next = el('div', 'rp-load__next');
  box.append(input, btn('Choose a file', 'btn--primary', () => input.click()), status, next);
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    next.replaceChildren();
    status.textContent = 'Reading ' + file.name + ' (' + (file.size / 1048576).toFixed(1) + ' MB).';
    try {
      const text = await file.text();
      await new Promise((r) => setTimeout(r, 20));
      const kind = R.kindOf(text);
      if (join && kind !== 'trades') throw new Error('Only a file of trades can be added to a file of trades.');
      let p, zones, base = 0;
      if (kind === 'trades') { p = R.parseTrades(text); zones = R.detectZoneTrades(p.wall); }
      else { p = R.parse(text); base = R.barMinutes(p.wall); zones = R.detectZone(p.wall, base); }
      const best = zones[0];
      const firstSec = kind === 'trades' ? p.wall[0] : p.wall[0] * 60, lastSec = kind === 'trades' ? p.wall[p.n - 1] : p.wall[p.n - 1] * 60;
      status.textContent = (kind === 'trades' ? count(p.n, 'trade', 'trades') : count(p.n, 'bar', 'bars') + ' of ' + base + ' minute' + (base === 1 ? '' : 's')) + (p.bad ? ', and ' + count(p.bad, 'line', 'lines') + ' that could not be read' : '') + '. From ' + wallText(firstSec) + ' to ' + wallText(lastSec) + ', as written in the file.';
      const zone = el('select', 'inp inp--sm');
      zones.forEach((z) => zone.appendChild(new Option(z.label + (z.of ? ' (break at 5:00 pm ET on ' + int(z.hits) + ' of ' + int(z.of) + ' days)' : ''), z.zone)));
      zone.value = join ? join.zone : best.zone;
      const ins = el('select', 'inp inp--sm');
      INSTRUMENTS.forEach((i) => ins.appendChild(new Option(i.code + ' · ' + i.name, i.code)));
      ins.value = join ? join.instrument : guessInstrument(file.name);
      const stamp = el('select', 'inp inp--sm');
      stamp.append(new Option('When each bar opened', 'open'), new Option('When each bar closed', 'close'));
      stamp.value = best.stamping;
      const found = best.hits && best.hits >= best.of * 0.8;
      const why = el('p', 'rp-p rp-note', found
        ? 'The times in this file read as ' + best.label + ': that puts its daily break at 5:00 pm ET, when CME stops trading for the hour, on ' + count(best.hits, 'day', 'days') + ' of ' + int(best.of) + '.' + (kind === 'bars' ? ' Each time is ' + (best.stamping === 'open' ? 'when its bar opened.' : 'when its bar closed.') : '') + ' Change these if you know otherwise.'
        : 'The daily 5:00 pm ET break could not be found in this file\'s times, so its time zone is a guess. Choose the zone your platform exported in.');
      const row = el('div', 'rp-row');
      if (!join) row.appendChild(field('Instrument', ins));
      row.appendChild(field('Times are in', zone));
      if (kind === 'bars') row.appendChild(field('Each time is', stamp));
      const keepBtn = btn(join ? 'Add it' : 'Keep it and open', 'btn--primary', async () => {
        keepBtn.disabled = true;
        status.textContent = 'Preparing the file.';
        try {
          const insObj = instrument(join ? join.instrument : ins.value);
          if (kind === 'trades') {
            let T = R.buildTrades(p, { zone: zone.value, tick: insObj.tick });
            let note = '';
            if (join) { const J = R.joinTrades(st.data, T); T = J.data; note = ' ' + J.note + ' ' + count(Math.max(0, J.added), 'trade', 'trades') + ' added.'; }
            const meta = join ? { ...join, sources: [...(join.sources || [join.name]), file.name] } : { name: file.name, instrument: insObj.code, tick: insObj.tick, zone: zone.value, sources: [file.name] };
            const id = await R.keep(meta, T, join ? join.id : null);
            status.textContent = 'Kept.' + note;
            await openFile(id, note.trim());
          } else {
            const d = R.build(p, { zone: zone.value, stamping: stamp.value, base, tick: insObj.tick });
            const id = await R.keep({ name: file.name, instrument: insObj.code, tick: insObj.tick, zone: zone.value, stamping: stamp.value, base }, d);
            status.textContent = 'Kept.';
            await openFile(id);
          }
        } catch (e) {
          status.textContent = String(e && e.message ? e.message : e);
          keepBtn.disabled = false;
        }
      });
      next.append(row, why, keepBtn);
    } catch (e) {
      status.textContent = String(e && e.message ? e.message : e);
    }
  });
  return box;
}

/* ------------------------------------------------------------ opening a file */

async function openFile(id, message = '') {
  stop();
  const meta = R.files().find((f) => f.id === id);
  if (!meta) return;
  st.root.replaceChildren(el('p', 'note', 'Opening ' + meta.name + '.'));
  try { st.data = await R.open(id); } catch (e) { st.root.replaceChildren(el('p', 'empty', String(e && e.message ? e.message : e)), loader(false)); return; }
  st.meta = meta;
  st.ins = instrument(meta.instrument) || { code: meta.instrument, tick: meta.tick, tickValue: 1, decimals: 2, name: meta.instrument };
  st.base = trades() ? R.barsFromTrades(st.data) : st.data;
  st.aggs.clear(); st.cache.clear(); st.tpoCache.clear();
  settings.update({ replayFile: id });
  st.engine = createEngine({
    data: st.data, tickValue: st.ins.tickValue, commission: Number(S().costPerContract) || 0,
    rules: { fill: S().replayFill || 'through', slip: Number(S().replaySlip) || 0 },
    onEvent: onEngine,
  });
  await loadDraw();
  workspace();
  startAt(defaultStart(), true);
  drawLog();
  if (message) say(message);
}

function defaultStart() {
  const b = st.base;
  const firstSec = b.t[0] * 60, lastSec = b.t[b.n - 1] * 60;
  /* 9:30 am ET on the first weekday that has it, fourteen days before the end, or a little in */
  const lastET = R.toET(b.t[b.n - 1]);
  let day = Math.floor(lastET / 1440) - 14;
  for (let k = 0; k < 20; k++) {
    const at = R.wallToUtc(day * 1440 + 570, ET) * 60;
    const wd = new Date(day * 864e5).getUTCDay();
    if (wd !== 0 && wd !== 6 && at > firstSec + 600 && at < lastSec) return at;
    day = at <= firstSec + 600 ? day + 1 : day - 1;
    if (day * 1440 > lastET) break;
  }
  return firstSec + Math.min(1800, (lastSec - firstSec) / 4);
}
function randomStart() {
  const b = st.base;
  const a = Math.floor(R.toET(b.t[0]) / 1440), z = Math.floor(R.toET(b.t[b.n - 1]) / 1440);
  for (let k = 0; k < 80; k++) {
    const day = a + Math.floor(Math.random() * Math.max(1, z - a + 1));
    const wd = new Date(day * 864e5).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const at = R.wallToUtc(day * 1440 + 570, ET) * 60;
    if (at > b.t[0] * 60 && at < b.t[b.n - 1] * 60) return at;
  }
  return defaultStart();
}

/* ------------------------------------------------------------ the workspace */

function chartSpecs() {
  const saved = Array.isArray(S().replayCharts) ? S().replayCharts : [];
  return [0, 1, 2, 3].map((k) => {
    const def = { ...DEFAULT_SPEC, tf: [1, 5, 15, 'D'][k], look: { ...DEFAULT_SPEC.look } };
    const s = saved[k] || {};
    return { ...def, ...s, look: { ...def.look, ...(s.look || {}) } };
  });
}
let specTimer = null;
function saveSpecs() {
  if (specTimer) clearTimeout(specTimer);
  specTimer = setTimeout(() => { specTimer = null; settings.update({ replayCharts: st.charts.map((c) => c.spec) }); }, 300);
}

function workspace() {
  const root = st.root;
  root.replaceChildren();
  const d = st.base, meta = st.meta;

  /* the file, the layout and where to start */
  const top = el('div', 'rp-bar');
  const fileSel = el('select', 'inp inp--sm');
  R.files().forEach((f) => fileSel.appendChild(new Option(f.name + ' · ' + f.instrument + (f.kind === 'trades' ? ' · trades' : ''), f.id)));
  fileSel.value = meta.id;
  fileSel.addEventListener('change', () => openFile(fileSel.value));
  const date = el('input', 'inp inp--sm'); date.type = 'date'; date.dataset.rpDate = '';
  const time = el('input', 'inp inp--sm'); time.type = 'time'; time.step = 60; time.dataset.rpTime = '';
  date.min = isoDay(d.t[0]); date.max = isoDay(d.t[d.n - 1]);
  top.append(
    field('File', fileSel),
    group('Charts', seg('Charts', LAYOUTS, S().replayLayout || '1', (v) => { settings.update({ replayLayout: v }); layoutCharts(); })),
    group('Start (New York time)', wrapRow(date, time, btn('Start here', 'btn--primary', () => {
      if (!date.value) return;
      const [y, m, dd] = date.value.split('-').map(Number);
      const [hh, mi] = (time.value || '09:30').split(':').map(Number);
      confirmRestart(R.wallToUtc(Date.UTC(y, m - 1, dd, hh, mi) / 60000, ET) * 60);
    }), btn('A random day', '', () => confirmRestart(randomStart())))),
  );
  const more = el('div', 'rp-files');
  more.append(el('span', 'kicker', trades() ? 'Trades: ' + int(st.data.n) + ', from ' + whenET(st.data.t[0]) + ' to ' + whenET(st.data.t[st.data.n - 1]) : 'Bars: ' + int(st.data.n) + ' of ' + (st.data.base || 1) + ' minute'));
  if (trades()) more.appendChild(btn('Add an export to this file', '', () => { stop(); st.root.replaceChildren(loader(false, st.meta), backLink()); }));
  more.append(btn('Load another file', '', () => { stop(); st.root.replaceChildren(loader(false), backLink()); }),
    btn('Remove this file', '', () => {
      stop();
      confirmBox(meta.name + '. Only the app\'s copy is removed; your export is not touched. The practice log keeps its trades.', async () => {
        await R.forget(meta.id);
        settings.update({ replayFile: '' });
        st.engine = null; st.meta = null;
        renderReplay();
      }, 'Remove this file from Replay?');
    }));

  /* the replay controls and the clock */
  const ctl = el('div', 'rp-ctl');
  const play = btn('Play', 'btn--primary rp-play', () => (st.playing ? stop() : start()), 'Play or pause (Space)');
  play.dataset.rpPlay = '';
  ctl.append(play);
  if (trades()) ctl.appendChild(btn('Next trade', '', () => { stop(); stepData(1); }, 'Next trade (Right arrow)'));
  ctl.append(btn('Next minute', '', () => { stop(); stepMinute(); }, trades() ? 'To the end of this minute' : 'Next one-minute bar (Right arrow)'),
    btn('Next chart bar', '', () => { stop(); stepChartBar(); }, 'Next bar of the first chart (Shift and Right arrow)'),
    group('Speed', seg('Speed', SPEEDS, speed(), (v) => settings.update(trades() ? { replaySpeedTrades: +v } : { replaySpeedBars: +v }))));
  const clock = el('p', 'rp-clock'); clock.dataset.rpClock = '';
  ctl.append(clock, el('span', 'simtag rp-tag', 'Practice'));

  /* the drawing tools */
  const tools = el('div', 'rp-tools');
  const colour = el('input', 'rp-colour'); colour.type = 'color'; colour.value = S().replayLineColour || '#edeff2'; colour.setAttribute('aria-label', 'Colour of new lines');
  colour.addEventListener('input', () => { settings.update({ replayLineColour: colour.value }); if (st.selected) recolourSelected(colour.value); });
  tools.append(
    group('Draw', seg('Drawing tool', [['cursor', 'Cursor'], ['h', 'Horizontal line'], ['trend', 'Trend line']], st.tool, (v) => { st.tool = v; st.charts.forEach((c) => { c.chart.pending = null; c.chart.draw(); }); })),
    field('Line colour', colour),
    btn('Remove the selected line', '', removeSelected),
    btn('Remove all lines', '', () => { if (!drawings().length) return; confirmBox(count(drawings().length, 'line', 'lines') + ' on this file\'s charts.', () => { setDrawings([]); }, 'Remove all lines?'); }),
    el('p', 'rp-note rp-tools__hint', 'Click a chart to place a line (a trend line takes two clicks). Click a line to select it, drag to move it, Delete to remove it.'),
  );

  /* the charts and the panel beside them */
  const work = el('div', 'rp-work');
  const left = el('div', 'rp-left');
  const charts = el('div', 'rp-charts');
  charts.dataset.rpCharts = '';
  const read = el('p', 'rp-read'); read.dataset.rpRead = '';
  left.append(charts, read);
  const side = el('aside', 'rp-side');
  side.append(ticket(), positionBox(), ordersBox(), rulesBox());
  work.append(left, side);
  const menu = el('div', 'rp-menu glass'); menu.hidden = true; menu.setAttribute('role', 'menu');
  st.menu = menu;
  const sayLine = el('p', 'note rp-say'); sayLine.dataset.rpSay = ''; sayLine.setAttribute('role', 'status');
  const tradesBox = el('section', 'rp-trades'); tradesBox.dataset.rpTrades = '';
  const logBox = el('section', 'rp-log'); logBox.dataset.rpLog = '';
  root.append(top, more, ctl, tools, sayLine, work, menu, tradesBox, logBox,
    el('p', 'note rp-roll', (trades() ? 'Buys and sells are inferred: a trade at the ask counts as a buy, at the bid as a sell. The exchange does not report the side, and platforms that infer it differently show different deltas from the same trades. ' : 'This file has bars, not trades: volume at price is spread evenly over each bar\'s range, and there is no footprint or delta. ') + 'If a file joins several contract months, prices jump at each roll; Replay shows the file as it has them.'));
  st.charts = [];
  const specs = chartSpecs();
  for (let k = 0; k < 4; k++) st.charts.push(makeChart(k, specs[k]));
  layoutCharts();
  document.addEventListener('mousedown', closeMenuOutside);
}
function wrapRow(...nodes) { const r = el('span', 'rp-inline'); r.append(...nodes); return r; }
function backLink() { return btn('Back to the replay', '', () => (st.meta ? openFile(st.meta.id) : renderReplay())); }
const isoDay = (utcMin) => new Date(Math.floor(R.toET(utcMin) / 1440) * 864e5).toISOString().slice(0, 10);
const speed = () => (trades() ? S().replaySpeedTrades || 20 : S().replaySpeedBars || 300);

function layoutCharts() {
  const box = st.root.querySelector('[data-rp-charts]');
  if (!box) return;
  const lay = S().replayLayout || '1';
  const n = lay === '1' ? 1 : lay === '4' ? 4 : 2;
  box.dataset.layout = lay;
  box.replaceChildren(...st.charts.slice(0, n).map((c) => c.el));
  st.charts.forEach((c, k) => { c.active = k < n; });
  requestAnimationFrame(() => { st.charts.forEach((c) => c.active && c.chart.size()); refresh(); });
}

/* one chart: its own toolbar, style and canvas */
function makeChart(k, spec) {
  const wrap = el('section', 'rp-pane');
  const bar = el('div', 'rp-pane__bar');
  const host = el('div', 'rp-chart');
  wrap.append(bar, host);
  const c = { k, spec, el: wrap, active: false };
  const set = (patch) => { Object.assign(c.spec, patch); saveSpecs(); refresh(); };
  const tf = el('select', 'inp inp--xs'); tf.setAttribute('aria-label', 'Timeframe of chart ' + (k + 1));
  TFS.forEach(([v, t]) => tf.appendChild(new Option(t, String(v))));
  tf.value = String(spec.tf);
  tf.addEventListener('change', () => set({ tf: tf.value === 'D' ? 'D' : +tf.value }));
  const type = el('select', 'inp inp--xs'); type.setAttribute('aria-label', 'Chart type');
  TYPES.forEach(([v, t]) => type.appendChild(new Option(t, v)));
  type.value = spec.type;
  type.addEventListener('change', () => {
    /* a footprint needs wide bars to show its rows; candles and TPO start narrow */
    c.chart.barPx = type.value === 'footprint' ? 72 : 9;
    set({ type: type.value });
    c.chart.toPresent();
  });
  const togs = [
    toggle('Volume', spec.volume, (v) => set({ volume: v })),
    toggle('Delta', spec.delta, (v) => set({ delta: v })),
    toggle('Volume profile', spec.vp, (v) => set({ vp: v })),
    toggle('Delta profile', spec.dp, (v) => set({ dp: v })),
  ];
  /* a TPO chart has no volume or delta panes or profiles */
  const syncTogs = () => togs.forEach((b) => { b.disabled = c.spec.type === 'tpo'; });
  type.addEventListener('change', syncTogs);
  syncTogs();
  bar.append(el('span', 'kicker rp-pane__n', 'Chart ' + (k + 1)), tf, type, ...togs,
    btn('Style', 'rp-pane__btn', () => openStyle(c), 'Colours and settings of chart ' + (k + 1)),
    btn('Fit', 'rp-pane__btn', () => c.chart.toPresent(), 'Back to the present, prices fitted'));
  c.chart = new ReplayChart(host, {
    tool: () => st.tool,
    colour: () => S().replayLineColour || '',
    drawings: () => drawings(),
    addDrawing: (d) => addDrawing(d),
    updateDrawing: (d, done) => updateDrawing(d, done),
    onSelect: (id) => { st.selected = id; st.charts.forEach((o) => { if (o !== c) { o.chart.selected = id; o.chart.draw(); } }); },
    onContext: (e) => openMenu(e),
    onOrderMove: (id, p) => { st.engine.modify(id, p); refresh(); },
    onOrderCancel: (id) => { st.engine.cancel(id); refresh(); },
    onHover: (i, ch) => readout(ch, i),
  });
  c.chart.cv.setAttribute('aria-label', 'Chart ' + (k + 1) + ' of the replay, up to its present');
  if (spec.type === 'footprint') c.chart.barPx = 72;
  return c;
}

/* the style of one chart: profile and TPO settings, and its colours */
function openStyle(c) {
  const old = c.el.querySelector('.rp-style');
  if (old) { old.remove(); return; }
  const dlg = el('div', 'rp-style glass');
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-label', 'Style of chart ' + (c.k + 1));
  const s = c.spec, L = s.look;
  const set = (patch) => { Object.assign(s, patch); saveSpecs(); refresh(); };
  const setLook = (patch) => { Object.assign(L, patch); saveSpecs(); refresh(); };
  const num = (v, min, max, run) => { const i = el('input', 'inp inp--xs'); i.type = 'number'; i.min = min; i.max = max; i.value = v; i.addEventListener('change', () => run(Math.max(min, Math.min(max, Math.floor(+i.value || 0))))); return i; };
  const col = (key, label, fallback) => {
    const i = el('input', 'rp-colour'); i.type = 'color'; i.value = L[key] || fallback;
    i.addEventListener('input', () => setLook({ [key]: i.value }));
    const f = field(label, i);
    const reset = btn('Default', 'rp-mini', () => { setLook({ [key]: '' }); i.value = fallback; });
    f.appendChild(reset);
    return f;
  };
  const tokens = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888888';
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '#888888');
  const prof = el('div', 'rp-style__row');
  prof.append(field('Value area, %', num(s.vaPct, 50, 95, (v) => set({ vaPct: v }))), field('Rows, ticks (0 fits the zoom)', num(s.profileRow, 0, 400, (v) => set({ profileRow: v }))));
  const tpo = el('div', 'rp-style__row');
  tpo.append(field('Rows, ticks', num(s.tpoRow, 1, 400, (v) => set({ tpoRow: v }))));
  const cols = el('div', 'rp-style__cols');
  dlg.append(
    el('h3', 'kicker rp-style__h', 'Chart ' + (c.k + 1) + ' · profiles'),
    group('Profiles show', seg('Profiles', [['visible', 'The visible bars'], ['session', 'Each session']], s.profileMode, (v) => set({ profileMode: v }))),
    prof,
    el('h3', 'kicker rp-style__h', 'TPO'),
    group('Session', seg('TPO session', [[true, 'Regular hours'], [false, 'Full session']], s.tpoRth !== false, (v) => set({ tpoRth: v === true || v === 'true' }))),
    group('A letter every', seg('TPO period', [[15, '15 min'], [30, '30 min'], [60, '60 min']], s.tpoPeriod, (v) => set({ tpoPeriod: +v }))),
    tpo,
    el('h3', 'kicker rp-style__h', 'Colours'),
    cols,
  );
  cols.append(
    col('up', 'Candles, up', hex(tokens('--text'))), col('down', 'Candles, down', hex(tokens('--text-dim'))), col('bg', 'Chart background', hex(tokens('--ink-raised'))),
    col('vol', 'Volume', '#ffffff'), col('prof', 'Profile', hex(tokens('--text-faint'))), col('va', 'Value area', hex(tokens('--text-dim'))), col('poc', 'Point of control', hex(tokens('--text'))),
    col('buy', 'Buys', hex(tokens('--bid'))), col('sell', 'Sells', hex(tokens('--ask'))),
    group('Grid', seg('Grid', [[true, 'On'], [false, 'Off']], L.grid !== false, (v) => setLook({ grid: v === true || v === 'true' }))),
  );
  const closeBtn = btn('Close', 'btn--primary', () => close());
  const acts = el('div', 'rp-style__acts');
  acts.append(btn('Reset this chart\'s style', '', () => { Object.assign(s, { ...DEFAULT_SPEC, tf: s.tf, type: s.type, look: { ...DEFAULT_SPEC.look } }); saveSpecs(); refresh(); close(); }), closeBtn);
  dlg.appendChild(acts);
  const close = () => { dlg.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  c.el.appendChild(dlg);
  closeBtn.focus();
}

/* ------------------------------------------------------------ the panel */

function ticket() {
  const box = el('section', 'rp-box glass glass--quiet');
  box.appendChild(el('h3', 'kicker rp-box__h', 'Order'));
  const qty = el('input', 'inp inp--sm rp-qty');
  qty.type = 'number'; qty.min = 1; qty.step = 1; qty.value = S().replayQty || 1;
  qty.addEventListener('change', () => { qty.value = Math.max(1, Math.floor(+qty.value || 1)); settings.update({ replayQty: +qty.value }); });
  qty.dataset.rpQty = '';
  const brSel = el('select', 'inp inp--sm'); brSel.dataset.rpBracket = '';
  fillBrackets(brSel);
  const priceIn = el('input', 'inp inp--sm'); priceIn.inputMode = 'decimal'; priceIn.placeholder = 'Price';
  const kind = el('select', 'inp inp--sm');
  kind.append(new Option('Limit', 'limit'), new Option('Stop', 'stop'));
  const q = () => Math.max(1, Math.floor(+qty.value || 1));
  const br = () => bracketOf(brSel.value);
  const at = () => { const v = Number(String(priceIn.value).replace(/,/g, '')); return Number.isFinite(v) && v > 0 ? Math.round(v / st.meta.tick) : null; };
  const placeAt = (side) => {
    const p = at();
    if (p === null) { say('Type a price for the ' + kind.value + ' order first, or right-click a chart at the price you want.'); return; }
    place({ side, type: kind.value, price: p, qty: q(), bracket: br() });
  };
  const grid = el('div', 'rp-ticket');
  grid.append(
    field('Contracts', qty), field('Bracket', brSel),
    el('span', 'rp-span kicker', 'At the last price'),
    btn('Buy market', '', () => place({ side: 'buy', type: 'market', qty: q(), bracket: br() })),
    btn('Sell market', '', () => place({ side: 'sell', type: 'market', qty: q(), bracket: br() })),
    el('span', 'rp-span kicker', 'At a price'),
    field('Type', kind), field('Price', priceIn),
    btn('Buy', '', () => placeAt('buy')),
    btn('Sell', '', () => placeAt('sell')),
  );
  box.append(grid, presetEditor(brSel));
  return box;
}
function bracketOf(v) {
  if (!v) return null;
  const b = (S().replayBrackets || [])[+v];
  return b ? { limit: +b.limit || 0, stop: +b.stop || 0 } : null;
}
function fillBrackets(sel) {
  const keep = sel.value;
  sel.replaceChildren(new Option('None', ''));
  (S().replayBrackets || []).forEach((b, i) => sel.appendChild(new Option('Limit +' + b.limit + ' / stop ' + MINUS + b.stop + ' ticks', String(i))));
  sel.value = [...sel.options].some((o) => o.value === keep) ? keep : (S().replayBrackets || []).length ? '0' : '';
}
function presetEditor(sel) {
  const det = el('details', 'rp-presets');
  det.appendChild(el('summary', '', 'Bracket presets'));
  const list = el('div', 'rp-presets__list');
  const draw = () => {
    list.replaceChildren();
    (S().replayBrackets || []).forEach((b, i) => {
      const row = el('div', 'rp-presets__row');
      row.append(el('span', '', 'Limit +' + b.limit + ', stop ' + MINUS + b.stop + ' ticks'), btn('Remove', '', () => {
        settings.update({ replayBrackets: (S().replayBrackets || []).filter((_, k) => k !== i) });
        fillBrackets(sel); draw();
      }));
      list.appendChild(row);
    });
  };
  const lim = el('input', 'inp inp--sm'); lim.type = 'number'; lim.min = 0; lim.placeholder = 'Limit ticks';
  const stp = el('input', 'inp inp--sm'); stp.type = 'number'; stp.min = 0; stp.placeholder = 'Stop ticks';
  const add = btn('Add', '', () => {
    const a = Math.max(0, Math.floor(+lim.value || 0)), b = Math.max(0, Math.floor(+stp.value || 0));
    if (!a && !b) return;
    settings.update({ replayBrackets: [...(S().replayBrackets || []), { limit: a, stop: b }].slice(0, 12) });
    lim.value = ''; stp.value = '';
    fillBrackets(sel); draw();
  });
  const row = el('div', 'rp-presets__add');
  row.append(field('Limit exit, ticks', lim), field('Stop exit, ticks', stp), add);
  det.append(el('p', 'rp-p rp-note', 'A bracket places two exits when an entry fills: a limit that many ticks in your favour and a stop that many ticks against. When one fills, the other is cancelled. Leave one at 0 for a single exit.'), list, row);
  draw();
  return det;
}
function positionBox() {
  const box = el('section', 'rp-box glass glass--quiet');
  box.appendChild(el('h3', 'kicker rp-box__h', 'Position'));
  const body = el('div', 'rp-pos'); body.dataset.rpPos = '';
  const acts = el('div', 'rp-acts');
  acts.append(btn('Flatten', '', () => { st.engine.flatten(); refresh(); }), btn('Cancel all orders', '', () => { st.engine.cancelAll(); refresh(); }));
  box.append(body, acts);
  return box;
}
function ordersBox() {
  const box = el('section', 'rp-box glass glass--quiet');
  box.appendChild(el('h3', 'kicker rp-box__h', 'Working orders'));
  const body = el('div', 'rp-orders'); body.dataset.rpOrders = '';
  box.appendChild(body);
  return box;
}
function rulesBox() {
  const det = el('details', 'rp-box rp-rules glass glass--quiet');
  det.appendChild(el('summary', 'kicker rp-box__h', 'How fills are worked out'));
  det.append(
    el('p', 'rp-p', trades()
      ? 'This file has every trade, so orders fill trade by trade: a limit once a trade prints through its price (or touches it, if you choose), a stop at the trade that sets it off, plus slippage. Trades are only to the second, so trades within a second keep the file\'s order.'
      : 'Bars are one minute long, so the order of a bar\'s high and low is not known. A bar that closed at or above its open is taken to go open, low, high, close; one that closed below, open, high, low, close. Fills follow that path, so a bracket\'s outcome inside a single minute is an assumption.'),
    group('Limits fill', seg('Limit fills', [['through', 'Once traded through'], ['touch', 'On a touch']], S().replayFill || 'through', (v) => { settings.update({ replayFill: v }); st.engine.setRules({ fill: v }); })),
    el('p', 'rp-p rp-note', 'A trade at your limit price says nothing about where your order stood in the queue, so "once traded through" (a trade one tick beyond) is the default.'),
    group('Slippage on market and stop orders', seg('Slippage', [[0, '0'], [1, '1 tick'], [2, '2 ticks'], [4, '4 ticks']], S().replaySlip || 0, (v) => { settings.update({ replaySlip: +v }); st.engine.setRules({ slip: +v }); })),
    el('p', 'rp-p rp-note', 'Costs: ' + money(Number(S().costPerContract) || 0, { sign: false }) + ' per contract, round turn, from Settings, under Journal.'),
  );
  return det;
}

/* ------------------------------------------------------------ orders */

function place(o) {
  if (st.engine.state().atEnd) { say('This is the end of the file: there is nothing further to trade against.'); return; }
  const before = st.engine.state().orders.length;
  st.engine.place(o);
  const s = st.engine.state();
  const filled = o.type !== 'market' && s.orders.length <= before;
  say((o.side === 'buy' ? 'Buy ' : 'Sell ') + o.type + ', ' + count(o.qty, 'contract', 'contracts') + (o.type !== 'market' ? ' at ' + price(o.price) : '') + (o.bracket ? ', with a bracket' : '') + (filled ? '. It was already beyond the last price, so it filled at once.' : '.'));
  refresh();
}
function openMenu({ price: p, x, y, drawing }) {
  const m = st.menu, s = st.engine.state();
  const qty = Math.max(1, Math.floor(+(st.root.querySelector('[data-rp-qty]') || {}).value || 1));
  const br = bracketOf((st.root.querySelector('[data-rp-bracket]') || {}).value);
  const items = p === s.price ? [] : p < s.price ? [['Buy limit', 'buy', 'limit'], ['Sell stop', 'sell', 'stop']] : [['Sell limit', 'sell', 'limit'], ['Buy stop', 'buy', 'stop']];
  m.replaceChildren(el('p', 'kicker rp-menu__h', price(p) + (br ? ' · with a bracket' : '')));
  items.forEach(([text, side, type]) => {
    const b = el('button', 'rp-menu__item', text + ' ' + qty + ' at ' + price(p));
    b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => { closeMenu(); place({ side, type, price: p, qty, bracket: br }); });
    m.appendChild(b);
  });
  const hl = el('button', 'rp-menu__item', 'Horizontal line at ' + price(p));
  hl.type = 'button'; hl.setAttribute('role', 'menuitem');
  hl.addEventListener('click', () => { closeMenu(); addDrawing({ kind: 'h', price: p }); });
  m.appendChild(hl);
  if (drawing) {
    const rm = el('button', 'rp-menu__item', 'Remove this line');
    rm.type = 'button'; rm.setAttribute('role', 'menuitem');
    rm.addEventListener('click', () => { closeMenu(); setDrawings(drawings().filter((d) => d.id !== drawing)); });
    m.appendChild(rm);
  }
  const box = st.root.getBoundingClientRect();
  m.hidden = false;
  m.style.left = Math.min(x - box.left, box.width - 240) + 'px';
  m.style.top = (y - box.top) + 'px';
  const first = m.querySelector('button');
  if (first) first.focus();
}
function closeMenu() { if (st.menu) st.menu.hidden = true; }
function closeMenuOutside(e) { if (st.menu && !st.menu.hidden && !st.menu.contains(e.target)) closeMenu(); }

/* ------------------------------------------------------------ lines on the charts */

const drawings = () => (st.meta && st.draw.files[st.meta.id]) || [];
async function loadDraw() {
  if (st.drawLoaded || !isNative) { st.drawLoaded = true; return; }
  st.drawLoaded = true;
  try { const t = await invoke('replay_read_json', { name: 'draw' }); if (t) st.draw = JSON.parse(t); } catch (e) { st.draw = { files: {} }; }
  if (!st.draw.files) st.draw = { files: {} };
}
let drawTimer = null;
function setDrawings(list) {
  st.draw.files[st.meta.id] = list;
  if (drawTimer) clearTimeout(drawTimer);
  drawTimer = setTimeout(() => { drawTimer = null; if (isNative) invoke('replay_write_json', { name: 'draw', json: JSON.stringify(st.draw) }).catch(() => {}); }, 500);
  st.charts.forEach((c) => c.active && c.chart.draw());
}
function addDrawing(d) {
  const line = { ...d, id: 'd' + Math.random().toString(36).slice(2, 10), colour: S().replayLineColour || '' };
  setDrawings([...drawings(), line]);
  if (d.kind === 'trend') say('Trend line placed. Choose Cursor to select and move lines.');
}
function updateDrawing(d, done) {
  st.draw.files[st.meta.id] = drawings().map((x) => (x.id === d.id ? d : x));
  if (done) setDrawings(drawings()); else st.charts.forEach((c) => c.active && c.chart.draw());
}
function removeSelected() {
  if (!st.selected) { say('Click a line first to select it.'); return; }
  setDrawings(drawings().filter((d) => d.id !== st.selected));
  st.selected = null;
  st.charts.forEach((c) => { c.chart.selected = null; });
}
function recolourSelected(colour) { setDrawings(drawings().map((d) => (d.id === st.selected ? { ...d, colour } : d))); }

/* ------------------------------------------------------------ time */

function confirmRestart(sec) {
  const s = st.engine.state();
  if (s.position.qty || s.orders.length) {
    confirmBox('The open position is closed and the working orders cancelled at the last price, then the replay starts again from ' + when(sec) + '.', () => { st.engine.flatten(); refresh(); startAt(sec, false); }, 'Start again?');
    return;
  }
  startAt(sec, false);
}
function startAt(sec, quiet) {
  stop();
  const d = st.data;
  const key = trades() ? sec : Math.floor(sec / 60);
  const i = Math.max(0, R.lowerBound(d.t, d.n, key) - 1);
  st.engine.reset(i);
  const from = timeAt(Math.min(d.n - 1, i + 1));
  st.session = { id: crypto.randomUUID(), file: st.meta.id, fileName: st.meta.name, instrument: st.meta.instrument, kind: d.kind, startedAt: new Date().toISOString(), from, trades: [] };
  const date = st.root.querySelector('[data-rp-date]'), time = st.root.querySelector('[data-rp-time]');
  const et = R.toET(Math.floor(from / 60));
  if (date) date.value = new Date(Math.floor(et / 1440) * 864e5).toISOString().slice(0, 10);
  if (time) time.value = String(Math.floor((et % 1440) / 60)).padStart(2, '0') + ':' + String(et % 60).padStart(2, '0');
  st.charts.forEach((c) => c.chart.toPresent());
  refresh();
  say(quiet ? 'Press Play or the Right arrow to move forward. Right-click a chart to place an order or a line at that price.' : 'Replay starts at ' + when(from) + '. Press Play or the Right arrow; right-click a chart to place an order or a line there.');
}
function stepData(k) {
  for (let j = 0; j < k; j++) if (!st.engine.step()) { stop(); say('The end of the file.'); break; }
  refresh();
}
/* to the end of the minute now forming (trades), or the next one-minute bar */
function stepMinute() {
  if (!trades()) { stepData(1); return; }
  const s = st.engine.state(), m = st.base.of[s.cursor];
  const target = st.base.to[m] > s.cursor ? st.base.to[m] : (m + 1 < st.base.n ? st.base.to[m + 1] : st.data.n - 1);
  st.engine.advanceTo(target);
  refresh();
}
function stepChartBar() {
  const c = st.charts.find((x) => x.active) || st.charts[0];
  const tf = c.spec.tf;
  const A = agg(tf), s = st.engine.state();
  const curBase = trades() ? st.base.of[s.cursor] : s.cursor;
  const m = A.of[curBase];
  const endBase = A.to[m] > curBase || (trades() && st.base.to[curBase] > s.cursor) ? A.to[m] : (m + 1 < A.n ? A.to[m + 1] : st.base.n - 1);
  st.engine.advanceTo(trades() ? st.base.to[endBase] : endBase);
  refresh();
}
function start() {
  if (st.engine.state().atEnd) return;
  st.playing = true;
  const b = st.root.querySelector('[data-rp-play]');
  if (b) b.textContent = 'Pause';
  st.lastT = performance.now();
  st.simT = timeAt(st.engine.state().cursor);
  const tickFn = (now) => {
    if (!st.playing) return;
    const dt = Math.min(0.25, (now - st.lastT) / 1000);
    st.lastT = now;
    st.simT += dt * speed();
    const s = st.engine.state();
    const d = st.data;
    let i = s.cursor;
    /* across the daily break and weekends the clock jumps to the next print */
    if (i + 1 < d.n && timeAt(i + 1) - st.simT > 90) st.simT = Math.max(st.simT, timeAt(i + 1) - 1);
    let target = i;
    while (target + 1 < d.n && timeAt(target + 1) <= st.simT) target++;
    if (target > i) { st.engine.advanceTo(target); refresh(); }
    if (target >= d.n - 1) { stop(); say('The end of the file.'); return; }
    st.raf = requestAnimationFrame(tickFn);
  };
  st.raf = requestAnimationFrame(tickFn);
}
function stop() {
  st.playing = false;
  cancelAnimationFrame(st.raf);
  const b = st.root && st.root.querySelector('[data-rp-play]');
  if (b) b.textContent = 'Play';
}

/* ------------------------------------------------------------ what each chart draws */

function agg(tf) {
  const key = String(tf);
  if (!st.aggs.has(key)) {
    const A = R.aggregate(st.base, tf === 1 && st.base.base !== 1 ? st.base.base : tf);
    A.live = { t: A.t, o: Int32Array.from(A.o), h: Int32Array.from(A.h), l: Int32Array.from(A.l), c: Int32Array.from(A.c), v: Uint32Array.from(A.v), dl: A.dl ? Int32Array.from(A.dl) : null };
    st.aggs.set(key, A);
  }
  return st.aggs.get(key);
}
/* where the replay is now: the base bar forming and its values so far */
function now() {
  const s = st.engine.state();
  if (!trades()) return { s, curBase: s.cursor, part: null };
  const T = st.data, m = st.base.of[s.cursor];
  let o = T.p[st.base.from[m]], h = o, l = o, v = 0, dl = 0;
  for (let i = st.base.from[m]; i <= s.cursor; i++) { const p = T.p[i]; if (p > h) h = p; if (p < l) l = p; v += T.s[i]; dl += T.side[i] * T.s[i]; }
  return { s, curBase: m, part: { o, h, l, c: T.p[s.cursor], v, dl } };
}
function barsFor(tf, N) {
  const A = agg(tf), L = A.live, B = st.base;
  const m = A.of[N.curBase];
  if (A.lastM !== undefined && A.lastM !== m) {
    const k = A.lastM;
    L.o[k] = A.o[k]; L.h[k] = A.h[k]; L.l[k] = A.l[k]; L.c[k] = A.c[k]; L.v[k] = A.v[k];
    if (L.dl) L.dl[k] = A.dl[k];
  }
  A.lastM = m;
  let o = B.o[A.from[m]], h = -Infinity, l = Infinity, v = 0, dl = 0;
  for (let i = A.from[m]; i < N.curBase; i++) { if (B.h[i] > h) h = B.h[i]; if (B.l[i] < l) l = B.l[i]; v += B.v[i]; if (B.dl) dl += B.dl[i]; }
  const cur = N.part || { o: B.o[N.curBase], h: B.h[N.curBase], l: B.l[N.curBase], c: B.c[N.curBase], v: B.v[N.curBase], dl: B.dl ? B.dl[N.curBase] : 0 };
  if (A.from[m] === N.curBase) o = cur.o;
  L.o[m] = o; L.h[m] = Math.max(h, cur.h); L.l[m] = Math.min(l, cur.l); L.c[m] = cur.c; L.v[m] = v + cur.v;
  if (L.dl) L.dl[m] = dl + cur.dl;
  return { A, m, bars: { n: m + 1, t: L.t, o: L.o, h: L.h, l: L.l, c: L.c, v: L.v, dl: L.dl } };
}
/* the trades (or base bars) a run of chart bars covers, up to now */
function tradeRange(A, i0, i1, N) {
  const b0 = A.from[i0], b1 = Math.min(A.to[i1], N.curBase);
  return [st.base.from[b0], b1 === N.curBase ? N.s.cursor : st.base.to[b1]];
}
function cached(key, make) {
  let v = st.cache.get(key);
  if (v !== undefined) { st.cache.delete(key); st.cache.set(key, v); return v; }
  v = make();
  st.cache.set(key, v);
  if (st.cache.size > 1500) st.cache.delete(st.cache.keys().next().value);
  return v;
}
/* add one volume-at-price set to another */
function plus(a, b) {
  if (!a) return b; if (!b) return a;
  const lo = Math.min(a.lo, b.lo), hi = Math.max(a.lo + a.rows, b.lo + b.rows), rows = hi - lo;
  const out = { lo, rows, rowTicks: a.rowTicks, vol: new Float64Array(rows), buy: a.split ? new Float64Array(rows) : null, sell: a.split ? new Float64Array(rows) : null, split: a.split };
  for (const x of [a, b]) for (let r = 0; r < x.rows; r++) { const k = r + x.lo - lo; out.vol[k] += x.vol[r]; if (out.split) { out.buy[k] += x.buy[r]; out.sell[k] += x.sell[r]; } }
  return out;
}
function frameFor(c, N) {
  const spec = c.spec, tf = spec.tf;
  const { A, m, bars } = barsFor(tf, N);
  const tr = trades();
  const levels = (i0, i1, rowTicks) => {
    /* completed bars are kept; the bar forming now is added each time */
    if (tr) {
      const done = i1 >= m ? i1 - 1 : i1;
      const full = done >= i0 ? cached('p' + tf + ':' + i0 + ':' + done + ':' + rowTicks, () => { const [t0, t1] = tradeRange(A, i0, done, N); return R.levelsFromTrades(st.data, t0, t1, rowTicks); }) : null;
      if (i1 < m) return full;
      const [t0, t1] = tradeRange(A, m, m, N);
      return plus(full, R.levelsFromTrades(st.data, t0, t1, rowTicks));
    }
    const b0 = A.from[i0], b1 = Math.min(A.to[i1], N.curBase);
    const done = b1 - 1;
    const full = done >= b0 ? cached('b' + b0 + ':' + done + ':' + rowTicks, () => R.levelsFromBars(st.base, b0, done, rowTicks)) : null;
    return plus(full, R.levelsFromBars(st.base, b1, b1, rowTicks));
  };
  return {
    bars, tick: st.meta.tick, decimals: st.ins.decimals, canDelta: tr,
    footprint: tr ? (i, rowTicks) => (i < m ? cached('f' + tf + ':' + i + ':' + rowTicks, () => { const [t0, t1] = tradeRange(A, i, i, N); return R.levelsFromTrades(st.data, t0, t1, rowTicks); }) : (() => { const [t0, t1] = tradeRange(A, i, i, N); return R.levelsFromTrades(st.data, t0, t1, rowTicks); })()) : null,
    profile: levels,
    tpo: (sp) => tpoFor(sp, N),
  };
}
function tpoFor(sp, N) {
  const B = st.base, rth = sp.tpoRth !== false;
  if (!st.tpoCache.has(rth)) st.tpoCache.set(rth, R.sessionsOf(B, B.n, { rth }));
  const all = st.tpoCache.get(rth);
  /* the sessions that have begun by now */
  let lo = 0, hi = all.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (all[mid].from <= N.curBase) lo = mid + 1; else hi = mid; }
  const n = lo;
  const lastBar = N.part ? { o: N.part.o, h: N.part.h, l: N.part.l, c: N.part.c } : null;
  const opts = (open) => ({ period: sp.tpoPeriod || 30, rowTicks: sp.tpoRow || 20, last: open ? lastBar : null, lastIndex: open ? N.curBase : -1 });
  return {
    n,
    at(k) {
      const s = all[k], open = s.to >= N.curBase;
      const make = () => ({ ...R.tpoOf(B, s, opts(open)), dayET: rth ? s.startET : s.key * 1440 });
      return open ? make() : cached('tpo' + rth + ':' + sp.tpoPeriod + ':' + sp.tpoRow + ':' + s.key, make);
    },
  };
}

/* ------------------------------------------------------------ showing the state */

function onEngine(ev) {
  if (ev.kind === 'fill') {
    const o = ev.order;
    say((o.side === 'buy' ? 'Bought ' : 'Sold ') + ev.qty + ' at ' + price(ev.price) + (o.role === 'exit' ? (o.leg === 'limit' ? ', the bracket\'s limit exit' : o.leg === 'stop' ? ', the bracket\'s stop exit' : ', closing') : '') + ', ' + when(ev.at) + '.');
  }
}
function label(o) {
  return (o.side === 'buy' ? 'BUY ' : 'SELL ') + { limit: 'LMT', stop: 'STP', market: 'MKT' }[o.type] + ' ' + o.qty + (o.leg ? ' · bracket' : '');
}

let drawQueued = false;
function refresh() {
  if (!st.engine || !st.charts.length) return;
  const N = now(), s = N.s;
  const pos = s.position;
  const overlay = {
    orders: s.orders.map((o) => ({ id: o.id, side: o.side, type: o.type, price: o.price, qty: o.qty, label: label(o) })),
    position: pos.qty ? { qty: pos.qty, avg: pos.avg, label: (pos.qty > 0 ? 'LONG ' : 'SHORT ') + Math.abs(pos.qty) + ' · ' + signedTicks(s.open.ticks) } : null,
    markers: s.fills.map((f) => ({ t: f.t, price: f.price, side: f.side })),
  };
  for (const c of st.charts) {
    if (!c.active) continue;
    c.chart.setOverlay(overlay);
    c.chart.spec = c.spec;
    c.chart.setFrame(frameFor(c, N));
  }
  const clock = st.root.querySelector('[data-rp-clock]');
  if (clock) clock.textContent = 'Replay at ' + whenExact(timeAt(s.cursor)) + ' · last ' + price(s.price);
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; panel(); });
}
function panel() {
  const s = st.engine.state(), pos = s.position;
  const pb = st.root.querySelector('[data-rp-pos]');
  if (pb) {
    pb.replaceChildren();
    const row = (k, v, cls) => { const r = el('p', 'rp-kv'); r.append(el('span', 'rp-kv__k', k), el('span', 'rp-kv__v ' + (cls || ''), v)); pb.appendChild(r); };
    row('Position', pos.qty ? (pos.qty > 0 ? 'Long ' : 'Short ') + Math.abs(pos.qty) + ' at ' + price(pos.avg) : 'Flat');
    if (pos.qty) row('Open', signedTicks(s.open.ticks) + ' · ' + money(s.open.money), tone(s.open.money));
    row('Closed this session', money(s.realised.money) + ' · ' + count(s.trades.length, 'trade', 'trades'), tone(s.realised.money));
    if (s.realised.costs) row('Costs in that', money(-s.realised.costs));
  }
  const ob = st.root.querySelector('[data-rp-orders]');
  if (ob) {
    ob.replaceChildren();
    if (!s.orders.length) ob.appendChild(el('p', 'rp-p rp-note', 'None. Right-click a chart to place one at a price.'));
    s.orders.forEach((o) => {
      const r = el('div', 'rp-order');
      r.append(el('span', 'rp-order__l ' + (o.side === 'buy' ? 'rp-side--buy' : 'rp-side--sell'), label(o)), el('span', 'rp-order__p', price(o.price)), btn('Cancel', '', () => { st.engine.cancel(o.id); refresh(); }));
      ob.appendChild(r);
    });
  }
  tradesTable(s);
  record(s);
}
function readout(ch, i) {
  const b = ch.frame && ch.frame.bars, r = st.root.querySelector('[data-rp-read]');
  if (!b || !r || i < 0 || i >= b.n) return;
  r.textContent = when(b.t[i] * 60) + ' · O ' + price(b.o[i]) + '  H ' + price(b.h[i]) + '  L ' + price(b.l[i]) + '  C ' + price(b.c[i]) + '  V ' + int(b.v[i]) + (b.dl ? '  Δ ' + (b.dl[i] > 0 ? '+' : '') + int(b.dl[i]) : '');
}
function tradesTable(s) {
  const box = st.root.querySelector('[data-rp-trades]');
  if (!box) return;
  if (box.dataset.n === String(s.trades.length)) return;
  box.dataset.n = String(s.trades.length);
  box.replaceChildren();
  const head = el('div', 'ssec__head');
  head.append(el('h2', 'title ssec__title', 'This session'), el('p', 'ssec__sub', 'Practice trades from this replay, newest first. Simulated: none of these reached a market.'));
  box.appendChild(head);
  if (!s.trades.length) { box.appendChild(el('p', 'empty', 'No closed trades yet.')); return; }
  const wrap = el('div', 'bd-tablewrap');
  const t = el('table', 'tbl bd-tbl rp-tbl');
  const hr = el('tr');
  ['', 'Side', 'Contracts', 'Opened', 'Entry', 'Closed', 'Exit', 'Ticks', 'Result'].forEach((x, k) => { const th = el('th', k >= 2 && k !== 3 && k !== 5 ? 'r' : '', x); th.scope = 'col'; hr.appendChild(th); });
  const thead = el('thead'); thead.appendChild(hr);
  const tb = el('tbody');
  s.trades.slice().reverse().forEach((x, k) => {
    const tr = el('tr');
    [String(s.trades.length - k), x.side === 'long' ? 'Long' : 'Short', String(x.qty), whenET(x.entryAt), price(x.entry), whenET(x.exitAt), price(x.exit), signedTicks(x.ticks), money(x.money)]
      .forEach((v, j) => tr.appendChild(el('td', (j >= 2 && j !== 3 && j !== 5 ? 'r num ' : '') + (j >= 7 ? tone(x.money) : ''), v)));
    tb.appendChild(tr);
  });
  t.append(thead, tb);
  wrap.appendChild(t);
  const won = s.trades.filter((x) => x.money > 0).length;
  box.append(wrap, el('p', 'note', count(s.trades.length, 'trade', 'trades') + ', ' + won + ' with a gain; net ' + money(s.realised.money) + ' after ' + money(s.realised.costs, { sign: false }) + ' in costs. Practice, from past data.'));
}

/* ------------------------------------------------------------ the practice log */

let saveTimer = null;
function record(s) {
  if (!st.session || st.session.trades.length === s.trades.length) return;
  st.session.trades = s.trades.map((x) => ({ side: x.side, qty: x.qty, entry: x.entry * st.meta.tick, exit: x.exit * st.meta.tick, entryAt: x.entryAt, exitAt: x.exitAt, ticks: x.ticks, money: x.money, costs: x.costs }));
  const i = st.log.sessions.findIndex((x) => x.id === st.session.id);
  const copy = { ...st.session, unit: 'sec', updatedAt: new Date().toISOString() };
  if (i >= 0) st.log.sessions[i] = copy; else st.log.sessions.push(copy);
  st.log.sessions = st.log.sessions.slice(-300);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLog, 800);
  drawLog();
}
async function saveLog() {
  saveTimer = null;
  if (!isNative) return;
  try { await invoke('replay_write_json', { name: 'log', json: JSON.stringify(st.log) }); } catch (e) { say('The practice log could not be saved: ' + (e && e.message ? e.message : e)); }
}
async function loadLog() {
  if (st.logLoaded) return;
  st.logLoaded = true;
  if (!isNative) return;
  try { const text = await invoke('replay_read_json', { name: 'log' }); if (text) st.log = JSON.parse(text); } catch (e) { st.log = { sessions: [] }; }
  if (!Array.isArray(st.log.sessions)) st.log = { sessions: [] };
}
function drawLog() {
  const box = st.root && st.root.querySelector('[data-rp-log]');
  if (!box) return;
  box.replaceChildren();
  const done = st.log.sessions.filter((x) => x.trades && x.trades.length).slice().reverse();
  const head = el('div', 'ssec__head');
  head.append(el('h2', 'title ssec__title', 'Practice log'), el('p', 'ssec__sub', 'Every replay session with a closed trade, kept on this computer, apart from your journal.'));
  box.appendChild(head);
  if (!done.length) { box.appendChild(el('p', 'empty', 'Nothing yet.')); return; }
  const secs = (x, v) => (x.unit === 'sec' ? v : v * 60);
  const total = done.reduce((a, x) => a + x.trades.reduce((b, y) => b + y.money, 0), 0);
  const n = done.reduce((a, x) => a + x.trades.length, 0);
  box.appendChild(el('p', 'note', count(n, 'practice trade', 'practice trades') + ' over ' + count(done.length, 'session', 'sessions') + ', net ' + money(total) + '. Practice, from past data: not a record of real trading.'));
  const list = el('ul', 'rp-loglist');
  done.slice(0, 20).forEach((x) => {
    const net = x.trades.reduce((b, y) => b + y.money, 0);
    const li = el('li', 'rp-logrow');
    li.append(el('span', 'rp-logrow__k', x.instrument + ' from ' + whenET(secs(x, x.from))), el('span', 'kicker', count(x.trades.length, 'trade', 'trades') + ' · played ' + shortDateET(Date.parse(x.startedAt))), el('span', 'num ' + tone(net), money(net)));
    list.appendChild(li);
  });
  box.appendChild(list);
}

/* ------------------------------------------------------------ the page */

export async function renderReplay() {
  st.root = document.querySelector('[data-rp-root]');
  if (!st.root) return;
  await loadLog();
  if (st.engine && st.meta && st.root.querySelector('.rp-work')) { st.charts.forEach((c) => c.active && c.chart.size()); refresh(); drawLog(); return; }
  await R.loadIndex().catch(() => []);
  const want = S().replayFile, files = R.files();
  if (!files.length) {
    st.root.replaceChildren(loader(true));
    if (!isNative) st.root.appendChild(el('p', 'note', 'In the design preview, a loaded file lasts until the page reloads.'));
    return;
  }
  await openFile(files.some((f) => f.id === want) ? want : files[0].id);
  drawLog();
}

export function leaveReplay() { stop(); closeMenu(); }

/* Space plays and pauses, the Right arrow steps (with Shift, a chart bar),
   Delete removes the selected line, Escape stops drawing */
export function initReplay({ confirm }) {
  confirmBox = confirm;
  document.addEventListener('keydown', (e) => {
    const view = document.querySelector('.view[data-view="replay"]');
    if (!view || view.hidden || !st.engine) return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'SELECT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { closeMenu(); st.charts.forEach((c) => { c.chart.pending = null; c.chart.draw(); }); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && st.selected) { e.preventDefault(); removeSelected(); return; }
    if (e.key === ' ' && !(tg && tg.tagName === 'BUTTON')) { e.preventDefault(); st.playing ? stop() : start(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stop(); if (e.shiftKey) stepChartBar(); else if (trades()) stepData(1); else stepMinute(); }
  });
}
