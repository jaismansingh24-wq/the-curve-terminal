/* The app's start-up, in order: settings and the title bar straight away,
   then the window is shown and the opening plays while the real start-up
   steps run under the loading bar, the journal among them. */

import * as settings from './settings.js';
import * as presence from './presence.js';
import * as J from './journal.js';
import * as router from './router.js';
import { initTitlebar, onBeforeClose } from '../shared/js/titlebar.js';
import { invoke, isNative, currentWindow, openLink } from '../shared/js/native.js';
import { get as sget, set as sset } from '../shared/js/store.js';
import { skyData } from '../shared/js/sky.js';
import { createLoader } from './loader.js';
import { runIntro } from './intro.js';
import { startClock } from './clock.js';
import { initDialogs } from './dialogs.js';
import { initMenu } from './menu.js';
import { initUnits } from './units.js';
import { renderHome, renderBoundaries } from './home.js';
import { initForm, openForm, saveShortcut } from './form.js';
import { initOverview, renderOverview } from './overview.js';
import { initEntry, renderEntry } from './detail.js';
import { initStats, renderStats } from './stats-view.js';
import { initCalendar, renderCalendar } from './calendar-view.js';
import { initAccounts, renderAccounts } from './accounts.js';
import { initBackdrop, renderBackdrop, VIEWS as BACKDROP } from './backdrop-view.js';
import { forget as forgetBackdrop } from './backdrop-data.js';
import * as Folio from './folio.js';
import { initFolio, renderDigest, renderPages, openPage, leavePage } from './folio-view.js';
import { initReplay, renderReplay, leaveReplay } from './replay-view.js';

const S = settings.load();
settings.apply();
J.setShowSimulated(S.showSimulated !== false);

let version = '0.9.5';
let ready = false;

/* --------------------------------------------------------------- wiring */

initTitlebar(document.querySelector('.tb'));

/* the name in the title bar, a letter to a span so a slow wave can pass
   along it (see app.css); screen readers are given the name whole, and
   every letter stays part of the window's drag area */
(function letterName() {
  const name = document.querySelector('.tb__name');
  if (!name) return;
  const whole = name.textContent.replace(/\s+/g, ' ').trim();
  const shown = document.createElement('span');
  shown.setAttribute('aria-hidden', 'true');
  shown.setAttribute('data-tauri-drag-region', '');
  let i = 0;
  const letters = (text, into) => {
    for (const ch of text) {
      if (ch === ' ') { into.appendChild(document.createTextNode(' ')); continue; }
      const l = document.createElement('span');
      l.className = 'tb__l';
      l.setAttribute('data-tauri-drag-region', '');
      l.style.setProperty('--i', String(i++));
      l.textContent = ch;
      into.appendChild(l);
    }
  };
  for (const node of [...name.childNodes]) {
    if (node.nodeType === 3) letters(node.textContent, shown);
    else if (node.nodeType === 1) {
      const part = document.createElement('span');
      part.className = 'tb__t';
      part.setAttribute('data-tauri-drag-region', '');
      letters(node.textContent, part);
      shown.appendChild(part);
    }
  }
  const sr = document.createElement('span');
  sr.className = 'sr';
  sr.textContent = whole;
  name.replaceChildren(shown, sr);
})();

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

const menu = initMenu();
settings.bindPanel(document.querySelector('.view[data-view="settings"]'));

/* buttons that go to a page (Settings, from the title bar); Discord's mark
   goes to the Discord switch on it */
function goTo(path, focus) {
  const toDiscord = () => {
    const g = document.getElementById('st-discord-group');
    if (!g) return;
    g.scrollIntoView({ block: 'center' });
    const sw = g.querySelector('.switch');
    if (sw) sw.focus({ preventScroll: true });
  };
  /* once the page has changed (and its heading taken focus), the switch takes it */
  if (focus === 'discord') {
    if (location.hash === '#' + path) requestAnimationFrame(toDiscord);
    else window.addEventListener('hashchange', () => requestAnimationFrame(toDiscord), { once: true });
  }
  router.go(path);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) goTo(b.dataset.go, b.dataset.focus);
});
settings.onChange((s, patch) => {
  if ('discord' in patch) presence.configure(s.discord);
  if ('showSimulated' in patch) { J.setShowSimulated(s.showSimulated); refresh(); syncSimRow(); syncJournalRow(); }
  if ('backdrop' in patch) { forgetBackdrop(); const r = router.now(); if (r && BACKDROP.includes(r.view)) renderBackdrop(r.view); }
  if (['units', 'basis', 'dayStart', 'costPerContract', 'dailyLimit', 'monthlyFees'].some((k) => k in patch)) refresh();
});
presence.bindUI();
initUnits();
initForm();
initOverview();
initEntry({ confirm: dialogs.confirm });
initStats();
initCalendar();
initAccounts({ confirm: dialogs.confirm });
initBackdrop();
initFolio({ confirm: dialogs.confirm });
initReplay({ confirm: dialogs.confirm });
onBeforeClose(() => leavePage());

document.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () => openLink(b.dataset.link)));
document.querySelectorAll('[data-reveal]').forEach((b) => b.addEventListener('click', () => invoke('journal_reveal').catch(() => {})));
const revealRow = document.querySelector('[data-reveal-row]');
if (revealRow) revealRow.hidden = !isNative;
const folioRow = document.querySelector('[data-folio-row]');
if (folioRow) folioRow.hidden = !isNative;
document.querySelector('[data-folio-reveal]').addEventListener('click', () => invoke('folio_reveal').catch(() => {}));

/* Settings: remove every simulated entry and account in one go */
function syncSimRow() {
  const row = document.querySelector('[data-sim-row]');
  const c = J.fileCounts(), n = c.simulated, a = c.simAccounts;
  row.hidden = !n && !a;
  document.querySelector('[data-sim-desc]').textContent = n + ' simulated ' + (n === 1 ? 'entry' : 'entries') + (a ? ' and ' + a + ' simulated ' + (a === 1 ? 'account' : 'accounts') : '') + ', generated for trying the app out. Your own entries are not touched.';
}
document.querySelector('[data-remove-sim]').addEventListener('click', () => {
  const n = J.simCount();
  dialogs.confirm(n + ' simulated ' + (n === 1 ? 'entry' : 'entries') + ' and any simulated accounts. Your own entries stay.', async () => { await J.removeSimulated(); }, 'Remove the simulated entries?');
});
J.onChange(syncSimRow);

/* Settings: delete The Backdrop's downloaded copies */
document.querySelector('[data-bd-clear]').addEventListener('click', async () => {
  const say = document.querySelector('[data-bd-copies]');
  if (!isNative) { say.textContent = 'There are no copies in the design preview.'; return; }
  try {
    const n = await invoke('backdrop_clear');
    forgetBackdrop();
    say.textContent = n ? 'Deleted ' + n + (n === 1 ? ' copy' : ' copies') + '. Each is fetched again the next time its page opens, if fetching is on.' : 'There were no copies to delete.';
  } catch (e) {
    say.textContent = 'The copies could not be deleted: ' + String(e && e.message ? e.message : e);
  }
});

/* Settings: what the journal file holds, in plain numbers */
function syncJournalRow() {
  const c = J.fileCounts(), desc = document.querySelector('[data-journal-desc]');
  const retry = document.querySelector('[data-retry-journal]');
  retry.hidden = !journalError;
  if (journalError) { desc.textContent = 'It could not be read: ' + String(journalError.message || journalError) + ' Nothing in the file was changed.'; return; }
  if (!c.loaded) { desc.textContent = 'Not read yet.'; return; }
  desc.textContent = c.entries + (c.entries === 1 ? ' entry' : ' entries') + (c.simulated ? ', ' + c.simulated + ' of them simulated' : '') + ', and ' + c.accounts + (c.accounts === 1 ? ' account' : ' accounts') + (c.simAccounts ? ' (' + c.simAccounts + ' simulated)' : '') + '.' +
    (c.simulated && !settings.get().showSimulated ? ' The simulated ones are hidden; switch them on below.' : '');
}
J.onChange(syncJournalRow);
document.querySelector('[data-retry-journal]').addEventListener('click', async () => { await loadJournal(); syncJournalRow(); refresh(); });

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

/* ---------------------------------------------------------------- pages */

router.on('home', () => renderHome());
router.on('new', (r) => openForm(r.id));
router.on('overview', () => renderOverview());
router.on('entry', (r) => renderEntry(r.id));
router.on('stats', () => renderStats());
router.on('calendar', () => renderCalendar());
router.on('accounts', () => renderAccounts());
router.on('digest', () => renderDigest());
router.on('pages', () => renderPages());
router.on('page', (r) => openPage(r.id));
router.on('replay', () => renderReplay());
router.on('settings', () => syncJournalRow());
/* leaving a page writes what is waiting */
let lastView = null;
window.addEventListener('hashchange', () => {
  const r = router.parse();
  if (lastView === 'page' && r.view !== 'page') leavePage();
  if (lastView === 'replay' && r.view !== 'replay') leaveReplay();
  lastView = r.view;
});
BACKDROP.forEach((v) => router.on(v, () => renderBackdrop(v)));

/* redraw whatever is showing when the journal or a setting changes */
function refresh() {
  renderBoundaries();
  const r = router.now();
  if (!r) return;
  if (r.view === 'home') renderHome();
  if (r.view === 'overview') renderOverview();
  if (r.view === 'entry') renderEntry(r.id);
  if (r.view === 'stats') renderStats();
  if (r.view === 'calendar') renderCalendar();
  if (r.view === 'accounts') renderAccounts();
}
J.onChange(refresh);
Folio.onChange(() => { const r = router.now(); if (r && r.view === 'home') renderHome(); });

/* ------------------------------------------------------------ keyboard */

const BLOCKED = new Set(['F3', 'F5', 'F7']);
document.addEventListener('keydown', (e) => {
  const k = (e.key || '').toLowerCase();
  /* Ctrl+S saves the entry being written */
  if (e.ctrlKey && k === 's') {
    e.preventDefault();
    const r = router.now();
    if (ready && r && r.view === 'new' && !document.querySelector('dialog[open]')) saveShortcut();
    if (ready && r && r.view === 'page') leavePage().then(() => openPage(r.id));
    return;
  }
  /* the browser's own shortcuts mean nothing in an app window */
  if (BLOCKED.has(e.key) || (e.ctrlKey && ['r', 'p', 'f', 'g', 'u', 'j'].includes(k))) { e.preventDefault(); return; }

  if (!ready || document.querySelector('dialog[open]')) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;

  if (e.ctrlKey && e.key === ',') { e.preventDefault(); goTo('/settings'); return; }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (k === 'm') { e.preventDefault(); menu.toggle(); return; }
  if (k === 'h') router.go('/home');
  else if (k === 'n') router.go('/new');
  else if (k === 'j') router.go('/overview');
  else if (k === 's') router.go('/stats');
  else if (k === 'a') router.go('/accounts');
  else if (k === 'd') router.go('/digest');
  else if (k === 'p') router.go('/pages');
  else if (k === 'r') router.go('/replay');
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

/* read the journal file; if a read fails, try twice more before saying so */
let journalError = null, reading = null;
/* read the Folio file; Digest and Pages show it once it is in */
let folioError = null;
async function loadFolio() {
  try { await Folio.load(); folioError = null; } catch (e) { folioError = e; }
  const r = router.now();
  if (r && r.view === 'digest') renderDigest();
  if (r && r.view === 'pages') renderPages();
}

function loadJournal() {
  if (!reading) reading = (async () => {
    for (let i = 0; i < 3; i++) {
      try { await J.load(); journalError = null; return; } catch (e) { journalError = e; }
      await new Promise((r) => setTimeout(r, 700));
    }
  })().finally(() => { reading = null; });
  return reading;
}
/* moving to another page reads it again if it has not been read */
window.addEventListener('hashchange', () => {
  if (ready && J.persistent && !J.isLoaded()) loadJournal().then(() => { syncJournalRow(); refresh(); });
});

const steps = [
  { id: 'fonts', label: 'Fonts', run: () => Promise.all(FONTS.map((f) => document.fonts.load(f))) },
  { id: 'settings', label: 'Settings', run: () => { settings.load(); settings.apply(); } },
  { id: 'background', label: 'Background', run: prepareBackground },
  { id: 'data', label: 'Data folder', run: appInfo },
  { id: 'journal', label: 'Journal', run: loadJournal, limit: 5000 },
  { id: 'folio', label: 'Folio', run: loadFolio, limit: 5000 },
  { id: 'discord', label: 'Discord', run: () => presence.configure(settings.get().discord), limit: 2500 },
];

/* a frame, or 100 ms if the window is hidden and frames are not coming */
const frame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 100); });

async function start() {
  /* always open on the home screen, where the opening lands */
  if (location.hash && location.hash !== '#/home') history.replaceState(null, '', '#/home');
  renderBoundaries();
  router.start();

  /* the window starts hidden so it never flashes white; show it now that
     the first frame is ink, then give it two frames to settle */
  const w = currentWindow();
  if (w) { try { await w.show(); await w.setFocus(); } catch (e) { /* Rust shows it anyway */ } }
  await frame(); await frame();

  const loader = createLoader(steps);
  loader.promise.then(() => refresh());
  await runIntro({ animate: S.intro !== false, reduced: settings.reducedMotion(), loader });
  ready = true;
  markNew();
  syncJournalRow();
  if (journalError) {
    const box = document.querySelector('[data-recent-empty]');
    if (box) { box.hidden = false; box.textContent = String(journalError.message || journalError); }
  }
}

start();
