/* One entry's own page: everything recorded, the result in every unit, and
   Edit and Delete. Slippage is labelled as estimated: it compares the price
   you meant to get with the one you typed, not an order record. */

import * as J from './journal.js';
import * as settings from './settings.js';
import { longDateET, shortDateET, timeBoth, duration } from './time.js';
import { formatPrice, CHECKED } from './instruments.js';
import { money, unit, tone, el, simTag } from './format.js';
import { resultNode, dots } from './home.js';
import { go } from './router.js';

let shown = null;
const BIAS = { up: 'Up', down: 'Down', balanced: 'Balanced' };
const CHECK = { met: 'Met', partly: 'Partly', not: 'Not met' };

function group(title, rows, cls = '') {
  const sec = el('section', 'dgroup glass glass--quiet ' + cls);
  sec.appendChild(el('h2', 'kicker', title));
  const dl = el('dl');
  for (const [k, v, sub, num] of rows) {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    const row = el('div', 'row');
    row.appendChild(el('dt', '', k));
    const dd = el('dd', num ? 'num' : '');
    if (v instanceof Node) dd.appendChild(v); else dd.textContent = String(v);
    if (sub) dd.appendChild(el('span', 'sub', sub));
    row.appendChild(dd);
    dl.appendChild(row);
  }
  if (!dl.children.length) return null;
  sec.appendChild(dl);
  return sec;
}

function tags(list) {
  if (!list || !list.length) return null;
  const t = el('span', 'tags');
  list.forEach((x) => t.appendChild(el('span', 'tag', x)));
  return t;
}

export function renderEntry(id) {
  const e = J.byId(id);
  const box = document.querySelector('[data-entry-detail]');
  box.replaceChildren();
  shown = e;
  if (!e) {
    document.querySelector('[data-entry-title]').textContent = 'Entry not found';
    document.querySelector('[data-entry-kicker]').textContent = 'Journal · Entry';
    document.querySelector('[data-entry-result]').textContent = 'It may have been deleted. Overview lists every entry there is.';
    return;
  }
  const s = settings.get();
  const r = J.result(e, s);
  const p = (v) => (Number.isFinite(v) ? '@ ' + formatPrice(e.instrument, v) : null);

  document.querySelector('[data-entry-kicker]').textContent = 'Journal · ' + (J.isSim(e) ? 'Simulated entry · ' : '') + longDateET(r.at);
  if (J.isSim(e)) {
    const n = el('p', 'simnote simnote--wide');
    n.append(simTag(), document.createTextNode(' This entry is simulated: generated on real NQ prices, not a real trade.'));
    box.appendChild(n);
  }
  document.querySelector('[data-entry-title]').textContent = e.instrument + ' ' + e.direction + ', ' + e.contracts + (e.contracts === 1 ? ' contract' : ' contracts');
  const res = document.querySelector('[data-entry-result]');
  const costs = 'costs ' + money(r.costs, { sign: false }) + (r.costsFrom === 'default' ? ' (your default)' : r.costsFrom === 'none' ? ' (none recorded)' : '');
  res.replaceChildren(resultNode(e, r, s), document.createTextNode(s.basis === 'gross'
    ? 'gross · net ' + money(r.net) + ' · ' + costs
    : 'net · gross ' + money(r.gross) + ' · ' + costs));
  document.querySelector('[data-entry-edit]').href = '#/edit/' + e.id;

  const entryMs = Date.parse(e.entryAt), exitMs = e.exitAt ? Date.parse(e.exitAt) : null;
  const slip = Number.isFinite(e.intendedEntry)
    ? ((e.entryPrice - e.intendedEntry) * (e.direction === 'short' ? -1 : 1)) / r.ins.tick : null;

  const groups = [
    group('Times', [
      ['Entry', timeBoth(entryMs), shortDateET(entryMs)],
      ['Exit', exitMs ? timeBoth(exitMs) : 'Not recorded', exitMs ? shortDateET(exitMs) : null],
      ['Held', r.held !== null ? duration(r.held) : null],
      ['Trading day', r.day, null, true],
      ['Typed in', (e.enteredZone || '').replace(/_/g, ' ')],
    ]),
    group('Prices and result', [
      ['Entry', p(e.entryPrice), null, true],
      ['Exit', p(e.exitPrice), (e.partials || []).length ? 'Final exit, for the contracts left' : null, true],
      ['Partials', (e.partials || []).length ? e.partials.map((x) => x.contracts + ' @ ' + formatPrice(e.instrument, x.price)).join(', ') : null, null, true],
      ['Ticks', unit(J.inUnit(r, e, 'ticks', s.basis), 'ticks'), 'Per contract, ' + (s.basis === 'gross' ? 'gross' : 'net of costs'), true],
      ['Points', unit(J.inUnit(r, e, 'points', s.basis), 'points'), 'Per contract', true],
      ['R', r.risk ? unit(J.inUnit(r, e, 'r', s.basis), 'r') : 'Needs an initial stop', r.risk ? 'Planned risk ' + money(r.risk, { sign: false }) : null, true],
    ]),
    group('Plan', [
      ['Initial stop', p(e.stop), null, true],
      ['Planned exit', p(e.plannedExit), null, true],
      ['Meant to enter', p(e.intendedEntry), null, true],
      ['Slippage', slip !== null ? (slip > 0 ? slip.toFixed(1) + ' ticks worse' : slip < 0 ? Math.abs(slip).toFixed(1) + ' ticks better' : 'None') : null, 'Estimated from the prices typed, not an order record'],
      ['Account', e.account],
      ['Bias', BIAS[e.bias] || null],
    ]),
    group('The trade', [
      ['Instrument', r.ins.name, r.ins.tick + ' tick = ' + money(r.ins.tickValue, { sign: false }) + ', per CME, checked ' + CHECKED],
      ['Main confluence', e.confluence],
      ['Confidence', dots(e.confidence)],
      ['Order flow', tags(e.orderflow)],
      ['Setup', e.setup],
      ['Checklist', CHECK[e.checklist] || null],
      ['Against you', Number.isFinite(e.mae) ? e.mae + ' points' : null, 'MAE, as typed', true],
      ['In your favour', Number.isFinite(e.mfe) ? e.mfe + ' points' : null, 'MFE, as typed', true],
    ]),
    group('You', [
      ['Mood', e.mood ? dots(e.mood) : null],
      ['Sleep', Number.isFinite(e.sleep) ? e.sleep + ' hours' : null],
      ['Followed plan', e.followedPlan === true ? 'Yes' : e.followedPlan === false ? 'No' : null],
      ['After your limit', e.afterLimit === true ? 'Yes' : e.afterLimit === false ? 'No' : null],
      ['Mistakes', tags(e.mistakes)],
    ]),
  ];
  groups.filter(Boolean).forEach((g) => box.appendChild(g));
  if (e.notes) {
    const n = el('section', 'dgroup dnotes glass glass--quiet');
    n.append(el('h2', 'kicker', 'Notes'), el('p', '', e.notes));
    box.appendChild(n);
  }
}

export function initEntry({ confirm }) {
  document.querySelector('[data-entry-delete]').addEventListener('click', () => {
    if (!shown) return;
    const s = settings.get();
    const r = J.result(shown, s);
    confirm(shown.instrument + ' ' + shown.direction + ', ' + shortDateET(r.at) + ', ' + money(r.net) + ' net.', async () => {
      await J.remove(shown.id);
      go('/overview');
    });
  });
}
