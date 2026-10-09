/* The app's start-up, in order: settings and the title bar straight away,
   then the window is shown and the opening plays while the real start-up
   steps run under the loading bar. */

import * as settings from './settings.js';
import * as presence from './presence.js';
import { initTitlebar } from '../shared/js/titlebar.js';
import { invoke, isNative, currentWindow, openLink } from '../shared/js/native.js';
import { get as sget, set as sset } from '../shared/js/store.js';
import { skyData } from '../shared/js/sky.js';
import { createLoader } from './loader.js';
import { runIntro } from './intro.js';
import { startClock } from './clock.js';
import { initDialogs } from './dialogs.js';

const S = settings.load();
settings.apply();

let version = '0.1.0';
let ready = false;

/* --------------------------------------------------------------- wiring */

initTitlebar(document.querySelector('.tb'));

startClock({
  et: document.querySelector('[data-clock-et]'),
  local: document.querySelector('[data-clock-local]'),
  date: document.querySelector('[data-date]'),
  greet: document.querySelector('[data-greet]'),
});

const dialogs = initDialogs({
  onOpen(name) {
    if (name === 'whatsnew') { sset('seen', version); markNew(); }
  },
});

settings.bindPanel(document.getElementById('dlg-settings'));
settings.onChange((s, patch) => { if ('discord' in patch) presence.configure(s.discord); });
presence.bindUI();

document.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () => openLink(b.dataset.link)));

/* the title bar gains a hairline once the page scrolls under it */
const page = document.getElementById('page');
const bar = document.querySelector('.tb');
page.addEventListener('scroll', () => bar.classList.toggle('is-scrolled', page.scrollTop > 4), { passive: true });

/* What's new carries a small dot until this version's notes are opened */
function markNew() {
  const fresh = sget('seen') !== version;
  document.querySelectorAll('[data-open="whatsnew"]').forEach((b) => {
    b.classList.toggle('is-new', fresh);
    b.setAttribute('aria-label', fresh ? "What's new, unread" : "What's new");
  });
}

/* ------------------------------------------------------------ keyboard */

const BLOCKED = new Set(['F3', 'F5', 'F7']);
document.addEventListener('keydown', (e) => {
  /* the browser's own shortcuts mean nothing in an app window */
  const k = e.key.toLowerCase();
  if (BLOCKED.has(e.key) || (e.ctrlKey && ['r', 'p', 'f', 'g', 'u', 'j', 's'].includes(k))) { e.preventDefault(); return; }

  if (!ready || document.querySelector('dialog[open]')) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

  if (e.ctrlKey && e.key === ',') { e.preventDefault(); dialogs.open('settings'); return; }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (k === 'n') dialogs.open('soon', { soon: 'entry' });
  else if (k === 'j') dialogs.open('soon', { soon: 'journal' });
  else if (e.key === '?') dialogs.open('keys');
});

/* no browser menu on right-click; text fields keep theirs */
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
});

/* ------------------------------------------------------- start-up steps */

const FONTS = [
  '600 16px "Inter Tight"',
  '400 16px "Source Serif 4"',
  'italic 400 16px "Source Serif 4"',
  '400 16px "JetBrains Mono"',
];

function prepareBackground() {
  if (settings.get().bg !== 'sky') return null;
  /* draw the night sky once, off screen, so it is ready before it shows */
  const url = skyData().url.slice(5, -2);
  const img = new Image();
  img.src = url;
  return img.decode().catch(() => null);
}

function appInfo() {
  if (!isNative) return null;
  return invoke('app_info').then((info) => {
    if (info && info.version) version = info.version;
    document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = version; });
  });
}

const steps = [
  { id: 'fonts', label: 'Fonts', run: () => Promise.all(FONTS.map((f) => document.fonts.load(f))) },
  { id: 'settings', label: 'Settings', run: () => { settings.load(); settings.apply(); } },
  { id: 'background', label: 'Background', run: prepareBackground },
  { id: 'data', label: 'Data folder', run: appInfo },
  { id: 'discord', label: 'Discord', run: () => presence.configure(settings.get().discord), limit: 2500 },
];

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function start() {
  /* the window starts hidden so it never flashes white; show it now that
     the first frame is ink, then give it two frames to settle */
  const w = currentWindow();
  if (w) { try { await w.show(); await w.setFocus(); } catch (e) { /* Rust shows it anyway */ } }
  await frame(); await frame();

  const loader = createLoader(steps);
  await runIntro({ animate: S.intro !== false, reduced: settings.reducedMotion(), loader });
  ready = true;
  markNew();
}

start();
