/* The Folio's pages:
     Digest   every line marked as important, gathered from all pages
     Pages    the list, with search, tags, pins and templates
     a page   the editor (folio-editor.js), its title, tags and counts
   Pages are kept by folio.js; nothing here is sent anywhere. */

import * as F from './folio.js';
import * as settings from './settings.js';
import * as SCH from './backdrop-schedule.js';
import { createEditor } from './folio-editor.js';
import { backgroundCard } from './backdrop-view.js';
import { el, int } from './format.js';
import { shortDateET, longDateET, timeBoth } from './time.js';

const state = { q: '', tag: '', show: 'all', pq: '', ptag: '', sort: 'edited', template: 'blank', editor: null, pageId: null, find: null };
let confirm = null;

const when = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? shortDateET(t) + ', ' + timeBoth(t) : ''; };
const plural = (n, one, many) => int(n) + ' ' + (n === 1 ? one : many);

/* a row of choices, as elsewhere in the app */
function seg(label, opts, value, pick) {
  const g = el('div', 'seg seg--sm');
  g.setAttribute('role', 'radiogroup');
  g.setAttribute('aria-label', label);
  const list = opts.map(([v, text]) => {
    const b = el('button', 'seg__opt', text);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', v === value ? 'true' : 'false');
    b.tabIndex = v === value ? 0 : -1;
    b.addEventListener('click', () => pick(v));
    return b;
  });
  g.append(...list);
  g.addEventListener('keydown', (e) => {
    const i = list.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % list.length : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + list.length) % list.length : -1;
    if (n < 0) return;
    e.preventDefault();
    list[n].click();
    list[n].focus();
  });
  return g;
}
function fillTags(select, value) {
  const tags = F.allTags();
  select.replaceChildren(new Option('All', ''), ...tags.map((t) => new Option('#' + t, t)));
  select.value = tags.includes(value) ? value : '';
  return select.value;
}
function tagChips(tags) {
  const box = el('span', 'fo-tags');
  (tags || []).forEach((t) => box.appendChild(el('span', 'fo-tag', '#' + t)));
  return box;
}
function loadingNote(box) {
  if (F.isLoaded()) return false;
  box.replaceChildren(el('p', 'empty', 'The Folio is still being read.'));
  return true;
}

/* ------------------------------------------------------------ templates */

/* headings to fill in; nothing in them asks for an entry, a target or a call */
const TEMPLATES = {
  blank: { name: 'Blank', title: () => '', html: () => '<p><br></p>' },
  before: {
    name: 'Before the session',
    title: () => 'Before the session, ' + shortDateET(Date.now()),
    html: () => '<h2>The background</h2><p><br></p><h2>Scheduled today</h2>' + todaysReleases() + '<h2>What I am watching</h2><p><br></p><h2>Questions to answer by the close</h2><p><br></p>',
    background: true,
  },
  after: {
    name: 'After the session',
    title: () => 'After the session, ' + shortDateET(Date.now()),
    html: () => '<h2>What happened</h2><p><br></p><h2>What I did, and why</h2><p><br></p><h2>What I would keep</h2><p><br></p><h2>What I would change</h2><p><br></p><h2>Screenshots</h2><p><br></p>',
  },
  research: {
    name: 'Research',
    title: () => '',
    html: () => '<h2>The question</h2><p><br></p><h2>What the data shows</h2><p><br></p><h2>Where this could mislead</h2><p><br></p><h2>Sources</h2><p><br></p>',
  },
};
/* today's scheduled releases from Atlas's calendar, as plain text */
function todaysReleases() {
  const key = longDateET(Date.now());
  const today = SCH.EVENTS.filter((e) => longDateET(e.at) === key);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  if (!today.length) return '<p>Nothing in Atlas\'s release calendar today (calendars checked on ' + SCH.CHECKED + ').</p>';
  return '<ul>' + today.map((e) => '<li>' + esc(e.what) + ', ' + (e.time ? esc(timeBoth(e.at)) : 'no time given') + ' (' + esc(e.agency) + ')</li>').join('') + '</ul>';
}

async function newPage(kind = state.template) {
  const t = TEMPLATES[kind] || TEMPLATES.blank;
  let p;
  try { p = F.create({ title: t.title(), html: t.html() }); } catch (e) { return null; }
  if (t.background) {
    const card = await backgroundCard().catch(() => null);
    if (card) {
      const box = document.createElement('div');
      box.innerHTML = p.html;
      const h = box.querySelector('h2');
      const next = h && h.nextElementSibling;
      if (next && next.tagName === 'P' && !next.textContent.trim()) next.replaceWith(card); else if (h) h.after(card);
      F.update(p.id, { html: box.innerHTML });
    }
  }
  return p;
}

/* ------------------------------------------------------------ Digest */

export function renderDigest() {
  const list = document.querySelector('[data-dg-list]');
  const sum = document.querySelector('[data-dg-sum]');
  if (loadingNote(list)) return;
  state.tag = fillTags(document.querySelector('[data-dg-tag]'), state.tag);
  const showBox = document.querySelector('[data-dg-show]');
  showBox.replaceChildren(seg('Which marks', [['all', 'All marks'], ['shown', 'Shown'], ['hidden', 'Hidden']], state.show, (v) => { state.show = v; renderDigest(); }));
  const q = state.q.trim().toLowerCase();
  let total = 0, pagesWith = 0, allMarks = 0;
  const groups = [];
  for (const p of F.all()) {
    let ms = F.marks(p);
    allMarks += ms.length;
    if (state.tag && !(p.tags || []).includes(state.tag)) continue;
    if (state.show !== 'all') ms = ms.filter((m) => (state.show === 'shown') === m.shown);
    if (q) ms = ms.filter((m) => (m.text + ' ' + m.heading + ' ' + (p.title || '')).toLowerCase().includes(q));
    if (!ms.length) continue;
    total += ms.length;
    pagesWith++;
    groups.push([p, ms]);
  }
  sum.textContent = allMarks
    ? plural(total, 'marked line', 'marked lines') + ' from ' + plural(pagesWith, 'page', 'pages') + (total !== allMarks ? ', of ' + int(allMarks) + ' in all' : '') + '. Press a line to open it where it was written.'
    : '';
  list.replaceChildren();
  if (!allMarks) {
    const e = el('div', 'fo-empty glass glass--quiet');
    e.append(el('p', 'fo-empty__h', 'Nothing marked yet'),
      el('p', '', 'On any page, select the text that matters and press Mark (Ctrl+M) to underline it as important, or Mark, hidden (Ctrl+Shift+M) to keep the page clean. Every marked line is gathered here, with the page and heading it came from.'));
    const go = el('a', 'btn btn--primary', F.count() ? 'Open your pages' : 'Start a page');
    go.href = F.count() ? '#/pages' : '#/page/new';
    e.appendChild(go);
    list.appendChild(e);
    return;
  }
  if (!groups.length) { list.appendChild(el('p', 'empty', 'Nothing matches ' + (q ? '"' + state.q.trim() + '"' : 'these choices') + '.')); return; }
  for (const [p, ms] of groups) {
    const card = el('article', 'fo-group glass glass--quiet');
    const head = el('div', 'fo-group__head');
    const title = el('a', 'fo-group__title', p.title || 'Untitled');
    title.href = '#/page/' + p.id;
    head.append(title, tagChips(p.tags), el('span', 'kicker fo-group__when', 'Edited ' + when(p.updatedAt)));
    card.appendChild(head);
    const ul = el('ul', 'fo-slices');
    for (const m of ms) {
      const li = el('li', 'fo-slice');
      const a = el('a', 'fo-slice__a');
      a.href = '#/page/' + p.id;
      a.addEventListener('click', () => { state.find = m.id; });
      if (m.heading) a.appendChild(el('span', 'kicker fo-slice__under', 'Under ' + (m.heading.length > 80 ? m.heading.slice(0, 80).replace(/\s+\S*$/, '') + '…' : m.heading)));
      if (m.text) a.appendChild(el('span', 'fo-slice__text', m.text));
      if (m.images.length) {
        const pics = el('span', 'fo-slice__pics');
        m.images.slice(0, 3).forEach((id) => {
          const img = document.createElement('img');
          img.alt = 'Marked screenshot';
          F.imageSrc(id).then((src) => { if (src) img.src = src; }).catch(() => {});
          pics.appendChild(img);
        });
        a.appendChild(pics);
      }
      if (!m.shown) a.appendChild(el('span', 'fo-slice__hidden kicker', 'Hidden on the page'));
      li.appendChild(a);
      ul.appendChild(li);
    }
    card.appendChild(ul);
    list.appendChild(card);
  }
}

/* ------------------------------------------------------------ Pages */

export function renderPages() {
  const list = document.querySelector('[data-fo-list]');
  const sum = document.querySelector('[data-fo-sum]');
  if (loadingNote(list)) return;
  state.ptag = fillTags(document.querySelector('[data-fo-tag]'), state.ptag);
  document.querySelector('[data-fo-sort]').replaceChildren(seg('Order', [['edited', 'Last edited'], ['created', 'Newest'], ['title', 'Title']], state.sort, (v) => { state.sort = v; renderPages(); }));
  const q = state.pq.trim().toLowerCase();
  let ps = F.all();
  if (state.ptag) ps = ps.filter((p) => (p.tags || []).includes(state.ptag));
  if (q) ps = ps.filter((p) => ((p.title || '') + ' ' + F.textOf(p) + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q));
  if (state.sort === 'created') ps.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (state.sort === 'title') ps.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.title || 'Untitled').localeCompare(b.title || 'Untitled'));
  sum.textContent = F.count() ? (ps.length === F.count() ? plural(ps.length, 'page', 'pages') + '.' : int(ps.length) + ' of ' + plural(F.count(), 'page', 'pages') + ' match.') + (F.persistent ? '' : ' In the design preview, pages last until the page reloads.') : '';
  list.replaceChildren();
  if (!F.count()) { list.appendChild(el('p', 'empty', 'No pages yet. New page starts one; Start from gives it a few headings to fill in.')); return; }
  if (!ps.length) { list.appendChild(el('p', 'empty', 'Nothing matches ' + (q ? '"' + state.pq.trim() + '"' : 'this tag') + '.')); return; }
  for (const p of ps) {
    const a = el('a', 'fo-row glass glass--quiet');
    a.href = '#/page/' + p.id;
    const top = el('span', 'fo-row__top');
    if (p.pinned) top.appendChild(el('span', 'kicker fo-row__pin', 'Pinned'));
    top.appendChild(el('span', 'fo-row__title', p.title || 'Untitled'));
    a.appendChild(top);
    const text = F.textOf(p);
    if (text) a.appendChild(el('span', 'fo-row__snip', text.length > 180 ? text.slice(0, 180).replace(/\s+\S*$/, '') + '…' : text));
    const meta = el('span', 'fo-row__meta');
    const ms = F.marks(p).length, im = F.imagesIn(p).length;
    meta.append(tagChips(p.tags), el('span', 'kicker', [plural(F.words(p), 'word', 'words'), ms ? plural(ms, 'mark', 'marks') : '', im ? plural(im, 'screenshot', 'screenshots') : '', 'edited ' + when(p.updatedAt)].filter(Boolean).join(' · ')));
    a.appendChild(meta);
    list.appendChild(a);
  }
}

/* ------------------------------------------------------------ a page */

export async function openPage(id) {
  const box = document.querySelector('[data-fp-editor]');
  if (!F.isLoaded()) { box.replaceChildren(el('p', 'empty', 'The Folio is still being read.')); return; }
  if (id === 'new' || !id) {
    const p = await newPage();
    if (!p) { box.replaceChildren(el('p', 'empty', 'The Folio is still loading. Try again in a moment.')); return; }
    location.replace('#/page/' + p.id);
    return;
  }
  const p = F.byId(id);
  const title = document.querySelector('[data-fp-title]');
  const tags = document.querySelector('[data-fp-tags]');
  if (!p) {
    leavePage();
    box.replaceChildren(el('p', 'empty', 'This page is not in the Folio. It may have been deleted.'));
    title.value = ''; title.disabled = true; tags.disabled = true;
    return;
  }
  title.disabled = false; tags.disabled = false;
  if (state.pageId !== id || !state.editor) {
    leavePage();
    state.pageId = id;
    title.value = p.title || '';
    tags.value = (p.tags || []).join(', ');
    state.editor = createEditor({
      html: p.html,
      showHidden: !!settings.get().folioShowHidden,
      onShowHidden: (on) => settings.update({ folioShowHidden: on }),
      onChange: (html) => { F.update(id, { html }); savedSoon(); info(); },
      onBackground: () => backgroundCard().catch(() => null),
    });
    box.replaceChildren(state.editor.el);
    document.querySelector('[data-fp-pin]').textContent = p.pinned ? 'Unpin' : 'Pin';
    info();
    saved('Saved ' + when(p.updatedAt));
    if (!p.title && !F.textOf(p)) title.focus();
  }
  if (state.find) {
    const m = state.find;
    state.find = null;
    requestAnimationFrame(() => state.editor && state.editor.reveal(m));
  }
}

/* write what is waiting before going elsewhere */
export async function leavePage() {
  if (state.editor) { state.editor.flush(); state.editor.destroy(); state.editor = null; }
  state.pageId = null;
  await F.flush();
}

function info() {
  const p = F.byId(state.pageId);
  if (!p) return;
  const ms = F.marks(p).length, im = F.imagesIn(p).length;
  document.querySelector('[data-fp-info]').textContent = [plural(F.words(p), 'word', 'words'), plural(ms, 'mark', 'marks'), im ? plural(im, 'screenshot', 'screenshots') : '', 'created ' + when(p.createdAt)].filter(Boolean).join(' · ');
}
let savedTimer = null;
function saved(text) { document.querySelector('[data-fp-saved]').textContent = text; }
function savedSoon() {
  saved(F.persistent ? 'Saving' : 'Kept until the page reloads (design preview)');
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(async () => {
    await F.flush();
    saved(F.lastError() ? 'Not saved: ' + F.lastError() : F.persistent ? 'Saved ' + timeBoth(Date.now()) : 'Kept until the page reloads (design preview)');
  }, 900);
}

/* ------------------------------------------------------------ wiring */

export function initFolio({ confirm: c }) {
  confirm = c;
  const dq = document.querySelector('[data-dg-q]');
  dq.addEventListener('input', () => { state.q = dq.value; renderDigest(); });
  document.querySelector('[data-dg-tag]').addEventListener('change', (e) => { state.tag = e.target.value; renderDigest(); });
  const pq = document.querySelector('[data-fo-q]');
  pq.addEventListener('input', () => { state.pq = pq.value; renderPages(); });
  document.querySelector('[data-fo-tag]').addEventListener('change', (e) => { state.ptag = e.target.value; renderPages(); });
  const tpl = document.querySelector('[data-fo-template]');
  Object.entries(TEMPLATES).forEach(([k, t]) => tpl.appendChild(new Option(t.name, k)));
  tpl.addEventListener('change', () => { state.template = tpl.value; });
  document.querySelector('[data-fo-new]').addEventListener('click', () => { location.hash = '#/page/new'; });

  const title = document.querySelector('[data-fp-title]');
  title.addEventListener('input', () => { if (state.pageId) { F.update(state.pageId, { title: title.value.slice(0, 200) }); savedSoon(); } });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && state.editor) { e.preventDefault(); state.editor.focus(); } });
  const tags = document.querySelector('[data-fp-tags]');
  tags.addEventListener('change', () => {
    if (!state.pageId) return;
    const p = F.update(state.pageId, { tags: tags.value.split(',') });
    tags.value = (p.tags || []).join(', ');
    savedSoon();
  });
  document.querySelector('[data-fp-pin]').addEventListener('click', (e) => {
    const p = F.byId(state.pageId);
    if (!p) return;
    F.update(p.id, { pinned: !p.pinned });
    e.currentTarget.textContent = p.pinned ? 'Pin' : 'Unpin';
    savedSoon();
  });
  document.querySelector('[data-fp-delete]').addEventListener('click', () => {
    const p = F.byId(state.pageId);
    if (!p) return;
    const ms = F.marks(p).length, im = F.imagesIn(p).length;
    confirm('"' + (p.title || 'Untitled') + '", with ' + plural(F.words(p), 'word', 'words') + (ms ? ', ' + plural(ms, 'marked line', 'marked lines') : '') + (im ? ' and ' + plural(im, 'screenshot', 'screenshots') : '') + '. This cannot be undone; the version before your last save stays in folio.bak.json.', async () => {
      const id = p.id;
      if (state.editor) { state.editor.destroy(); state.editor = null; }
      state.pageId = null;
      await F.remove(id);
      location.hash = '#/pages';
    }, 'Delete this page?');
  });
}

export { newPage };
