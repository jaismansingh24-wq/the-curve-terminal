/* The app's start-up, in order: settings and the title bar straight away,
   then the window is shown and the opening plays while the real start-up
   steps run under the loading bar, the journal among them. */

import * as settings from './settings.js';
import * as presence from './presence.js';
import * as J from './journal.js';
import * as router from './router.js';
import { initTitlebar } from '../shared/js/titlebar.js';
import { invoke, isNative, currentWindow, openLink } from '../shared/js/native.js';
import { get as sget, set as sset } from '../shared/js/store.js';
import { skyData } from '../shared/js/sky.js';
import { createLoader } from './loader.js';
import { runIntro } from './intro.js';
import { startClock } from './clock.js';
import { initDialogs } from './dialogs.js';
import { initUnits } from './units.js';
import { renderHome, renderBoundaries } from './home.js';
import { initForm, openForm, saveShortcut } from './form.js';
import { initOverview, renderOverview } from './overview.js';
import { initEntry, renderEntry } from './detail.js';
import { initStats, renderStats } from './stats-view.js';
import { initCalendar, renderCalendar } from './calendar-view.js';
import { initAccounts, renderAccounts } from './accounts.js';

const S = settings.load();
settings.apply();
J.setShowSimulated(S.showSimulated !== false);

let version = '0.3.4';
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
settings.onChange((s, patch) => {
  if ('discord' in patch) presence.configure(s.discord);
  if ('showSimulated' in patch) { J.setShowSimulated(s.showSimulated); refresh(); syncSimRow(); syncJournalRow(); }
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

document.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () => openLink(b.dataset.link)));
document.querySelectorAll('[data-reveal]').forEach((b) => b.addEventListener('click', () => invoke('journal_reveal').catch(() => {})));
const revealRow = document.querySelector('[data-reveal-row]');
if (revealRow) revealRow.hidden = !isNative;

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

/* ------------------------------------------------------------ keyboard */

const BLOCKED = new Set(['F3', 'F5', 'F7']);
document.addEventListener('keydown', (e) => {
  const k = (e.key || '').toLowerCase();
  /* Ctrl+S saves the entry being written */
  if (e.ctrlKey && k === 's') {
    e.preventDefault();
    const r = router.now();
    if (ready && r && r.view === 'new' && !document.querySelector('dialog[open]')) saveShortcut();
    return;
  }
  /* the browser's own shortcuts mean nothing in an app window */
  if (BLOCKED.has(e.key) || (e.ctrlKey && ['r', 'p', 'f', 'g', 'u', 'j'].includes(k))) { e.preventDefault(); return; }

  if (!ready || document.querySelector('dialog[open]')) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;

  if (e.ctrlKey && e.key === ',') { e.preventDefault(); dialogs.open('settings'); return; }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (k === 'h') router.go('/home');
  else if (k === 'n') router.go('/new');
  else if (k === 'j') router.go('/overview');
  else if (k === 's') router.go('/stats');
  else if (k === 'a') router.go('/accounts');
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
let journalError = null;
async function loadJournal() {
  for (let i = 0; i < 3; i++) {
    try { await J.load(); journalError = null; return; } catch (e) { journalError = e; }
    await new Promise((r) => setTimeout(r, 700));
  }
}

const steps = [
  { id: 'fonts', label: 'Fonts', run: () => Promise.all(FONTS.map((f) => document.fonts.load(f))) },
  { id: 'settings', label: 'Settings', run: () => { settings.load(); settings.apply(); } },
  { id: 'background', label: 'Background', run: prepareBackground },
  { id: 'data', label: 'Data folder', run: appInfo },
  { id: 'journal', label: 'Journal', run: loadJournal, limit: 5000 },
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
