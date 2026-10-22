/* The first-run tour: a few cards on what each part of the app does and
   where things are. It opens once, after the opening animation; Esc or
   "Skip the tour" ends it, and Settings, under Help, opens it again. Kept
   on this computer: thecurve.terminal.toured, set when it ends.

   A card that points at something (the menu button, Settings) rings it and
   dims the rest; the others sit in the middle of the window. Keyboard: the
   card's buttons take focus in turn, Enter or the arrow keys move on, Esc
   ends it, and focus goes back where it was. */

import { get, set } from '../shared/js/store.js';

const STEPS = [
  {
    title: 'The Curve Terminal',
    text: 'A trading journal, a notebook for research, a replay to practise on, and the market\'s background from official public data, all kept on this computer. A few short cards on where things are.',
  },
  {
    target: '[data-menu-toggle]',
    title: 'The menu',
    text: 'The menu button at the top left opens every page, grouped as Journal, Folio, Practice and Atlas. M opens it too, and Home is always first in it.',
  },
  {
    title: 'Journal',
    text: 'New entry records a trade. Overview lists them all and finds them by words and filters. Stats works out the figures, each with what it measures and where it misleads. Calendar shows each trading day, and Accounts keeps prop and personal account rules, fees and payouts.',
  },
  {
    title: 'Folio and Practice',
    text: 'The Folio is a notebook: pages with headings, colour, screenshots and marked lines, which the Digest gathers from every page. Replay, under Practice, plays your own exported bars or trades forward so you can practise orders; its trades stay apart from the journal.',
  },
  {
    title: 'Atlas',
    text: 'Atlas is the market\'s background from official public data: rates, auctions, positioning, energy, currencies, scheduled releases and the Fed. This week lists what changed since Monday. It fetches only while one of its pages is open.',
  },
  {
    target: '.tb__tools',
    title: 'Settings and shortcuts',
    text: 'At the top right: Discord\'s status (a green dot when connected), the shortcuts list (?) and Settings (Ctrl+,). Settings holds text size, contrast, movement, the background, the journal\'s day and units, Discord and Atlas\'s fetching.',
  },
  {
    title: 'What it is not',
    text: 'It shows what happened, measured with its limits in view. It never tells you what to buy or sell. Privacy, Terms, Sources and What\'s new are at the foot of Home. Settings, under Help, opens this tour again.',
  },
];

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
let open = null;

export const toured = () => get('toured') !== null;

/* the tour, unless it has been seen; `force` opens it anyway */
export function startTour({ force = false, reduced = false } = {}) {
  if (open || (!force && toured())) return;
  const back = document.activeElement;
  const root = el('div', 'tour');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'tour-h');
  root.setAttribute('aria-describedby', 'tour-t');
  const ring = el('div', 'tour__ring');
  ring.setAttribute('aria-hidden', 'true');
  const card = el('div', 'tour__card glass');
  const kicker = el('p', 'kicker tour__k');
  const title = el('h2', 'title tour__title');
  title.id = 'tour-h';
  title.tabIndex = -1;
  const text = el('p', 'tour__text');
  text.id = 'tour-t';
  const acts = el('div', 'tour__acts');
  const skip = el('button', 'link tour__skip', 'Skip the tour');
  const prev = el('button', 'btn btn--quiet', 'Back');
  const next = el('button', 'btn btn--primary', 'Next');
  [skip, prev, next].forEach((b) => { b.type = 'button'; });
  const dots = el('div', 'tour__dots');
  dots.setAttribute('aria-hidden', 'true');
  STEPS.forEach(() => dots.appendChild(el('span', 'tour__dot')));
  acts.append(skip, dots, prev, next);
  card.append(kicker, title, text, acts);
  root.append(ring, card);
  if (reduced) root.classList.add('tour--still');
  document.body.appendChild(root);
  open = root;
  let k = 0;

  const place = () => {
    const s = STEPS[k];
    const t = s.target ? document.querySelector(s.target) : null;
    const r = t && t.getClientRects().length ? t.getBoundingClientRect() : null;
    root.classList.toggle('tour--ringed', !!r);
    const vw = window.innerWidth, vh = window.innerHeight;
    const cw = Math.min(440, vw - 32);
    card.style.width = cw + 'px';
    if (!r) {
      card.style.left = Math.round((vw - cw) / 2) + 'px';
      card.style.top = Math.round(Math.max(16, (vh - card.offsetHeight) / 2)) + 'px';
      return;
    }
    const pad = 6;
    ring.style.left = Math.round(r.left - pad) + 'px';
    ring.style.top = Math.round(r.top - pad) + 'px';
    ring.style.width = Math.round(r.width + pad * 2) + 'px';
    ring.style.height = Math.round(r.height + pad * 2) + 'px';
    const below = r.bottom + 16;
    const top = below + card.offsetHeight + 16 <= vh ? below : Math.max(16, r.top - 16 - card.offsetHeight);
    const left = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), vw - cw - 16);
    card.style.left = Math.round(left) + 'px';
    card.style.top = Math.round(top) + 'px';
  };
  const show = (to) => {
    k = Math.max(0, Math.min(STEPS.length - 1, to));
    const s = STEPS[k];
    kicker.textContent = 'Tour · ' + (k + 1) + ' of ' + STEPS.length;
    title.textContent = s.title;
    text.textContent = s.text;
    prev.hidden = k === 0;
    next.textContent = k === STEPS.length - 1 ? 'Done' : 'Next';
    [...dots.children].forEach((d, i) => d.classList.toggle('is-on', i === k));
    card.classList.remove('is-in');
    void card.offsetWidth;
    card.classList.add('is-in');
    place();
    title.focus();
  };
  const end = () => {
    set('toured', new Date().toISOString().slice(0, 10));
    window.removeEventListener('resize', place);
    document.removeEventListener('keydown', keys, true);
    root.remove();
    open = null;
    if (back && back.isConnected && typeof back.focus === 'function') back.focus();
  };
  const keys = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); if (k < STEPS.length - 1) show(k + 1); return; }
    if (e.key === 'Enter' && document.activeElement === title) { e.preventDefault(); e.stopPropagation(); next.click(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); if (k > 0) show(k - 1); return; }
    if (e.key === 'Tab') {
      /* focus stays on the card */
      const list = [skip, prev, next].filter((b) => !b.hidden);
      const i = list.indexOf(document.activeElement);
      e.preventDefault();
      e.stopPropagation();
      list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length].focus();
      return;
    }
    /* the app's own one-key shortcuts wait until the tour has ended */
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) e.stopPropagation();
  };
  skip.addEventListener('click', end);
  prev.addEventListener('click', () => show(k - 1));
  next.addEventListener('click', () => (k === STEPS.length - 1 ? end() : show(k + 1)));
  window.addEventListener('resize', place);
  document.addEventListener('keydown', keys, true);
  show(0);
}
