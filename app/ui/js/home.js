/* The home screen's journal parts: recent entries, the last entry, and
   profit and loss for today's trading day, this week and this month. A
   period with no closed trades says so, rather than showing a zero. */

import * as J from './journal.js';
import * as settings from './settings.js';
import { money, unit, tone, trades, el, UNIT_LABEL, simTag } from './format.js';
import { shortDateET, timeBoth, boundaryText } from './time.js';
import { formatPrice } from './instruments.js';

const SIDE = { long: 'long', short: 'short' };

export function dots(n) {
  const d = el('span', 'dots');
  d.setAttribute('role', 'img');
  d.setAttribute('aria-label', 'Confidence ' + n + ' of 5');
  for (let i = 1; i <= 5; i++) d.appendChild(el('i', i <= n ? 'on' : ''));
  return d;
}

/* a result in the chosen unit, coloured, or a dash when it cannot be shown */
export function resultNode(e, r, s, cls = '') {
  const v = J.inUnit(r, e, s.units, s.basis);
  if (v === null) return el('span', 'dim ' + cls, s.units === 'r' ? 'no stop' : '');
  return el('span', tone(v) + ' ' + cls, unit(v, s.units));
}

function recent(s) {
  const list = document.querySelector('[data-recent]');
  const empty = document.querySelector('[data-recent-empty]');
  const items = J.all().slice(0, 6);
  list.replaceChildren();
  empty.hidden = items.length > 0;
  for (const e of items) {
    const r = J.result(e, s);
    const li = el('li');
    const a = el('a', 'rowlink');
    a.href = '#/entry/' + e.id;
    a.appendChild(el('span', 'rowlink__when', shortDateET(r.at)));
    const what = el('span', 'rowlink__what', e.instrument + ' ' + SIDE[e.direction] + ' · ' + e.contracts + ' ');
    if (J.isSim(e)) what.appendChild(simTag());
    what.appendChild(el('span', '', e.confluence));
    a.appendChild(what);
    a.appendChild(resultNode(e, r, s));
    li.appendChild(a);
    list.appendChild(li);
  }
}

function last(s) {
  const box = document.querySelector('[data-last]');
  const link = document.querySelector('[data-last-link]');
  const e = J.all()[0];
  box.replaceChildren();
  if (!e) {
    link.hidden = true;
    const wrap = el('div', 'last');
    wrap.appendChild(el('p', 'empty', 'No entries yet. Your last entry shows here, with its result.'));
    const a = el('a', 'btn btn--primary', 'New entry');
    a.href = '#/new';
    const row = el('div', 'form__foot'); row.appendChild(a);
    wrap.appendChild(row);
    box.appendChild(wrap);
    return;
  }
  const r = J.result(e, s);
  link.hidden = false;
  link.href = '#/entry/' + e.id;
  const wrap = el('div', 'last');
  const t = el('p', 'last__title', e.instrument + ' ');
  t.appendChild(el('span', '', SIDE[e.direction] + ', ' + e.contracts + (e.contracts === 1 ? ' contract' : ' contracts')));
  if (J.isSim(e)) t.appendChild(simTag());
  wrap.appendChild(t);
  wrap.appendChild(el('p', 'last__prices', '@ ' + formatPrice(e.instrument, e.entryPrice) + '  →  @ ' + formatPrice(e.instrument, e.exitPrice)));
  const res = el('p', 'last__res');
  res.appendChild(resultNode(e, r, s));
  res.appendChild(el('span', '', 'net ' + money(r.net) + ' · gross ' + money(r.gross)));
  if (r.risk && s.units !== 'r') res.appendChild(el('span', '', unit(J.inUnit(r, e, 'r', s.basis), 'r')));
  wrap.appendChild(res);
  const meta = el('p', 'last__meta');
  meta.appendChild(el('span', '', shortDateET(r.at) + ', ' + timeBoth(r.at)));
  wrap.appendChild(meta);
  const conf = el('p', 'last__meta');
  conf.appendChild(el('span', 'last__conf', e.confluence));
  conf.appendChild(dots(e.confidence));
  wrap.appendChild(conf);
  box.appendChild(wrap);
}

function pl(s) {
  const box = document.querySelector('[data-pl]');
  const p = J.periods(s);
  box.replaceChildren();
  for (const [k, label] of [['day', 'Today'], ['week', 'This week'], ['month', 'This month']]) {
    const o = p[k];
    const row = el('div', 'pl__row');
    row.appendChild(el('span', 'pl__k', label));
    const v = el('div', 'pl__v');
    if (!o.count) {
      v.appendChild(el('span', 'pl__none', 'No entries to conclude profit or loss from.'));
    } else {
      const shown = o.count - o.missing;
      if (s.units === 'r' && !shown) v.appendChild(el('span', 'pl__none', 'No initial stops recorded, so no result in R.'));
      else v.appendChild(el('span', tone(o.value) + ' pl__main', unit(o.value, s.units)));
      v.appendChild(el('span', 'pl__sub', 'net ' + money(o.net) + ' · gross ' + money(o.gross) + ' · costs ' + money(o.costs, { sign: false }) + ' · ' + trades(o.count)));
      if (o.missing && s.units === 'r') v.appendChild(el('span', 'pl__sub', 'R on ' + shown + ' of ' + o.count + '; the rest had no initial stop.'));
    }
    row.appendChild(v);
    box.appendChild(row);
  }
  /* nothing this month, but there are entries: say where they are */
  const latest = J.all()[0];
  if (!p.month.count && latest) {
    const note = el('p', 'pl__where');
    note.append(document.createTextNode('Your latest entry closed on ' + shortDateET(J.closedAt(latest)) + '. '));
    const a = el('a', 'link', 'Overview');
    a.href = '#/overview';
    const b = el('a', 'link', 'Stats');
    b.href = '#/stats';
    note.append(a, document.createTextNode(' and '), b, document.createTextNode(' show every entry.'));
    box.appendChild(note);
  }
  const sims = J.simCount();
  if (sims) box.appendChild(el('p', 'simnote', 'Your journal includes ' + sims + ' simulated ' + (sims === 1 ? 'entry' : 'entries') + ': generated, not real trades.'));
}

export function renderHome() {
  const s = settings.get();
  recent(s);
  last(s);
  pl(s);
}

export function renderBoundaries() {
  const s = settings.get();
  const unitNote = s.units === 'ticks' || s.units === 'points' ? ' ' + UNIT_LABEL[s.units] + ' are per contract, and add up across instruments whose money values differ.' : '';
  document.querySelectorAll('[data-boundary]').forEach((n) => { n.textContent = boundaryText(s.dayStart) + unitNote; });
}
