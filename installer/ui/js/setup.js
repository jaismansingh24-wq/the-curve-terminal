/* Setup's interface. Every step shows what is really happening: the bar
   follows the bytes setup writes, the errors are setup's own, and in the
   design preview (no native side) nothing pretends to install. */

import { invoke, listen, isNative, currentWindow } from '../shared/js/native.js';
import { initTitlebar } from '../shared/js/titlebar.js';
import { applySky, SkyMotion } from '../shared/js/sky.js';
import { emblem, clamp, seg, eIO, ePop } from '../shared/js/mark.js';
import { LOADING_LINES, shuffled } from '../shared/js/lines.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let reduced = false;
try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* keep motion */ }
document.documentElement.classList.toggle('rm', reduced);

/* ------------------------------------------------------------ the sky */

applySky(true);
if (!reduced) new SkyMotion().start();

/* the mark draws itself once: ring, then curve, then the node */
function drawMark() {
  const cv = $('.art__mark');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = 150;
  cv.width = size * dpr; cv.height = size * dpr;
  const t0 = performance.now();
  function frame(now) {
    const t = reduced ? 1e9 : now - t0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    emblem(ctx, size / 2, size / 2, size * 0.46, {
      ring: eIO(seg(t, 150, 1050)),
      detail: 1,
      curve: eIO(seg(t, 700, 1350)),
      node: ePop(seg(t, 1250, 1500)),
    });
    if (t < 1600) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------- state */

const PREVIEW = {
  mode: /[?&]mode=uninstall/.test(location.search) ? 'uninstall' : 'install',
  version: '0.1.0',
  defaultDir: 'C:\\Users\\you\\AppData\\Local\\Programs\\The Curve Terminal',
  existingDir: null,
  hasApp: false,
  appSize: 0,
  startupOn: false,
};

let info = PREVIEW;
const opts = { dir: '', desktop: true, startMenu: true, startup: false, readme: true, launch: true, removeData: false };
let lastStep = 'welcome';

const mb = (n) => (n / 1048576).toFixed(1);

function announce(text) {
  const el = $('[data-announce]');
  if (el) el.textContent = text;
}

/* a double-click on one step's button must not press the next step's
   button in the same place: clicks wait a moment after each change */
let settleUntil = 0;

function show(name) {
  settleUntil = performance.now() + 450;
  $$('.step').forEach((s) => s.classList.toggle('is-on', s.dataset.step === name));
  const title = $('.step[data-step="' + name + '"] .step__title');
  if (title) { title.focus({ preventScroll: true }); announce(title.textContent); }
  const busy = name === 'working';
  const close = $('[data-win="close"]');
  if (close) close.disabled = busy;
}

function renderOpts() {
  $$('[data-opt]').forEach((sw) => sw.setAttribute('aria-checked', opts[sw.dataset.opt] ? 'true' : 'false'));
  $('#dir').value = opts.dir;
}

/* ---------------------------------------------------------- progress */

let rot = 0;
function startLines() {
  const el = $('[data-prog-line]');
  const lines = shuffled(LOADING_LINES);
  let i = 0;
  el.textContent = lines[0];
  clearInterval(rot);
  rot = setInterval(() => {
    if (reduced) { i = (i + 1) % lines.length; el.textContent = lines[i]; return; }
    el.classList.add('is-swap');
    setTimeout(() => { i = (i + 1) % lines.length; el.textContent = lines[i]; el.classList.remove('is-swap'); }, 260);
  }, 1600);
}

function progress(p) {
  const f = clamp(p.fraction || 0, 0, 1);
  $('[data-prog-fill]').style.transform = 'scaleX(' + f.toFixed(4) + ')';
  const pct = Math.round(f * 100);
  $('[data-prog-pct]').textContent = pct + '%';
  $('[data-prog-step]').textContent = p.step;
  $('[data-prog-bytes]').textContent = p.total && f < 0.81 ? mb(p.done) + ' of ' + mb(p.total) + ' MB' : '';
  const bar = $('.prog');
  bar.setAttribute('aria-valuenow', String(pct));
  bar.setAttribute('aria-valuetext', p.step + ', ' + pct + '%');
}
listen('setup-progress', progress);

/* ----------------------------------------------------------- actions */

async function install() {
  lastStep = 'options';
  progress({ step: 'Starting', fraction: 0 });
  $('[data-working-title]').textContent = info.mode === 'update' ? 'Updating' : 'Installing';
  $('[data-working-k]').textContent = 'Setup \u00B7 Step 3 of 3';
  show('working');
  startLines();
  try {
    if (!isNative) throw new Error('This is the design preview of setup. Nothing is installed from here.');
    const dir = await invoke('install', { opts: { dir: opts.dir, desktop: opts.desktop, startMenu: opts.startMenu, startup: opts.startup } });
    clearInterval(rot);
    showInstalled(dir);
  } catch (e) {
    clearInterval(rot);
    $('[data-error-text]').textContent = typeof e === 'string' ? e : (e && e.message) || 'Setup stopped without saying why.';
    show('error');
  }
}

async function remove() {
  lastStep = 'remove';
  progress({ step: 'Starting', fraction: 0 });
  $('[data-working-title]').textContent = 'Removing';
  $('[data-working-k]').textContent = 'Remove';
  show('working');
  startLines();
  try {
    if (!isNative) throw new Error('This is the design preview of setup. Nothing is removed from here.');
    await invoke('uninstall', { removeData: opts.removeData });
    clearInterval(rot);
    $('[data-done-title]').textContent = 'Removed';
    $('[data-done-lede]').textContent = 'The Curve Terminal has been removed from this computer.';
    $('[data-done-path]').textContent = '';
    $('[data-done-opts]').hidden = true;
    $('[data-count]').hidden = true;
    $('[data-finish-label]').textContent = 'Close';
    opts.launch = false; opts.readme = false;
    show('done');
  } catch (e) {
    clearInterval(rot);
    $('[data-error-text]').textContent = typeof e === 'string' ? e : (e && e.message) || 'Removal stopped without saying why.';
    show('error');
  }
}

async function pick() {
  if (!isNative) return;
  try {
    const p = await invoke('pick_folder', { current: opts.dir });
    if (p) { opts.dir = p; renderOpts(); }
  } catch (e) { /* the picker was closed */ }
}

/* ------------------------------------------------------ the end screen */

/* Installed: setup carries on by itself after 15 seconds, opening the app
   (and the readme, if chosen) and closing. Wait, or changing a choice,
   stops the countdown, so nobody is hurried past a decision. */
const COUNT = 15000;
let countTimer = 0, held = false;

function countText(sec) {
  if (held) return 'Waiting. Press Finish when you are ready.';
  const s = sec === 1 ? '1 second' : sec + ' seconds';
  if (opts.launch) return 'Opening The Curve Terminal in ' + s;
  if (opts.readme) return 'Opening the readme in ' + s;
  return 'Closing setup in ' + s;
}

function holdCount() {
  if (held) return;
  held = true;
  clearInterval(countTimer);
  $('[data-count]').classList.add('is-held');
  $('[data-count-text]').textContent = countText(0);
}

function startCount() {
  held = false;
  const box = $('[data-count]'), fill = $('[data-count-fill]'), text = $('[data-count-text]');
  box.hidden = false;
  box.classList.remove('is-held');
  const end = Date.now() + COUNT;
  let lastSec = -1;
  /* a timer rather than animation frames, so the countdown still runs if
     setup is minimised; the bar glides between ticks by a short transition */
  const tick = () => {
    if (held) return;
    const left = Math.max(0, end - Date.now());
    const sec = Math.ceil(left / 1000);
    /* with reduced motion the bar steps once a second instead of gliding */
    fill.style.transform = 'scaleX(' + (reduced ? sec / 15 : left / COUNT).toFixed(4) + ')';
    if (sec !== lastSec) { lastSec = sec; text.textContent = countText(sec); }
    if (left <= 0) {
      clearInterval(countTimer);
      if (isNative) finish();
      else text.textContent = 'Design preview: setup would carry on now.';
    }
  };
  clearInterval(countTimer);
  countTimer = setInterval(tick, 100);
  tick();
}

function showInstalled(dir) {
  $('[data-done-title]').textContent = info.mode === 'update' ? 'Updated' : 'Installed';
  $('[data-done-lede]').textContent = 'The Curve Terminal ' + info.version + ' is ready.';
  $('[data-done-path]').textContent = dir;
  show('done');
  announce('Installed. Setup carries on by itself in 15 seconds. Choose Wait to stay on this screen.');
  startCount();
}

function quit() { if (isNative) invoke('quit'); }

let finishing = false;
async function finish() {
  if (!isNative || finishing) return;
  finishing = true;
  clearInterval(countTimer);
  try {
    await invoke('finish', { launch: info.mode !== 'uninstall' && opts.launch, readme: info.mode !== 'uninstall' && opts.readme });
  } catch (e) {
    finishing = false;
    $('[data-error-text]').textContent = String(e);
    show('error');
  }
}

document.addEventListener('click', (e) => {
  if (performance.now() < settleUntil && e.target.closest('.step')) return;
  const sw = e.target.closest('[data-opt]');
  if (sw) {
    opts[sw.dataset.opt] = !opts[sw.dataset.opt];
    renderOpts();
    if (sw.closest('[data-step="done"]')) holdCount();
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  switch (b.dataset.act) {
    case 'cancel': quit(); break;
    case 'to-options': show('options'); break;
    case 'back': show('welcome'); break;
    case 'pick': pick(); break;
    case 'install': install(); break;
    case 'remove': remove(); break;
    case 'finish': finish(); break;
    case 'wait': holdCount(); break;
    case 'retry': if (lastStep === 'remove') remove(); else install(); break;
    case 'error-back': show(lastStep); break;
    default: break;
  }
});

document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['F3', 'F5', 'F7'].includes(e.key) || (e.ctrlKey && ['r', 'p', 'f', 'g', 'u', 'j', 's'].includes(k))) e.preventDefault();
});

/* -------------------------------------------------------------- start */

async function start() {
  initTitlebar($('.tb'));
  if (isNative) {
    try { info = await invoke('setup_info'); } catch (e) { info = PREVIEW; }
  }
  $$('[data-version]').forEach((el) => { el.textContent = info.version; });
  opts.dir = info.existingDir || info.defaultDir;
  opts.startup = !!info.startupOn;
  if (info.appSize) $('[data-size]').textContent = 'About ' + Math.max(1, Math.round(info.appSize / 1048576)) + ' MB';

  if (info.mode === 'uninstall') {
    $('[data-tb-name]').textContent = 'Remove';
    show('remove');
  } else {
    $('[data-tb-name]').textContent = 'Setup';
    if (info.mode === 'update') {
      $('[data-welcome-title]').textContent = 'Update The Curve Terminal';
      $('[data-welcome-lede]').textContent = 'It is already installed in ' + info.existingDir + '. Continue to update it to version ' + info.version + '. Your settings stay as they are.';
      $('[data-install-label]').textContent = 'Update';
    }
    show('welcome');
  }
  renderOpts();
  drawMark();
  /* design preview only: ?step=done shows the end screen */
  if (!isNative && /[?&]step=done/.test(location.search)) showInstalled(info.defaultDir);

  const w = currentWindow();
  if (w) { try { await w.show(); await w.setFocus(); } catch (e) { /* shown by Windows anyway */ } }
}

start();
