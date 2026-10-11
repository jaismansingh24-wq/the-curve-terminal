/* The Folio's editor: a page you type into, with a toolbar.

   Formatting is kept as the Folio's own small set of tags and classes
   (see folio.js), never as inline styles. Bold, italic, underline and
   strike are tags; text colour is a span with a tc- class; a highlight is
   a mark with an hl- class; an important line is a span with the imp
   class and an id, shown (underlined) or hidden (no mark on the page, but
   still gathered by the Digest). Headings, quotes and lists use the
   browser's own editing; everything else is done here, and the editor
   keeps its own undo history so every change, formatting included, undoes
   in order.

   Screenshots can be pasted, dropped or chosen; they are kept as files by
   folio.js and shown here from there. */

import * as F from './folio.js';
import { el } from './format.js';

const SVG = (d, extra = '') => '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"' + extra + '>' + d + '</svg>';
const ICON = {
  bold: '<span class="fe__glyph fe__glyph--b" aria-hidden="true">B</span>',
  italic: '<span class="fe__glyph fe__glyph--i" aria-hidden="true">I</span>',
  underline: '<span class="fe__glyph fe__glyph--u" aria-hidden="true">U</span>',
  strike: '<span class="fe__glyph fe__glyph--s" aria-hidden="true">S</span>',
  colour: '<span class="fe__glyph fe__glyph--a" aria-hidden="true">A</span>',
  highlight: SVG('<path d="M4.5 11.5 10.8 5.2l1.9 1.9-6.3 6.3H4.5Z M9.6 6.4l1.9 1.9M2.5 14h11"/>'),
  mark: SVG('<path d="M4.5 2.5h7v11L8 10.5l-3.5 3Z"/>'),
  eye: SVG('<path d="M1.75 8s2.25-4.25 6.25-4.25S14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8Z"/><circle cx="8" cy="8" r="1.75"/>'),
  ul: SVG('<path d="M6 4.5h7.5M6 8h7.5M6 11.5h7.5"/><circle cx="3" cy="4.5" r=".9"/><circle cx="3" cy="8" r=".9"/><circle cx="3" cy="11.5" r=".9"/>'),
  ol: SVG('<path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7M2.5 3.5l1-.75V6M2.4 9.3c.2-.5.6-.8 1.1-.8.6 0 1 .4 1 .9 0 .8-2.1 1.6-2.1 2.6h2.1"/>'),
  quote: SVG('<path d="M3 4.5v7M6 5.5h7M6 8h7M6 10.5h4.5"/>'),
  image: SVG('<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.1"/><path d="m3 12 3.5-3.5 2.5 2.5 1.5-1.5L13 12"/>'),
  atlas: SVG('<circle cx="4" cy="4.5" r="1.75"/><circle cx="12" cy="4.5" r="1.75"/><circle cx="8" cy="11.5" r="1.75"/><path d="M5.6 5.6 7 9.9M10.4 5.6 9 9.9M5.75 4.5h4.5"/>'),
  clear: SVG('<path d="M3.5 3.5h9M8 3.5 6 12.5M10 9.5l3.5 3.5M13.5 9.5 10 13"/>'),
  undo: SVG('<path d="M5.5 4 2.5 7l3 3M2.75 7H10a3.5 3.5 0 0 1 0 7H7.5"/>'),
  redo: SVG('<path d="M10.5 4l3 3-3 3M13.25 7H6a3.5 3.5 0 0 0 0 7h2.5"/>'),
};
const COLOUR_NAMES = { '': 'Default', dim: 'Dim', faint: 'Faint', amber: 'Amber', blue: 'Blue', violet: 'Violet' };
const HL_NAMES = { '': 'None', grey: 'Grey', amber: 'Amber', blue: 'Blue', violet: 'Violet' };
const INLINE = ['STRONG', 'EM', 'U', 'S', 'MARK', 'SPAN', 'CODE'];

export function createEditor({ html = '', onChange = () => {}, onBackground = null, showHidden = false, onShowHidden = () => {} } = {}) {
  const root = el('div', 'fe');
  const bar = el('div', 'fe__bar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Formatting');
  const docEl = el('div', 'fe__doc');
  docEl.contentEditable = 'true';
  docEl.spellcheck = true;
  docEl.setAttribute('role', 'textbox');
  docEl.setAttribute('aria-multiline', 'true');
  docEl.setAttribute('aria-label', 'Page text');
  docEl.dataset.placeholder = 'Write, paste a screenshot, or drop one here.';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';
  file.multiple = true;
  file.hidden = true;
  const status = el('p', 'fe__note');
  status.setAttribute('role', 'status');
  root.append(bar, docEl, file, status);
  if (showHidden) docEl.classList.add('fe__doc--hidden-shown');

  /* ------------------------------------------------------------ selection */

  let saved = null;
  const inDoc = (n) => n && (n === docEl || docEl.contains(n));
  const onSel = () => {
    const s = getSelection();
    if (s.rangeCount && inDoc(s.anchorNode)) { saved = s.getRangeAt(0).cloneRange(); syncBar(); }
  };
  document.addEventListener('selectionchange', onSel);
  function range() {
    const s = getSelection();
    if (s.rangeCount && inDoc(s.getRangeAt(0).commonAncestorContainer)) return s.getRangeAt(0);
    return null;
  }
  /* the live selection, if it is in the page; otherwise the one saved before
     focus went to the toolbar or the style menu */
  function restore() {
    const live = getSelection();
    if (live.rangeCount && inDoc(live.getRangeAt(0).commonAncestorContainer) && document.activeElement === docEl) {
      saved = live.getRangeAt(0).cloneRange();
      return;
    }
    docEl.focus({ preventScroll: true });
    if (saved && inDoc(saved.commonAncestorContainer)) {
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(saved);
    }
  }
  function offset(node, off) {
    const r = document.createRange();
    r.setStart(docEl, 0);
    try { r.setEnd(node, off); } catch (e) { return 0; }
    return r.toString().length;
  }
  function offsets() {
    const r = range() || saved;
    if (!r || !inDoc(r.commonAncestorContainer)) return null;
    return [offset(r.startContainer, r.startOffset), offset(r.endContainer, r.endOffset)];
  }
  function pointAt(n) {
    const w = document.createTreeWalker(docEl, NodeFilter.SHOW_TEXT);
    let t, acc = 0, last = null;
    while ((t = w.nextNode())) {
      if (acc + t.length >= n) return [t, n - acc];
      acc += t.length;
      last = t;
    }
    return last ? [last, last.length] : [docEl, docEl.childNodes.length];
  }
  function select(o) {
    if (!o) return;
    const [a, b] = o.map(pointAt);
    const r = document.createRange();
    try { r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); } catch (e) { return; }
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    saved = r.cloneRange();
  }
  function caretAt(node) {
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(true);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    saved = r.cloneRange();
  }

  /* ------------------------------------------------------------ history */

  const hist = [];
  let at = -1, typing = null;
  function snap() {
    const h = docEl.innerHTML;
    if (at >= 0 && hist[at].html === h) { hist[at].sel = offsets(); return; }
    hist.splice(at + 1);
    hist.push({ html: h, sel: offsets() });
    if (hist.length > 300) hist.shift();
    at = hist.length - 1;
  }
  function flushTyping() { if (typing) { clearTimeout(typing); typing = null; snap(); } }
  function show(st) {
    docEl.innerHTML = st.html;
    hydrate(docEl);
    docEl.focus({ preventScroll: true });
    select(st.sel);
    emit();
    syncBar();
  }
  function undo() { flushTyping(); if (at > 0) { at--; show(hist[at]); } }
  function redo() { flushTyping(); if (at < hist.length - 1) { at++; show(hist[at]); } }

  let emitTimer = null;
  function emit() {
    docEl.classList.toggle('is-empty', !docEl.textContent.trim() && !docEl.querySelector('img,.fbg'));
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = setTimeout(() => { emitTimer = null; onChange(getHTML()); }, 250);
  }

  /* run a change: from the saved selection, then tidy, record and report it.
     fn may return a node to put the caret in; otherwise the selection stays. */
  function op(fn) {
    flushTyping();
    restore();
    const before = offsets();
    const target = fn();
    tidy();
    docEl.focus({ preventScroll: true });
    if (target && target.nodeType) caretAt(target); else select(before);
    snap();
    emit();
    syncBar();
  }

  /* ------------------------------------------------------------ inline formatting */

  const ancestor = (node, test) => { for (let n = node.parentNode; n && n !== docEl; n = n.parentNode) if (n.nodeType === 1 && test(n)) return n; return null; };
  const inCard = (n) => !!ancestor(n, (x) => x.classList && x.classList.contains('fbg'));

  /* the text nodes a range covers, split so they lie wholly inside it */
  function textIn(r) {
    const out = [];
    const w = document.createTreeWalker(docEl, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) {
      if (!t.length || !r.intersectsNode(t)) continue;
      if (t === r.endContainer && r.endOffset === 0) continue;
      if (t === r.startContainer && r.startOffset === t.length) continue;
      out.push(t);
    }
    if (!out.length) return out;
    const first = out[0], last = out[out.length - 1];
    if (last === r.endContainer && r.endOffset < last.length) last.splitText(r.endOffset);
    if (first === r.startContainer && r.startOffset > 0) {
      const rest = first.splitText(r.startOffset);
      if (last === first) out[out.length - 1] = rest;
      out[0] = rest;
    }
    return out.filter((n) => !inCard(n));
  }
  function wrap(t, make) { const w = make(); t.parentNode.insertBefore(w, t); w.appendChild(t); }
  function unwrap(w) { while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w); w.remove(); }
  /* take wrappers that pass `test` off these text nodes only: any other text
     inside those wrappers is wrapped again, so it keeps its formatting */
  function strip(nodes, test) {
    const chosen = new Set(nodes);
    const wrappers = new Set();
    for (const t of nodes) { let a = ancestor(t, test); while (a) { wrappers.add(a); a = ancestor(a, test); } }
    for (const w of wrappers) {
      if (!w.parentNode) continue;
      const inner = [];
      const tw = document.createTreeWalker(w, NodeFilter.SHOW_TEXT);
      let x;
      while ((x = tw.nextNode())) inner.push(x);
      const proto = w.cloneNode(false);
      unwrap(w);
      for (const x2 of inner) if (!chosen.has(x2) && !ancestor(x2, test)) wrap(x2, () => proto.cloneNode(false));
    }
  }
  function toggle(tag) {
    op(() => {
      const r = range();
      if (!r || r.collapsed) return;
      const nodes = textIn(r);
      const is = (n) => n.tagName === tag;
      const on = nodes.length && nodes.every((t) => ancestor(t, is));
      if (on) strip(nodes, is);
      else nodes.forEach((t) => { if (!ancestor(t, is)) wrap(t, () => document.createElement(tag)); });
    });
  }
  /* a colour or highlight: one per piece of text, replacing any other */
  function paint(kind, value) {
    op(() => {
      const r = range();
      if (!r || r.collapsed) return;
      const nodes = textIn(r);
      const is = kind === 'tc' ? (n) => n.tagName === 'SPAN' && [...n.classList].some((c) => c.startsWith('tc-')) : (n) => n.tagName === 'MARK';
      strip(nodes, is);
      if (value) nodes.forEach((t) => wrap(t, () => { const e = document.createElement(kind === 'tc' ? 'span' : 'mark'); e.className = kind + '-' + value; return e; }));
    });
  }
  /* mark as important: shown on the page, or hidden; or remove the mark */
  function mark(mode) {
    op(() => {
      const r = range();
      if (!r || r.collapsed) return;
      const nodes = textIn(r);
      const figs = [...docEl.querySelectorAll('figure.fimg')].filter((f) => r.intersectsNode(f));
      const is = (n) => n.tagName === 'SPAN' && n.classList.contains('imp');
      strip(nodes, is);
      figs.forEach((f) => { f.classList.remove('imp', 'imp--shown', 'imp--hidden'); f.removeAttribute('data-imp'); });
      if (!mode) return;
      const id = 'm' + Math.random().toString(36).slice(2, 10);
      nodes.forEach((t) => {
        if (!t.textContent.trim()) return;
        wrap(t, () => { const e = document.createElement('span'); e.className = 'imp imp--' + mode; e.setAttribute('data-imp', id); return e; });
      });
      figs.forEach((f) => { f.classList.add('imp', 'imp--' + mode); f.setAttribute('data-imp', id); });
    });
    say(mode === 'shown' ? 'Marked as important. The Digest gathers it.' : mode === 'hidden' ? 'Marked as important, without a mark on the page. The Digest gathers it.' : 'Mark removed.');
  }
  function clearFormat() {
    op(() => {
      const r = range();
      if (!r || r.collapsed) return;
      strip(textIn(r), (n) => ['STRONG', 'EM', 'U', 'S', 'MARK', 'CODE'].includes(n.tagName) || (n.tagName === 'SPAN' && !n.classList.contains('imp')));
    });
  }
  /* merge neighbouring twins, drop empty wrappers, join text */
  function tidy() {
    for (const e of [...docEl.querySelectorAll(INLINE.join(','))]) {
      if (!e.parentNode) continue;
      const prev = e.previousSibling;
      if (prev && prev.nodeType === 1 && prev.tagName === e.tagName && prev.className === e.className && prev.getAttribute('data-imp') === e.getAttribute('data-imp')) {
        while (e.firstChild) prev.appendChild(e.firstChild);
        e.remove();
      }
    }
    for (const e of [...docEl.querySelectorAll(INLINE.join(','))]) if (!e.textContent && !e.querySelector('img,br')) e.remove();
    docEl.normalize();
  }

  /* ------------------------------------------------------------ blocks */

  function block(tag) {
    op(() => { document.execCommand('formatBlock', false, tag); });
  }
  function list(ordered) {
    op(() => { document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList'); });
  }
  /* put a block (a screenshot, a background card) after the caret's block */
  function insertBlock(node) {
    op(() => {
      const r = range() || saved;
      let b = r && inDoc(r.endContainer) ? r.endContainer : null;
      while (b && b.parentNode !== docEl) b = b.parentNode;
      if (b) b.after(node); else docEl.appendChild(node);
      if (b && b.tagName === 'P' && !b.textContent.trim() && !b.querySelector('img')) b.remove();
      let next = node.nextElementSibling;
      if (!next || next.tagName !== 'P') { next = document.createElement('p'); next.appendChild(document.createElement('br')); node.after(next); }
      hydrate(node);
      return next;
    });
  }
  function insertHTML(clean) {
    op(() => {
      const r = range() || saved;
      if (!r) return null;
      r.deleteContents();
      const t = document.createElement('template');
      t.innerHTML = clean;
      const kids = [...t.content.childNodes];
      if (kids.length === 1 && kids[0].tagName === 'P') {
        const frag = document.createDocumentFragment();
        const inner = [...kids[0].childNodes];
        inner.forEach((n) => frag.appendChild(n));
        const last = inner[inner.length - 1];
        r.insertNode(frag);
        if (last) { const c = document.createRange(); c.setStartAfter(last); c.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(c); saved = c.cloneRange(); }
        return null;
      }
      let b = r.endContainer;
      while (b && b.parentNode !== docEl) b = b.parentNode;
      let after = b;
      for (const k of kids) { if (after) after.after(k); else docEl.appendChild(k); after = k; }
      hydrate(docEl);
      return after;
    });
  }

  /* ------------------------------------------------------------ screenshots */

  async function addImages(files) {
    for (const f of files) {
      say('Keeping the screenshot.');
      try {
        const id = await F.keepImage(f);
        const fig = document.createElement('figure');
        fig.className = 'fimg';
        const img = document.createElement('img');
        img.setAttribute('data-img', id);
        img.alt = '';
        const cap = document.createElement('figcaption');
        fig.append(img, cap);
        insertBlock(fig);
        say(F.persistent ? 'Screenshot added.' : 'Screenshot added. In the design preview it is kept only until the page reloads.');
      } catch (e) {
        say('The screenshot could not be added: ' + String(e && e.message ? e.message : e));
      }
    }
  }
  /* screenshots get their pictures; background cards are not typed into */
  function hydrate(scope) {
    const nodes = scope.matches && scope.matches('img[data-img]') ? [scope] : [...scope.querySelectorAll('img[data-img]')];
    for (const img of nodes) {
      if (img.getAttribute('src')) continue;
      const id = img.getAttribute('data-img');
      F.imageSrc(id).then((src) => { if (src) img.src = src; else img.alt = 'This screenshot is kept only in the installed app.'; })
        .catch(() => { img.alt = 'This screenshot is missing from the Folio\'s image folder.'; img.closest('figure') && img.closest('figure').classList.add('is-missing'); });
    }
    const cards = scope.classList && scope.classList.contains('fbg') ? [scope] : [...scope.querySelectorAll('.fbg')];
    cards.forEach((c) => { c.contentEditable = 'false'; });
  }

  function say(text) { status.textContent = text; }

  /* ------------------------------------------------------------ the toolbar */

  const buttons = {};
  function btn(key, label, icon, run, shortcut) {
    const b = el('button', 'fe__btn');
    b.type = 'button';
    b.innerHTML = icon;
    b.setAttribute('aria-label', label + (shortcut ? ' (' + shortcut + ')' : ''));
    b.dataset.tip = label + (shortcut ? ' · ' + shortcut : '');
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', run);
    buttons[key] = b;
    return b;
  }
  function group(...items) { const g = el('div', 'fe__group'); g.append(...items); return g; }
  /* a small menu under a button */
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.menu.hidden = true; openMenu.btn.setAttribute('aria-expanded', 'false'); openMenu = null; } }
  function menu(key, label, icon, items, shortcut) {
    const wrapEl = el('div', 'fe__menuwrap');
    const m = el('div', 'fe__menu');
    m.setAttribute('role', 'menu');
    m.hidden = true;
    const b = btn(key, label, icon, () => {
      if (openMenu && openMenu.menu === m) { closeMenu(); return; }
      closeMenu();
      m.hidden = false;
      b.setAttribute('aria-expanded', 'true');
      openMenu = { menu: m, btn: b };
      const first = m.querySelector('button');
      if (first && document.activeElement === b) first.focus();
    }, shortcut);
    b.setAttribute('aria-haspopup', 'menu');
    b.setAttribute('aria-expanded', 'false');
    for (const [text, run, cls] of items) {
      const it = el('button', 'fe__item' + (cls ? ' ' + cls : ''));
      it.type = 'button';
      it.setAttribute('role', 'menuitem');
      it.appendChild(el('span', 'fe__sw', ''));
      it.appendChild(el('span', '', text));
      it.addEventListener('mousedown', (e) => e.preventDefault());
      it.addEventListener('click', () => { closeMenu(); run(); });
      m.appendChild(it);
    }
    m.addEventListener('keydown', (e) => {
      const list = [...m.querySelectorAll('button')];
      const i = list.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); b.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    });
    wrapEl.append(b, m);
    return wrapEl;
  }
  const onDocClick = (e) => { if (openMenu && !openMenu.menu.parentNode.contains(e.target)) closeMenu(); };
  document.addEventListener('mousedown', onDocClick);

  const kind = el('select', 'inp inp--sm fe__kind');
  kind.setAttribute('aria-label', 'Text style');
  [['P', 'Paragraph'], ['H1', 'Heading 1'], ['H2', 'Heading 2'], ['H3', 'Heading 3'], ['BLOCKQUOTE', 'Quote']].forEach(([v, t]) => kind.appendChild(new Option(t, v)));
  kind.addEventListener('change', () => block(kind.value));

  const showBtn = btn('eye', 'Show hidden marks while writing', ICON.eye, () => {
    const on = !docEl.classList.contains('fe__doc--hidden-shown');
    docEl.classList.toggle('fe__doc--hidden-shown', on);
    showBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    onShowHidden(on);
  });
  showBtn.setAttribute('aria-pressed', showHidden ? 'true' : 'false');

  bar.append(
    group(kind),
    group(
      btn('bold', 'Bold', ICON.bold, () => toggle('STRONG'), 'Ctrl+B'),
      btn('italic', 'Italic', ICON.italic, () => toggle('EM'), 'Ctrl+I'),
      btn('underline', 'Underline', ICON.underline, () => toggle('U'), 'Ctrl+U'),
      btn('strike', 'Strikethrough', ICON.strike, () => toggle('S')),
    ),
    group(
      menu('colour', 'Text colour', ICON.colour, Object.entries(COLOUR_NAMES).map(([k, n]) => [n, () => paint('tc', k), 'fe__item--tc-' + (k || 'default')])),
      menu('highlight', 'Highlight', ICON.highlight, Object.entries(HL_NAMES).map(([k, n]) => [n, () => paint('hl', k), 'fe__item--hl-' + (k || 'none')]), 'Ctrl+Shift+H'),
    ),
    group(
      menu('mark', 'Mark as important', ICON.mark, [
        ['Mark, shown on the page', () => mark('shown'), 'fe__item--mark-shown'],
        ['Mark, hidden on the page', () => mark('hidden'), 'fe__item--mark-hidden'],
        ['Remove the mark', () => mark(null), 'fe__item--mark-none'],
      ], 'Ctrl+M'),
      showBtn,
    ),
    group(
      btn('ul', 'Bulleted list', ICON.ul, () => list(false)),
      btn('ol', 'Numbered list', ICON.ol, () => list(true)),
      btn('quote', 'Quote', ICON.quote, () => block(kind.value === 'BLOCKQUOTE' ? 'P' : 'BLOCKQUOTE')),
    ),
    group(
      btn('image', 'Add a screenshot', ICON.image, () => { flushTyping(); file.click(); }),
      onBackground ? btn('atlas', 'Add the background from Atlas', ICON.atlas, async () => {
        say('Reading Atlas.');
        const card = await onBackground();
        if (card) { insertBlock(card); say('Background added: the figures Atlas held just now, with their sources.'); }
        else say('Atlas has no figures yet. Open an Atlas page to fetch them, then try again.');
      }) : null,
    ),
    group(
      btn('clear', 'Clear formatting', ICON.clear, clearFormat),
      btn('undo', 'Undo', ICON.undo, undo, 'Ctrl+Z'),
      btn('redo', 'Redo', ICON.redo, redo, 'Ctrl+Y'),
    ),
  );
  [...bar.querySelectorAll('.fe__group')].forEach((g) => { if (!g.childElementCount) g.remove(); });

  file.addEventListener('change', () => { const fs = [...file.files]; file.value = ''; if (fs.length) addImages(fs); });

  /* which buttons are on, for where the caret is */
  function syncBar() {
    const r = range();
    if (!r) return;
    const n = r.startContainer.nodeType === 3 ? r.startContainer : r.startContainer.childNodes[r.startOffset] || r.startContainer;
    const has = (tag) => !!(n && (ancestor(n, (x) => x.tagName === tag) || (n.tagName === tag)));
    [['bold', 'STRONG'], ['italic', 'EM'], ['underline', 'U'], ['strike', 'S']].forEach(([k, tag]) => buttons[k].setAttribute('aria-pressed', has(tag) ? 'true' : 'false'));
    let b = n;
    while (b && b.parentNode && b.parentNode !== docEl) b = b.parentNode;
    const tag = b && b.tagName ? b.tagName : 'P';
    kind.value = ['H1', 'H2', 'H3', 'BLOCKQUOTE'].includes(tag) ? tag : 'P';
  }

  /* ------------------------------------------------------------ keys, paste, drop */

  docEl.addEventListener('beforeinput', (e) => {
    const t = e.inputType;
    if (t === 'historyUndo') { e.preventDefault(); undo(); }
    else if (t === 'historyRedo') { e.preventDefault(); redo(); }
    else if (t === 'formatBold') { e.preventDefault(); toggle('STRONG'); }
    else if (t === 'formatItalic') { e.preventDefault(); toggle('EM'); }
    else if (t === 'formatUnderline') { e.preventDefault(); toggle('U'); }
    else if (t === 'formatStrikeThrough') { e.preventDefault(); toggle('S'); }
  });
  docEl.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = (e.key || '').toLowerCase();
    if (e.key === 'Escape' && openMenu) { closeMenu(); return; }
    if (!mod) return;
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (k === 'b') { e.preventDefault(); toggle('STRONG'); }
    else if (k === 'i') { e.preventDefault(); toggle('EM'); }
    else if (k === 'u') { e.preventDefault(); toggle('U'); }
    else if (k === 'm') { e.preventDefault(); mark(e.shiftKey ? 'hidden' : 'shown'); }
    else if (k === 'h' && e.shiftKey) { e.preventDefault(); paint('hl', 'grey'); }
    else if (e.altKey && ['0', '1', '2', '3'].includes(e.key)) { e.preventDefault(); block(e.key === '0' ? 'P' : 'H' + e.key); }
  });
  docEl.addEventListener('input', () => {
    if (typing) clearTimeout(typing);
    typing = setTimeout(() => { typing = null; snap(); }, 500);
    emit();
  });
  docEl.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const imgs = [...cd.files].filter((f) => f.type.startsWith('image/'));
    if (imgs.length) { e.preventDefault(); addImages(imgs); return; }
    const html = cd.getData('text/html');
    if (html) { e.preventDefault(); insertHTML(F.clean(html)); return; }
    const text = cd.getData('text/plain');
    if (text) { e.preventDefault(); flushTyping(); document.execCommand('insertText', false, text); snap(); emit(); }
  });
  docEl.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.items].some((i) => i.kind === 'file')) e.preventDefault(); });
  docEl.addEventListener('drop', (e) => {
    const imgs = e.dataTransfer ? [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')) : [];
    if (!imgs.length) return;
    e.preventDefault();
    const at2 = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (at2 && inDoc(at2.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(at2); saved = at2.cloneRange(); }
    addImages(imgs);
  });
  /* a click on a screenshot selects it, so it can be marked or deleted */
  docEl.addEventListener('click', (e) => {
    const fig = e.target.closest && e.target.closest('figure.fimg');
    if (fig && e.target.tagName === 'IMG') {
      const r = document.createRange();
      r.selectNode(fig);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      saved = r.cloneRange();
    }
  });

  /* ------------------------------------------------------------ in and out */

  function getHTML() { return F.clean(docEl.innerHTML); }
  function setHTML(h) {
    docEl.innerHTML = h && h.trim() ? h : '<p><br></p>';
    hydrate(docEl);
    hist.length = 0; at = -1;
    snap();
    docEl.classList.toggle('is-empty', !docEl.textContent.trim() && !docEl.querySelector('img,.fbg'));
  }
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* the browser's default is fine */ }
  setHTML(html);

  /* go to a marked line and light it briefly */
  function reveal(markId) {
    const target = docEl.querySelector('[data-imp="' + CSS.escape(markId) + '"]');
    if (!target) return false;
    target.scrollIntoView({ block: 'center', behavior: document.documentElement.classList.contains('rm') ? 'auto' : 'smooth' });
    docEl.querySelectorAll('[data-imp="' + CSS.escape(markId) + '"]').forEach((n) => {
      n.classList.add('is-found');
      setTimeout(() => n.classList.remove('is-found'), 1800);
    });
    return true;
  }

  return {
    el: root,
    doc: docEl,
    getHTML,
    setHTML,
    reveal,
    focus: () => docEl.focus(),
    flush: () => { flushTyping(); if (emitTimer) { clearTimeout(emitTimer); emitTimer = null; onChange(getHTML()); } },
    destroy: () => {
      document.removeEventListener('selectionchange', onSel);
      document.removeEventListener('mousedown', onDocClick);
    },
  };
}
