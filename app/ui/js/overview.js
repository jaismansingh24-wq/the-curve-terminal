/* Overview: every entry, newest first, found by words and filtered by
   instrument, side, account, setup, mistake and period (or dates). A row
   opens its entry (click it, or Enter when it has focus). "Stats for these
   trades" opens Stats on exactly the entries shown. */

import * as J from './journal.js';
import * as settings from './settings.js';
import { shortDateET, timeET } from './time.js';
import { formatPrice } from './instruments.js';
import { el, trades, UNIT_LABEL, simTag } from './format.js';
import { resultNode, dots } from './home.js';
import { go } from './router.js';
import { isNative } from '../shared/js/native.js';
import { blank, matcher, isBlank, fold } from './entry-filter.js';
import { statsFor } from './stats-view.js';

const filters = blank();

/* a select's choices from what the entries use, keeping the choice made
   when it is still there */
function fillSelect(key, values, label = (v) => v) {
  const sel = document.querySelector('[data-filter="' + key + '"]');
  const first = sel.options[0] ? sel.options[0].text : 'All';
  sel.replaceChildren(new Option(first, ''), ...values.map((v) => new Option(label(v), v)));
  const keep = values.find((v) => fold(v) === fold(filters[key]));
  sel.value = keep || '';
  filters[key] = sel.value;
}

function fillFilters() {
  const all = J.all();
  const uniq = (list) => {
    const seen = new Map();
    for (const v of list) { const t = String(v || '').trim(); if (t && !seen.has(fold(t))) seen.set(fold(t), t); }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  };
  fillSelect('instrument', uniq(all.map((e) => e.instrument)));
  fillSelect('account', uniq([...J.allAccounts().map((a) => a.name), ...all.map((e) => e.account)]));
  fillSelect('setup', uniq(all.map((e) => e.setup)));
  fillSelect('mistake', uniq(all.flatMap((e) => e.mistakes || [])));
  document.querySelectorAll('[data-filter-range]').forEach((r) => { r.hidden = filters.period !== 'range'; });
}

export function renderOverview() {
  const s = settings.get();
  fillFilters();
  const all = J.all();
  const match = matcher(filters, s);
  const rows = all.map((e) => ({ e, r: J.result(e, s) })).filter(({ e, r }) => match(e, r));

  const body = document.querySelector('[data-rows]');
  body.replaceChildren();
  for (const { e, r } of rows) {
    const tr = el('tr');
    tr.tabIndex = 0;
    tr.dataset.id = e.id;
    tr.setAttribute('aria-label', (J.isSim(e) ? 'Simulated: ' : '') + e.instrument + ' ' + e.direction + ', ' + shortDateET(r.at) + '. Open the entry.');
    const when = el('td', 'num');
    when.append(el('span', '', shortDateET(r.at) + ' '), el('span', 'dim', timeET(r.at)));
    tr.appendChild(when);
    const insCell = el('td', '', e.instrument + ' ');
    if (J.isSim(e)) insCell.appendChild(simTag());
    tr.appendChild(insCell);
    tr.appendChild(el('td', 'dim', e.direction === 'short' ? 'Short' : 'Long'));
    tr.appendChild(el('td', 'r', String(e.contracts)));
    tr.appendChild(el('td', 'r', formatPrice(e.instrument, e.entryPrice)));
    tr.appendChild(el('td', 'r', formatPrice(e.instrument, e.exitPrice)));
    const res = el('td', 'r');
    res.appendChild(resultNode(e, r, s));
    tr.appendChild(res);
    tr.appendChild(el('td', 'conf', e.confluence));
    const c = el('td', 'r');
    c.appendChild(dots(e.confidence));
    tr.appendChild(c);
    body.appendChild(tr);
  }

  document.querySelector('[data-result-head]').textContent = 'Result, ' + (s.basis === 'gross' ? 'gross' : 'net') + (s.units === 'money' ? '' : ', ' + UNIT_LABEL[s.units].toLowerCase());
  const empty = document.querySelector('[data-over-empty]');
  empty.hidden = rows.length > 0;
  empty.textContent = all.length ? 'No entries match these filters.' : J.emptyNote() || 'No entries yet. New entry, in the menu, starts your journal.';
  document.querySelector('[data-over-count]').textContent = all.length
    ? (rows.length === all.length ? trades(all.length) + ', newest first.' : rows.length + ' of ' + trades(all.length) + ' match these filters.')
    : 'Every entry, newest first.';
  const toStats = document.querySelector('[data-over-stats]');
  const filtered = !isBlank(filters);
  toStats.textContent = filtered ? 'Stats for these ' + trades(rows.length) : 'Stats for every trade';
  toStats.disabled = rows.length === 0;
  document.querySelector('[data-over-clear]').hidden = !filtered;
  document.querySelectorAll('[data-reveal]').forEach((b) => { b.hidden = !isNative; });
}

export function initOverview() {
  let typing = null;
  document.querySelectorAll('[data-filter]').forEach((inp) => {
    const take = () => { filters[inp.dataset.filter] = inp.value; renderOverview(); };
    if (inp.type === 'search') {
      /* words are looked for as they are typed, a moment after the last key */
      inp.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(take, 160); });
    } else inp.addEventListener('change', take);
  });
  document.querySelector('[data-over-clear]').addEventListener('click', () => {
    Object.assign(filters, blank());
    document.querySelectorAll('[data-filter]').forEach((inp) => { inp.value = ''; });
    renderOverview();
    document.querySelector('[data-filter="q"]').focus();
  });
  document.querySelector('[data-over-stats]').addEventListener('click', () => { statsFor(filters); go('/stats'); });
  const body = document.querySelector('[data-rows]');
  const open = (tr) => { if (tr && tr.dataset.id) go('/entry/' + tr.dataset.id); };
  body.addEventListener('click', (e) => open(e.target.closest('tr')));
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e.target.closest('tr')); });
}
