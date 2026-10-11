/* The Folio: research pages with text, titles, colour, highlights,
   screenshots and marked lines, kept in one file on this computer
   (folio.json beside the journal, written by the Rust side), with
   screenshots as image files beside it. In the design preview there is no
   Rust side: pages last until the page reloads, and the interface says so.

   A page's text is stored as a small, fixed kind of HTML: the tags and
   classes listed below and nothing else. Everything is cleaned through
   clean() before it is kept or shown, so no style, script, link or outside
   image ever gets in, whether typed, pasted or read from the file. */

import { invoke, isNative } from '../shared/js/native.js';

export const SCHEMA = 1;
export const persistent = isNative;
let pages = [];
let loaded = false;
const listeners = [];

/* ------------------------------------------------------------ the allowed HTML */

const TAGS = {
  P: 'P', H1: 'H1', H2: 'H2', H3: 'H3', H4: 'H3', H5: 'H3', H6: 'H3',
  UL: 'UL', OL: 'OL', LI: 'LI', BLOCKQUOTE: 'BLOCKQUOTE', PRE: 'PRE', CODE: 'CODE', HR: 'HR', BR: 'BR',
  STRONG: 'STRONG', B: 'STRONG', EM: 'EM', I: 'EM', U: 'U', S: 'S', STRIKE: 'S', DEL: 'S',
  SPAN: 'SPAN', MARK: 'MARK', FIGURE: 'FIGURE', FIGCAPTION: 'FIGCAPTION', IMG: 'IMG', DIV: 'DIV',
};
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'HEAD', 'SVG', 'MATH', 'CANVAS', 'VIDEO', 'AUDIO', 'TEMPLATE', 'NOSCRIPT', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA']);
export const COLOURS = ['dim', 'faint', 'amber', 'blue', 'violet'];
export const HIGHLIGHTS = ['grey', 'amber', 'blue', 'violet'];
const CLASSES = new Set([
  ...COLOURS.map((c) => 'tc-' + c), ...HIGHLIGHTS.map((c) => 'hl-' + c),
  'imp', 'imp--shown', 'imp--hidden', 'fimg',
  'fbg', 'fbg__h', 'fbg__list', 'fbg__k', 'fbg__v', 'fbg__n',
]);
const ID = /^[a-z0-9-]{6,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/* the HTML a page may hold, from anything (the file, a paste, the editor) */
export function clean(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html || '');
  const out = document.createDocumentFragment();
  for (const n of [...t.content.childNodes]) { const c = cleanNode(n, false); if (c) out.appendChild(c); }
  /* loose text and inline pieces at the top level go into paragraphs */
  const box = document.createElement('div');
  let para = null;
  for (const n of [...out.childNodes]) {
    const block = n.nodeType === 1 && /^(P|H1|H2|H3|UL|OL|BLOCKQUOTE|PRE|HR|FIGURE|DIV)$/.test(n.tagName);
    if (block) { para = null; box.appendChild(n); continue; }
    if (n.nodeType === 3 && !n.textContent.trim() && !para) continue;
    if (!para) { para = document.createElement('p'); box.appendChild(para); }
    para.appendChild(n);
  }
  return box.innerHTML;
}

function cleanNode(n, inBg) {
  if (n.nodeType === 3) return document.createTextNode(n.textContent);
  if (n.nodeType !== 1) return null;
  const tag = n.tagName.toUpperCase();
  if (DROP.has(tag)) return null;
  const kids = () => {
    const f = document.createDocumentFragment();
    for (const k of [...n.childNodes]) { const c = cleanNode(k, inBg); if (c) f.appendChild(c); }
    return f;
  };
  const to = TAGS[tag];
  if (!to) return kids(); /* unknown tags (links, fonts, sections) keep their text */
  if (to === 'IMG') {
    const id = n.getAttribute('data-img');
    if (!id || !UUID.test(id)) return null; /* only the Folio's own screenshots */
    const img = document.createElement('img');
    img.setAttribute('data-img', id);
    img.setAttribute('alt', (n.getAttribute('alt') || '').slice(0, 300));
    return img;
  }
  const el = document.createElement(to);
  const cls = [...(n.classList || [])].filter((c) => CLASSES.has(c));
  /* a div is kept only as an Atlas background card; any other becomes a paragraph */
  if (to === 'DIV' && !cls.includes('fbg')) {
    const p = document.createElement('p');
    p.appendChild(kids());
    return p;
  }
  if (cls.length) el.className = cls.join(' ');
  const imp = n.getAttribute('data-imp');
  if (imp && ID.test(imp) && cls.includes('imp')) el.setAttribute('data-imp', imp);
  if (to === 'SPAN' && !cls.length) return kids();
  if (to === 'MARK' && !cls.some((c) => c.startsWith('hl-'))) el.className = 'hl-grey';
  el.appendChild(kids());
  return el;
}

/* ------------------------------------------------------------ the file */

export async function load() {
  if (!isNative) { loaded = true; return pages; }
  const text = await invoke('folio_read');
  let data = { pages: [] };
  if (text && text.trim()) {
    try { data = JSON.parse(text); } catch (e) { throw new Error('The Folio file could not be read. It has not been changed.'); }
  }
  const fromFile = Array.isArray(data.pages) ? data.pages : [];
  const mine = new Set(pages.map((p) => p.id));
  pages = [...pages, ...fromFile.filter((p) => p && p.id && !mine.has(p.id)).map((p) => ({ ...p, html: clean(p.html) }))];
  loaded = true;
  listeners.forEach((fn) => fn());
  prune();
  return pages;
}
export const isLoaded = () => loaded;
export const onChange = (fn) => listeners.push(fn);

let timer = null, saving = null, pendingError = null;
export const lastError = () => pendingError;
async function persist() {
  timer = null;
  if (!isNative) return;
  const json = JSON.stringify({ schema: SCHEMA, pages }, null, 1);
  saving = invoke('folio_write', { json }).then(() => { pendingError = null; }).catch((e) => { pendingError = String(e && e.message ? e.message : e); });
  await saving;
  saving = null;
}
/* saves are gathered: a burst of typing is written once, shortly after */
function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(persist, 700);
}
/* write now, if anything is waiting (leaving a page, Ctrl+S) */
export async function flush() {
  if (timer) { clearTimeout(timer); await persist(); }
  else if (saving) await saving;
}

function ready() {
  if (isNative && !loaded) throw new Error('The Folio is still loading. Try again in a moment.');
}

/* ------------------------------------------------------------ pages */

const time = (p) => Date.parse(p.updatedAt || p.createdAt || 0) || 0;
export function all() {
  return pages.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || time(b) - time(a));
}
export const byId = (id) => pages.find((p) => p.id === id) || null;
export const count = () => pages.length;

export function create({ title = '', html = '<p><br></p>', tags = [] } = {}) {
  ready();
  const now = new Date().toISOString();
  const p = { id: crypto.randomUUID(), title, html: clean(html) || '<p><br></p>', tags, pinned: false, createdAt: now, updatedAt: now, v: SCHEMA };
  pages.push(p);
  schedule();
  listeners.forEach((fn) => fn());
  return p;
}

export function update(id, patch) {
  ready();
  const i = pages.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const next = { ...pages[i], ...patch, updatedAt: new Date().toISOString() };
  if ('html' in patch) next.html = clean(patch.html);
  if ('tags' in patch) next.tags = normTags(patch.tags);
  pages[i] = next;
  schedule();
  return next;
}

export async function remove(id) {
  ready();
  const gone = byId(id);
  if (gone) imagesIn(gone).forEach((i) => fresh.delete(i));
  pages = pages.filter((p) => p.id !== id);
  await flush();
  schedule();
  await flush();
  listeners.forEach((fn) => fn());
  prune();
}

export function normTags(list) {
  const out = [];
  for (const t of list || []) {
    const s = String(t).replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32);
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, 20);
}
export const allTags = () => [...new Set(pages.flatMap((p) => p.tags || []))].sort();

/* ------------------------------------------------------------ reading a page */

function doc(p) {
  const t = document.createElement('template');
  t.innerHTML = p.html || '';
  return t.content;
}
/* the page's words, with a space between blocks so paragraphs do not run together */
export const textOf = (p) => {
  const d = doc(p);
  d.querySelectorAll('p,h1,h2,h3,li,blockquote,figcaption,pre').forEach((b) => b.append(' '));
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
};
export const words = (p) => { const t = textOf(p); return t ? t.split(' ').length : 0; };
export const imagesIn = (p) => [...doc(p).querySelectorAll('img[data-img]')].map((i) => i.getAttribute('data-img'));

/* The marked lines of a page, in order: { id, text, shown, heading, images }.
   One mark can run across several pieces (a selection over two paragraphs);
   its pieces share an id and are read as one slice. */
export function marks(p) {
  const root = doc(p);
  const out = new Map();
  let heading = '';
  const walk = (n, inHeading = false) => {
    if (n.nodeType !== 1) return;
    const isHeading = /^H[1-3]$/.test(n.tagName);
    if (isHeading) heading = n.textContent.trim();
    const id = n.getAttribute('data-imp');
    if (id && n.classList.contains('imp')) {
      /* a mark in a heading is its own context: no "under" line */
      if (!out.has(id)) out.set(id, { id, parts: [], shown: n.classList.contains('imp--shown'), heading: inHeading || isHeading ? '' : heading, images: [] });
      const m = out.get(id);
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t) m.parts.push(t);
      n.querySelectorAll('img[data-img]').forEach((i) => m.images.push(i.getAttribute('data-img')));
      return;
    }
    for (const k of n.children) walk(k, inHeading || isHeading);
  };
  for (const k of root.children) walk(k);
  return [...out.values()].map((m) => ({ ...m, text: m.parts.join(' ') }));
}

/* ------------------------------------------------------------ screenshots */

const imgCache = new Map();
/* screenshots added this session: their page may not be saved yet, so they are kept */
const fresh = new Set();
/* a screenshot's data address, read once and kept for the session */
export async function imageSrc(id) {
  if (imgCache.has(id)) return imgCache.get(id);
  if (!isNative) return '';
  const b64 = await invoke('folio_image_read', { id });
  const src = 'data:image/webp;base64,' + b64;
  imgCache.set(id, src);
  return src;
}

/* a picture (a pasted screenshot, a dropped file) made into a webp no wider
   than 2,400 pixels, kept in the Folio's image folder; returns its id */
export async function keepImage(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 2400 / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const out = await new Promise((r) => c.toBlob(r, 'image/webp', 0.9));
  if (!out) throw new Error('This picture could not be prepared.');
  const id = crypto.randomUUID();
  const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsDataURL(out); });
  imgCache.set(id, data);
  fresh.add(id);
  if (isNative) await invoke('folio_image_save', { id, data: data.slice(data.indexOf(',') + 1) });
  return id;
}

/* drop image files no page refers to any more */
function prune() {
  if (!isNative || !loaded) return;
  const keep = [...new Set([...pages.flatMap(imagesIn), ...fresh])];
  invoke('folio_images_prune', { keep }).catch(() => {});
}
