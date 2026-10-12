/* The Replay page: load a file of bars, choose where to start, then play
   the market forward bar by bar and practise orders against it.

   Every trade here is practice: simulated from past bars, never sent
   anywhere, labelled Practice wherever it shows, and kept in its own log,
   apart from the journal. The bars are the reader's own export; they stay
   on this computer, and their provider's terms apply to them. */

import * as R from './replay-data.js';
import { createEngine } from './replay-engine.js';
import { CandleChart } from './replay-chart.js';
import { INSTRUMENTS, get as instrument } from './instruments.js';
import * as settings from './settings.js';
import { invoke, isNative } from '../shared/js/native.js';
import { el, money, int } from './format.js';
import { timeBoth, timeET, shortDateET, ET } from './time.js';

const TFS = [[1, '1m'], [5, '5m'], [15, '15m'], [30, '30m'], [60, '1h'], [240, '4h'], ['D', '1D']];
const SPEEDS = [[1, '1×'], [2, '2×'], [5, '5×'], [15, '15×'], [60, '60×']];
const MINUS = '−';
const S = () => settings.get();

const st = {
  root: null, meta: null, data: null, ins: null, engine: null, chart: null,
  tf: 1, agg: null, live: null, playing: false, raf: 0, acc: 0, lastT: 0,
  session: null, menu: null, pending: null, log: { sessions: [] }, logLoaded: false,
};

/* ------------------------------------------------------------ small helpers */

const ms = (utcMin) => utcMin * 60000;
const when = (utcMin) => shortDateET(ms(utcMin)) + ', ' + timeBoth(ms(utcMin));
const whenET = (utcMin) => shortDateET(ms(utcMin)) + ', ' + timeET(ms(utcMin));
const count = (n, one, many) => int(n) + ' ' + (n === 1 ? one : many);
function price(ticks) {
  if (ticks === null || ticks === undefined || !Number.isFinite(ticks)) return '';
  const d = st.ins ? st.ins.decimals : 2;
  const p = ticks * st.meta.tick;
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
/* a labelled group of several controls: a div, so clicking the words presses nothing */
function group(label, node) { const f = el('div', 'tf rp-field'); f.setAttribute('role', 'group'); f.setAttribute('aria-label', label); f.append(el('span', 'kicker', label), node); return f; }
let confirmBox = null;
function say(text) { const s = st.root && st.root.querySelector('[data-rp-say]'); if (s) s.textContent = text; }

/* the instrument a file is for, from its name (ENQZ26 is NQ, EP is ES) */
function guessInstrument(name) {
  const base = String(name).toUpperCase().replace(/\.[A-Z0-9]+$/, '').replace(/^.*[\\/]/, '');
  if (/^EP[A-Z]\d/.test(base)) return 'ES';
  const s = base.replace(/^E(?=NQ|S)/, '');
  const codes = INSTRUMENTS.map((i) => i.code).sort((a, b) => b.length - a.length);
  return codes.find((c) => s.startsWith(c)) || 'NQ';
}

/* ------------------------------------------------------------ loading a file */

function loader(first) {
  const box = el('section', 'rp-load glass glass--quiet');
  box.appendChild(el('h2', 'title rp-load__h', first ? 'Load a file of bars' : 'Load another file'));
  box.appendChild(el('p', 'rp-p', 'An export of one-minute (or longer) bars from your platform: each line a date and time, then open, high, low, close and volume. MotiveWave\'s export (Data, Export) is read as it is. The bars stay on this computer: the app keeps a compact copy in its own folder and sends nothing anywhere. Your data provider\'s terms still apply to them.'));
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.txt,text/csv,text/plain';
  input.className = 'rp-file';
  const pick = btn('Choose a file', 'btn--primary', () => input.click());
  const status = el('p', 'rp-p rp-status', '');
  status.setAttribute('role', 'status');
  const next = el('div', 'rp-load__next');
  box.append(input, pick, status, next);
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    next.replaceChildren();
    status.textContent = 'Reading ' + file.name + ' (' + (file.size / 1048576).toFixed(1) + ' MB).';
    try {
      const text = await file.text();
      await new Promise((r) => setTimeout(r, 20));
      const p = R.parse(text);
      const base = R.barMinutes(p.wall);
      const zones = R.detectZone(p.wall, base);
      const best = zones[0];
      status.textContent = int(p.n) + ' bars of ' + base + ' minute' + (base === 1 ? '' : 's') + (p.bad ? ', and ' + int(p.bad) + ' lines that could not be read' : '') + '.';
      const zone = el('select', 'inp inp--sm');
      zones.forEach((z) => zone.appendChild(new Option(z.label + (z.of ? ' (break at 5:00 pm ET on ' + int(z.hits) + ' of ' + int(z.of) + ' days)' : ''), z.zone)));
      zone.value = best.zone;
      const ins = el('select', 'inp inp--sm');
      INSTRUMENTS.forEach((i) => ins.appendChild(new Option(i.code + ' · ' + i.name, i.code)));
      ins.value = guessInstrument(file.name);
      const stamp = el('select', 'inp inp--sm');
      stamp.append(new Option('When each bar opened', 'open'), new Option('When each bar closed', 'close'));
      stamp.value = best.stamping;
      const why = el('p', 'rp-p rp-note', best.hits && best.hits >= best.of * 0.8
        ? 'The times in this file read as ' + best.label + ': that puts its daily break at 5:00 pm ET, when CME stops trading for the hour, on ' + int(best.hits) + ' of ' + int(best.of) + ' days. Each time is ' + (best.stamping === 'open' ? 'when its bar opened' : 'when its bar closed') + '. Change these if you know otherwise.'
        : 'The daily 5:00 pm ET break could not be found in this file\'s times, so its time zone is a guess. Choose the zone your platform exported in.');
      const keepBtn = btn('Keep it and open', 'btn--primary', async () => {
        keepBtn.disabled = true;
        status.textContent = 'Preparing the bars.';
        try {
          const insObj = instrument(ins.value);
          const d = R.build(p, { zone: zone.value, stamping: stamp.value, base, tick: insObj.tick });
          const id = await R.keep({ name: file.name, instrument: insObj.code, tick: insObj.tick, zone: zone.value, stamping: stamp.value, base }, d);
          status.textContent = 'Kept.';
          await openFile(id);
        } catch (e) {
          status.textContent = String(e && e.message ? e.message : e);
          keepBtn.disabled = false;
        }
      });
      next.append(
        el('div', 'rp-row', null),
        why, keepBtn,
      );
      next.firstChild.append(field('Instrument', ins), field('Times are in', zone), field('Each time is', stamp));
      next.insertBefore(el('p', 'rp-p rp-note', 'From ' + new Date(Date.UTC(1970, 0, 1) + p.wall[0] * 60000).toISOString().slice(0, 16).replace('T', ' ') + ' to ' + new Date(p.wall[p.n - 1] * 60000).toISOString().slice(0, 16).replace('T', ' ') + ', as written in the file.'), why);
    } catch (e) {
      status.textContent = String(e && e.message ? e.message : e);
    }
  });
  return box;
}

/* ------------------------------------------------------------ the workspace */

async function openFile(id) {
  stop();
  const meta = R.files().find((f) => f.id === id);
  if (!meta) return;
  st.root.replaceChildren(el('p', 'note', 'Opening ' + meta.name + '.'));
  try {
    st.data = await R.open(id);
  } catch (e) {
    st.root.replaceChildren(el('p', 'empty', String(e && e.message ? e.message : e)), loader(false));
    return;
  }
  st.meta = meta;
  st.ins = instrument(meta.instrument) || { code: meta.instrument, tick: meta.tick, tickValue: 1, decimals: 2, name: meta.instrument };
  settings.update({ replayFile: id });
  st.engine = createEngine({
    data: st.data, tickValue: st.ins.tickValue, commission: Number(S().costPerContract) || 0,
    rules: { fill: S().replayFill || 'through', slip: Number(S().replaySlip) || 0 },
    onEvent: onEngine,
  });
  workspace();
  setTf(S().replayTf || 1, true);
  const start = defaultStart();
  startAt(start, true);
}

function defaultStart() {
  const d = st.data;
  /* 9:30 am ET, ten trading days before the end of the file */
  const lastET = R.toET(d.t[d.n - 1]);
  let day = Math.floor(lastET / 1440) - 14;
  const wd = new Date(day * 864e5).getUTCDay();
  if (wd === 0) day += 1; if (wd === 6) day += 2;
  const at = R.wallToUtc(day * 1440 + 9 * 60 + 30, ET);
  return at > d.t[0] + 1440 ? at : d.t[Math.min(d.n - 1, R.indexAt(d, d.t[0] + 1440))];
}

function workspace() {
  const root = st.root;
  root.replaceChildren();
  const d = st.data, meta = st.meta;

  /* the file, the timeframe and where to start */
  const top = el('div', 'rp-bar');
  const fileSel = el('select', 'inp inp--sm');
  R.files().forEach((f) => fileSel.appendChild(new Option(f.name + ' · ' + f.instrument, f.id)));
  fileSel.value = meta.id;
  fileSel.addEventListener('change', () => openFile(fileSel.value));
  const date = el('input', 'inp inp--sm');
  date.type = 'date';
  const time = el('input', 'inp inp--sm');
  time.type = 'time';
  time.step = 60;
  date.min = isoDay(d.t[0]);
  date.max = isoDay(d.t[d.n - 1]);
  date.dataset.rpDate = '';
  time.dataset.rpTime = '';
  top.append(
    field('File', fileSel),
    group('Timeframe', seg('Timeframe', TFS, S().replayTf || 1, (v) => setTf(v))),
    group('Start (New York time)', wrapRow(date, time, btn('Start here', 'btn--primary', () => {
      if (!date.value) return;
      const [y, m, dd] = date.value.split('-').map(Number);
      const [hh, mi] = (time.value || '09:30').split(':').map(Number);
      confirmRestart(R.wallToUtc(Date.UTC(y, m - 1, dd, hh, mi) / 60000, ET));
    }), btn('A random day', '', () => confirmRestart(randomStart())))),
  );
  const more = el('div', 'rp-files');
  more.append(btn('Load another file', '', () => { stop(); st.root.replaceChildren(loader(false), backLink()); }),
    btn('Remove this file', '', () => {
      stop();
      confirmBox(meta.name + ', with ' + int(meta.n) + ' bars. Only the app\'s copy is removed; your export is not touched. The practice log keeps its trades.', async () => {
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
  const step1 = btn('Next bar', '', () => { stop(); stepBars(1); }, 'Next one-minute bar (Right arrow)');
  const stepTf = btn('Next ' + 'chart bar', '', () => { stop(); stepChartBar(); }, 'Next chart bar (Shift and Right arrow)');
  const clock = el('p', 'rp-clock');
  clock.dataset.rpClock = '';
  ctl.append(play, step1, stepTf, group('Speed', seg('Speed', SPEEDS, S().replaySpeed || 5, (v) => settings.update({ replaySpeed: +v }))), clock, el('span', 'simtag rp-tag', 'Practice'));

  /* the chart, and the panel beside it */
  const work = el('div', 'rp-work');
  const chartBox = el('div', 'rp-chart');
  const cv = document.createElement('canvas');
  cv.className = 'rp-canvas';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Candlestick chart of the replay, up to its present');
  const menu = el('div', 'rp-menu glass');
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  chartBox.append(cv, menu);
  st.menu = menu;
  const read = el('p', 'rp-read');
  read.dataset.rpRead = '';
  const side = el('aside', 'rp-side');
  side.append(ticket(), positionBox(), ordersBox(), rulesBox());
  const left = el('div', 'rp-left');
  left.append(chartBox, read);
  work.append(left, side);

  const sayLine = el('p', 'note rp-say');
  sayLine.dataset.rpSay = '';
  sayLine.setAttribute('role', 'status');

  const tradesBox = el('section', 'rp-trades');
  tradesBox.dataset.rpTrades = '';
  const logBox = el('section', 'rp-log');
  logBox.dataset.rpLog = '';

  root.append(top, more, ctl, sayLine, work, tradesBox, logBox,
    el('p', 'note rp-roll', 'If this file joins several contract months (a continuous series), prices jump at each roll, when it moves to the next contract. Replay shows the bars as the file has them, jumps included.'));

  st.chart = new CandleChart(cv, {
    onContext: (p, x, y) => openMenu(p, x, y),
    onOrderMove: (id, p) => { st.engine.modify(id, p); refresh(); },
    onOrderCancel: (id) => { st.engine.cancel(id); refresh(); },
    onHover: (i) => readout(i),
  });
  document.addEventListener('mousedown', closeMenuOutside);
}
function wrapRow(...nodes) { const r = el('span', 'rp-inline'); r.append(...nodes); return r; }
function backLink() { return btn('Back to the replay', '', () => (st.meta ? openFile(st.meta.id) : renderReplay())); }
const isoDay = (utc) => { const et = R.toET(utc); return new Date(Math.floor(et / 1440) * 864e5).toISOString().slice(0, 10); };
function randomStart() {
  const d = st.data;
  const a = Math.floor(R.toET(d.t[0]) / 1440) + 3, b = Math.floor(R.toET(d.t[d.n - 1]) / 1440) - 1;
  for (let k = 0; k < 50; k++) {
    const day = a + Math.floor(Math.random() * Math.max(1, b - a));
    const wd = new Date(day * 864e5).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    return R.wallToUtc(day * 1440 + 9 * 60 + 30, ET);
  }
  return defaultStart();
}

/* ------------------------------------------------------------ the panel */

function ticket() {
  const box = el('section', 'rp-box glass glass--quiet');
  box.appendChild(el('h3', 'kicker rp-box__h', 'Order'));
  const qty = el('input', 'inp inp--sm rp-qty');
  qty.type = 'number'; qty.min = 1; qty.step = 1; qty.value = S().replayQty || 1;
  qty.addEventListener('change', () => { qty.value = Math.max(1, Math.floor(+qty.value || 1)); settings.update({ replayQty: +qty.value }); });
  qty.dataset.rpQty = '';
  const brSel = el('select', 'inp inp--sm');
  brSel.dataset.rpBracket = '';
  fillBrackets(brSel);
  const priceIn = el('input', 'inp inp--sm');
  priceIn.inputMode = 'decimal';
  priceIn.placeholder = 'Price';
  priceIn.dataset.rpPrice = '';
  const kind = el('select', 'inp inp--sm');
  kind.append(new Option('Limit', 'limit'), new Option('Stop', 'stop'));
  const q = () => Math.max(1, Math.floor(+qty.value || 1));
  const br = () => bracketOf(brSel.value);
  const at = () => { const v = Number(String(priceIn.value).replace(/,/g, '')); return Number.isFinite(v) && v > 0 ? Math.round(v / st.meta.tick) : null; };
  const placeAt = (side) => {
    const p = at();
    if (p === null) { say('Type a price for the ' + kind.value + ' order first, or right-click the chart at the price you want.'); return; }
    place({ side, type: kind.value, price: p, qty: q(), bracket: br() });
  };
  const grid = el('div', 'rp-ticket');
  grid.append(
    field('Contracts', qty), field('Bracket', brSel),
    el('span', 'rp-span kicker', 'At the last price'),
    btn('Buy market', 'btn--quiet rp-buy', () => place({ side: 'buy', type: 'market', qty: q(), bracket: br() })),
    btn('Sell market', 'btn--quiet rp-sell', () => place({ side: 'sell', type: 'market', qty: q(), bracket: br() })),
    el('span', 'rp-span kicker', 'At a price'),
    field('Type', kind), field('Price', priceIn),
    btn('Buy', 'btn--quiet rp-buy', () => placeAt('buy')),
    btn('Sell', 'btn--quiet rp-sell', () => placeAt('sell')),
  );
  box.appendChild(grid);
  box.appendChild(presetEditor(brSel));
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
        const next = (S().replayBrackets || []).filter((_, k) => k !== i);
        settings.update({ replayBrackets: next });
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
  const body = el('div', 'rp-pos');
  body.dataset.rpPos = '';
  const acts = el('div', 'rp-acts');
  acts.append(btn('Flatten', '', () => { st.engine.flatten(); refresh(); }), btn('Cancel all orders', '', () => { st.engine.cancelAll(); refresh(); }));
  box.append(body, acts);
  return box;
}
function ordersBox() {
  const box = el('section', 'rp-box glass glass--quiet');
  box.appendChild(el('h3', 'kicker rp-box__h', 'Working orders'));
  const body = el('div', 'rp-orders');
  body.dataset.rpOrders = '';
  box.appendChild(body);
  return box;
}
function rulesBox() {
  const det = el('details', 'rp-box rp-rules glass glass--quiet');
  det.appendChild(el('summary', 'kicker rp-box__h', 'How fills are worked out'));
  det.append(
    el('p', 'rp-p', 'Bars are one minute long, so the order of a bar\'s high and low is not known. A bar that closed at or above its open is taken to go open, low, high, close; one that closed below, open, high, low, close. Fills follow that path, so a bracket\'s outcome inside a single minute is an assumption.'),
    group('Limits fill', seg('Limit fills', [['through', 'Once traded through'], ['touch', 'On a touch']], S().replayFill || 'through', (v) => { settings.update({ replayFill: v }); st.engine.setRules({ fill: v }); })),
    el('p', 'rp-p rp-note', 'Touching a limit says nothing about where your order stood in the queue, so "once traded through" (one tick beyond) is the default.'),
    group('Slippage on market and stop orders', seg('Slippage', [[0, '0'], [1, '1 tick'], [2, '2 ticks'], [4, '4 ticks']], S().replaySlip || 0, (v) => { settings.update({ replaySlip: +v }); st.engine.setRules({ slip: +v }); })),
    el('p', 'rp-p rp-note', 'Costs: ' + money(Number(S().costPerContract) || 0, { sign: false }) + ' per contract, round turn, from Settings, under Journal.'),
  );
  return det;
}

/* ------------------------------------------------------------ placing orders */

function place(o) {
  if (st.engine.state().atEnd) { say('This is the end of the file: there are no more bars to trade against.'); return; }
  const od = st.engine.place(o);
  const typeText = { market: 'market', limit: 'limit', stop: 'stop' }[o.type];
  say((o.side === 'buy' ? 'Buy ' : 'Sell ') + typeText + ', ' + o.qty + (o.qty === 1 ? ' contract' : ' contracts') + (o.type !== 'market' ? ' at ' + price(o.price) : '') + (o.bracket ? ', with a bracket' : '') + (od && !st.engine.state().orders.find((x) => x.id === od.id) && o.type !== 'market' ? '. It was already beyond the last price, so it filled at once.' : '.'));
  refresh();
}

function openMenu(p, x, y) {
  const m = st.menu, s = st.engine.state();
  const qty = Math.max(1, Math.floor(+(st.root.querySelector('[data-rp-qty]') || {}).value || 1));
  const br = bracketOf((st.root.querySelector('[data-rp-bracket]') || {}).value);
  const below = p < s.price;
  const items = p === s.price ? [] : below
    ? [['Buy limit', 'buy', 'limit'], ['Sell stop', 'sell', 'stop']]
    : [['Sell limit', 'sell', 'limit'], ['Buy stop', 'buy', 'stop']];
  m.replaceChildren(el('p', 'kicker rp-menu__h', price(p) + (br ? ' · with a bracket' : '')));
  items.forEach(([text, side, type]) => {
    const b = el('button', 'rp-menu__item', text + ' ' + qty + ' at ' + price(p));
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => { closeMenu(); place({ side, type, price: p, qty, bracket: type === 'limit' || type === 'stop' ? br : null }); });
    m.appendChild(b);
  });
  if (!items.length) m.appendChild(el('p', 'rp-p rp-note', 'That is the last price. Right-click above or below it.'));
  const box = m.parentElement.getBoundingClientRect();
  m.hidden = false;
  m.style.left = Math.min(x - box.left, box.width - 230) + 'px';
  m.style.top = Math.min(y - box.top, box.height - 120) + 'px';
  const first = m.querySelector('button');
  if (first) first.focus();
}
function closeMenu() { if (st.menu) st.menu.hidden = true; }
function closeMenuOutside(e) { if (st.menu && !st.menu.hidden && !st.menu.contains(e.target)) closeMenu(); }

/* ------------------------------------------------------------ time */

function confirmRestart(utc) {
  const s = st.engine.state();
  if (s.position.qty || s.orders.length) {
    confirmBox('The open position is closed and the working orders cancelled at the last price, then the replay starts again from ' + when(utc) + '.', () => { st.engine.flatten(); refresh(); startAt(utc, false); }, 'Start again?');
    return;
  }
  startAt(utc, false);
}
function startAt(utc, quiet) {
  stop();
  const d = st.data;
  const i = Math.max(0, R.indexAt(d, utc) - 1);
  st.engine.reset(i);
  st.session = { id: crypto.randomUUID(), file: st.meta.id, fileName: st.meta.name, instrument: st.meta.instrument, startedAt: new Date().toISOString(), from: d.t[Math.min(d.n - 1, i + 1)], trades: [] };
  const date = st.root.querySelector('[data-rp-date]'), time = st.root.querySelector('[data-rp-time]');
  const et = R.toET(d.t[Math.min(d.n - 1, i + 1)]);
  if (date) date.value = new Date(Math.floor(et / 1440) * 864e5).toISOString().slice(0, 10);
  if (time) time.value = String(Math.floor((et % 1440) / 60)).padStart(2, '0') + ':' + String(et % 60).padStart(2, '0');
  st.chart.toPresent();
  rebuildLive();
  refresh();
  if (!quiet) say('Replay starts at ' + when(d.t[Math.min(d.n - 1, i + 1)]) + '. Press Play or the Right arrow; right-click the chart to place a limit or stop at that price.');
  else say('Press Play or the Right arrow to move forward. Right-click the chart to place a limit or stop at that price.');
}

function stepBars(k) {
  for (let j = 0; j < k; j++) if (!st.engine.step()) { stop(); say('The end of the file.'); break; }
  refresh();
}
function stepChartBar() {
  if (st.tf === st.data.base) { stepBars(1); return; }
  const s = st.engine.state();
  const m = st.agg.of[s.cursor];
  const target = m + 1 < st.agg.n ? st.agg.to[m + 1] : st.data.n - 1;
  /* the end of the next chart bar, or of this one if it is still forming */
  const end = st.agg.to[m] > s.cursor ? st.agg.to[m] : target;
  st.engine.advanceTo(end);
  refresh();
}
function start() {
  if (st.engine.state().atEnd) return;
  st.playing = true;
  const b = st.root.querySelector('[data-rp-play]');
  if (b) b.textContent = 'Pause';
  st.lastT = performance.now();
  st.acc = 0;
  const tickFn = (now) => {
    if (!st.playing) return;
    st.acc += ((now - st.lastT) / 1000) * (S().replaySpeed || 5);
    st.lastT = now;
    const k = Math.floor(st.acc);
    if (k > 0) { st.acc -= k; stepBars(k); }
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

/* ------------------------------------------------------------ the chart's bars */

function setTf(v, quiet) {
  st.tf = v === 'D' ? 'D' : +v;
  if (!quiet) settings.update({ replayTf: st.tf });
  st.agg = R.aggregate(st.data, st.tf === 1 && st.data.base !== 1 ? st.data.base : st.tf);
  rebuildLive();
  refresh();
}
function rebuildLive() {
  if (!st.agg) return;
  const a = st.agg;
  st.live = a.from && a !== st.data && st.tf !== st.data.base
    ? { t: a.t, o: Int32Array.from(a.o), h: Int32Array.from(a.h), l: Int32Array.from(a.l), c: Int32Array.from(a.c), v: Uint32Array.from(a.v) }
    : null;
}
function chartBars() {
  const s = st.engine.state(), d = st.data;
  if (!st.live) return { n: s.cursor + 1, t: d.t, o: d.o, h: d.h, l: d.l, c: d.c, v: d.v };
  const a = st.agg, L = st.live;
  const m = a.of[s.cursor];
  let hi = -Infinity, lo = Infinity, vol = 0;
  for (let i = a.from[m]; i <= s.cursor; i++) { if (d.h[i] > hi) hi = d.h[i]; if (d.l[i] < lo) lo = d.l[i]; vol += d.v[i]; }
  L.o[m] = d.o[a.from[m]]; L.h[m] = hi; L.l[m] = lo; L.c[m] = d.c[s.cursor]; L.v[m] = vol;
  return { n: m + 1, t: L.t, o: L.o, h: L.h, l: L.l, c: L.c, v: L.v };
}

/* ------------------------------------------------------------ showing the state */

function onEngine(ev) {
  if (ev.kind === 'fill') {
    const o = ev.order;
    say((o.side === 'buy' ? 'Bought ' : 'Sold ') + ev.qty + ' at ' + price(ev.price) + (o.role === 'exit' ? (o.leg === 'limit' ? ', the bracket\'s limit exit' : o.leg === 'stop' ? ', the bracket\'s stop exit' : ', closing') : '') + ', ' + when(ev.at) + '.');
  }
}

function label(o) {
  const type = { limit: 'LMT', stop: 'STP', market: 'MKT' }[o.type];
  return (o.side === 'buy' ? 'BUY ' : 'SELL ') + type + ' ' + o.qty + (o.leg ? ' · bracket' : '');
}

function refresh() {
  if (!st.engine || !st.chart) return;
  const s = st.engine.state();
  const bars = chartBars();
  st.chart.setBars(bars, { tick: st.meta.tick, decimals: st.ins.decimals, day: st.tf === 'D' });
  const pos = s.position;
  st.chart.setOverlay({
    orders: s.orders.map((o) => ({ id: o.id, side: o.side, type: o.type, price: o.price, qty: o.qty, label: label(o) })),
    position: pos.qty ? { qty: pos.qty, avg: pos.avg, label: (pos.qty > 0 ? 'LONG ' : 'SHORT ') + Math.abs(pos.qty) + ' · ' + signedTicks(s.open.ticks) } : null,
    markers: s.fills.map((f) => ({ t: f.t, price: f.price, side: f.side })),
  });
  const clock = st.root.querySelector('[data-rp-clock]');
  if (clock) clock.textContent = 'Replay at ' + when(st.data.t[s.cursor]) + ' · last ' + price(s.price);
  /* position */
  const pb = st.root.querySelector('[data-rp-pos]');
  if (pb) {
    pb.replaceChildren();
    const row = (k, v, cls) => { const r = el('p', 'rp-kv'); r.append(el('span', 'rp-kv__k', k), el('span', 'rp-kv__v ' + (cls || ''), v)); pb.appendChild(r); };
    row('Position', pos.qty ? (pos.qty > 0 ? 'Long ' : 'Short ') + Math.abs(pos.qty) + ' at ' + price(pos.avg) : 'Flat');
    if (pos.qty) row('Open', signedTicks(s.open.ticks) + ' · ' + money(s.open.money), tone(s.open.money));
    row('Closed this session', money(s.realised.money) + ' · ' + s.trades.length + (s.trades.length === 1 ? ' trade' : ' trades'), tone(s.realised.money));
    if (s.realised.costs) row('Costs in that', money(-s.realised.costs));
  }
  /* working orders */
  const ob = st.root.querySelector('[data-rp-orders]');
  if (ob) {
    ob.replaceChildren();
    if (!s.orders.length) ob.appendChild(el('p', 'rp-p rp-note', 'None. Right-click the chart to place one at a price.'));
    s.orders.forEach((o) => {
      const r = el('div', 'rp-order');
      r.append(el('span', 'rp-order__l ' + (o.side === 'buy' ? 'rp-side--buy' : 'rp-side--sell'), label(o)), el('span', 'rp-order__p', price(o.price)),
        btn('Cancel', '', () => { st.engine.cancel(o.id); refresh(); }));
      ob.appendChild(r);
    });
  }
  trades(s);
  record(s);
}

function readout(i) {
  const b = st.chart.bars, r = st.root.querySelector('[data-rp-read]');
  if (!b || !r || i < 0 || i >= b.n) return;
  r.textContent = when(b.t[i]) + ' · O ' + price(b.o[i]) + '  H ' + price(b.h[i]) + '  L ' + price(b.l[i]) + '  C ' + price(b.c[i]) + '  V ' + int(b.v[i]);
}

function trades(s) {
  const box = st.root.querySelector('[data-rp-trades]');
  if (!box) return;
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
    const cells = [String(s.trades.length - k), x.side === 'long' ? 'Long' : 'Short', String(x.qty), whenET(x.entryAt), price(x.entry), whenET(x.exitAt), price(x.exit), signedTicks(x.ticks), money(x.money)];
    cells.forEach((v, j) => tr.appendChild(el('td', (j >= 2 && j !== 3 && j !== 5 ? 'r num ' : '') + (j === 8 || j === 7 ? tone(x.money) : ''), v)));
    tb.appendChild(tr);
  });
  t.append(thead, tb);
  wrap.appendChild(t);
  const won = s.trades.filter((x) => x.money > 0).length;
  box.append(wrap, el('p', 'note', count(s.trades.length, 'trade', 'trades') + ', ' + won + ' with a gain; net ' + money(s.realised.money) + ' after ' + money(s.realised.costs, { sign: false }) + ' in costs. Practice, from past bars.'));
}

/* ------------------------------------------------------------ the practice log */

let saveTimer = null;
function record(s) {
  if (!st.session) return;
  if (st.session.trades.length === s.trades.length) return;
  st.session.trades = s.trades.map((x) => ({ side: x.side, qty: x.qty, entry: x.entry * st.meta.tick, exit: x.exit * st.meta.tick, entryAt: x.entryAt, exitAt: x.exitAt, ticks: x.ticks, money: x.money, costs: x.costs }));
  const i = st.log.sessions.findIndex((x) => x.id === st.session.id);
  const copy = { ...st.session, updatedAt: new Date().toISOString() };
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
  const total = done.reduce((a, x) => a + x.trades.reduce((b, y) => b + y.money, 0), 0);
  const n = done.reduce((a, x) => a + x.trades.length, 0);
  box.appendChild(el('p', 'note', count(n, 'practice trade', 'practice trades') + ' over ' + count(done.length, 'session', 'sessions') + ', net ' + money(total) + '. Practice, from past bars: not a record of real trading.'));
  const list = el('ul', 'rp-loglist');
  done.slice(0, 20).forEach((x) => {
    const net = x.trades.reduce((b, y) => b + y.money, 0);
    const li = el('li', 'rp-logrow');
    li.append(el('span', 'rp-logrow__k', x.instrument + ' from ' + whenET(x.from)), el('span', 'kicker', count(x.trades.length, 'trade', 'trades') + ' · played ' + shortDateET(Date.parse(x.startedAt))), el('span', 'num ' + tone(net), money(net)));
    list.appendChild(li);
  });
  box.appendChild(list);
}

/* ------------------------------------------------------------ the page */

export async function renderReplay() {
  st.root = document.querySelector('[data-rp-root]');
  if (!st.root) return;
  await loadLog();
  if (st.engine && st.meta && st.root.querySelector('.rp-work')) { st.chart && st.chart.size(); refresh(); drawLog(); return; }
  await R.loadIndex().catch(() => []);
  const want = S().replayFile;
  const files = R.files();
  if (!files.length) {
    st.root.replaceChildren(loader(true));
    if (!isNative) st.root.appendChild(el('p', 'note', 'In the design preview, a loaded file lasts until the page reloads.'));
    return;
  }
  await openFile(files.some((f) => f.id === want) ? want : files[0].id);
  drawLog();
}

export function leaveReplay() { stop(); closeMenu(); }

/* Space plays and pauses, the Right arrow steps (with Shift, a chart bar) */
export function initReplay({ confirm }) {
  confirmBox = confirm;
  document.addEventListener('keydown', (e) => {
    const view = document.querySelector('.view[data-view="replay"]');
    if (!view || view.hidden || !st.engine) return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'SELECT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key === ' ' && !(tg && tg.tagName === 'BUTTON')) { e.preventDefault(); st.playing ? stop() : start(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stop(); if (e.shiftKey) stepChartBar(); else stepBars(1); }
  });
}
