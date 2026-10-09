/* Overview: every entry, newest first, filtered by instrument, side and
   period. A row opens its entry (click it, or Enter when it has focus). */

import * as J from './journal.js';
import * as settings from './settings.js';
import { tradingDay, weekOf, monthOf, shortDateET, timeET } from './time.js';
import { formatPrice } from './instruments.js';
import { el, trades, UNIT_LABEL, simTag } from './format.js';
import { resultNode, dots } from './home.js';
import { go } from './router.js';
import { isNative } from '../shared/js/native.js';

const filters = { instrument: '', side: '', period: '' };

function fillInstrumentFilter() {
  const sel = document.querySelector('[data-filter="instrument"]');
  const used = [...new Set(J.all().map((e) => e.instrument))].sort();
  const keep = sel.value;
  sel.replaceChildren(new Option('All', ''), ...used.map((c) => new Option(c, c)));
  sel.value = used.includes(keep) ? keep : '';
  filters.instrument = sel.value;
}

export function renderOverview() {
  const s = settings.get();
  fillInstrumentFilter();
  const today = tradingDay(Date.now(), s.dayStart);
  const inPeriod = (day) => !filters.period
    || (filters.period === 'day' && day === today)
    || (filters.period === 'week' && weekOf(day) === weekOf(today))
    || (filters.period === 'month' && monthOf(day) === monthOf(today));

  const all = J.all();
  const rows = all
    .map((e) => ({ e, r: J.result(e, s) }))
    .filter(({ e, r }) => r && (!filters.instrument || e.instrument === filters.instrument)
      && (!filters.side || e.direction === filters.side) && inPeriod(r.day));

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
  empty.textContent = all.length ? 'No entries match these filters.' : J.hiddenNote() || 'No entries yet. New entry, in the menu, starts your journal.';
  document.querySelector('[data-over-count]').textContent = all.length
    ? (rows.length === all.length ? trades(all.length) + ', newest first.' : rows.length + ' of ' + trades(all.length) + ' match these filters.')
    : 'Every entry, newest first.';
  document.querySelectorAll('[data-reveal]').forEach((b) => { b.hidden = !isNative; });
}

export function initOverview() {
  document.querySelectorAll('[data-filter]').forEach((sel) => sel.addEventListener('change', () => {
    filters[sel.dataset.filter] = sel.value;
    renderOverview();
  }));
  const body = document.querySelector('[data-rows]');
  const open = (tr) => { if (tr && tr.dataset.id) go('/entry/' + tr.dataset.id); };
  body.addEventListener('click', (e) => open(e.target.closest('tr')));
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e.target.closest('tr')); });
}
