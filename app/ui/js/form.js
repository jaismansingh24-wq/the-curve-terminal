/* New entry, and editing one. The required section is what the result is
   worked out from; everything else is optional. As you type, the form shows
   the time in New York and your own, flags a price that is off the tick,
   and previews the result. Saving checks the required fields and says, in
   plain words, what is missing. */

import * as J from './journal.js';
import * as settings from './settings.js';
import { INSTRUMENTS, GROUPS, get as instrument, onTick, formatPrice, CHECKED } from './instruments.js';
import { zoneChoices, wallToUtc, utcToWall, timeBoth, shortDateET, ET } from './time.js';
import { money, unit, tone, el } from './format.js';
import { go } from './router.js';
import { isNative } from '../shared/js/native.js';

const ORDERFLOW = [
  'Sweep', 'Absorption', 'Exhaustion', 'Delta divergence', 'Stacked imbalances', 'Iceberg',
  'Initiative buying', 'Initiative selling', 'Trapped traders', 'Large print', 'Single prints',
  'Poor high or low', 'Failed auction', 'Unfinished auction', 'Value area edge', 'POC retest',
  'Low volume node', 'High volume node', 'VWAP', 'Initial balance',
];
const MISTAKES = [
  'Moved my stop', 'Exited early', 'Chased the entry', 'Oversized', 'Revenge trade',
  'Broke a rule', 'Hesitated', 'Fear of missing out', 'Traded into news',
];
const CONFLUENCES = [
  'Absorption at the value area low', 'Absorption at the value area high', 'Delta divergence at the high',
  'Delta divergence at the low', 'Sweep of the overnight high', 'Sweep of the overnight low',
  'Failed auction at the high', 'Failed auction at the low', 'Retest of the point of control',
  'Rejection at a low volume node', 'Initiative buying through value', 'Initiative selling through value',
  'Stacked imbalances off the open', 'VWAP reclaim', 'Initial balance break',
];

const form = () => document.getElementById('entry-form');
let editing = null;

/* ------------------------------------------------------------ building */

function fillInstruments() {
  const sel = form().querySelector('[data-instruments]');
  /* "Choose" is the default, so a form reset never quietly picks ES */
  sel.replaceChildren(new Option('Choose', '', true, true));
  for (const g of GROUPS) {
    const og = document.createElement('optgroup');
    og.label = g;
    for (const i of INSTRUMENTS.filter((x) => x.group === g)) og.appendChild(new Option(i.code + '  ' + i.name, i.code));
    sel.appendChild(og);
  }
  sel.options[0].disabled = true;
}

function fillZones() {
  const sel = form().querySelector('[data-zones]');
  sel.replaceChildren(...zoneChoices().map((z) => new Option(z.label, z.id)));
}

function chip(group, label, checked) {
  const l = el('label', 'chip');
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.name = group;
  i.value = label;
  i.checked = !!checked;
  l.append(i, el('span', '', label));
  return l;
}

/* the fixed tags, plus any the reader has added before */
function fillChips(group, base, chosen = []) {
  const box = form().querySelector('[data-chips="' + group + '"]');
  const seen = new Set();
  const own = J.all().flatMap((e) => e[group] || []);
  box.replaceChildren();
  for (const t of [...base, ...own, ...chosen]) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    box.appendChild(chip(group, t, chosen.includes(t)));
  }
}

function fillLists() {
  const uniq = (xs) => [...new Set(xs.filter(Boolean).map((x) => x.trim()))];
  const all = J.all();
  const put = (id, xs) => document.getElementById(id).replaceChildren(...xs.map((x) => new Option(x)));
  put('dl-confluence', uniq([...all.map((e) => e.confluence), ...CONFLUENCES]));
  put('dl-account', uniq(all.map((e) => e.account)));
  put('dl-setup', uniq(all.map((e) => e.setup)));
}

function partialRow(p = {}) {
  const f = form();
  const zone = f.zone.value || ET;
  const row = el('div', 'partial');
  const field = (label, name, attrs) => {
    const l = el('label', 'f');
    l.appendChild(el('span', 'f__label', label));
    const i = document.createElement('input');
    i.className = 'inp inp--num';
    i.dataset.p = name;
    Object.assign(i, attrs);
    l.appendChild(i);
    return { l, i };
  };
  const t = field('Time (optional)', 'at', { type: 'datetime-local' });
  if (p.at) t.i.value = utcToWall(Date.parse(p.at), zone);
  const pr = field('Price', 'price', { inputMode: 'decimal' });
  if (Number.isFinite(p.price)) pr.i.value = p.price;
  const q = field('Contracts', 'contracts', { type: 'number', min: 1, step: 1, inputMode: 'numeric' });
  if (p.contracts) q.i.value = p.contracts;
  const rm = el('button', 'btn btn--quiet', 'Remove');
  rm.type = 'button';
  rm.addEventListener('click', () => { row.remove(); preview(); });
  row.append(t.l, pr.l, q.l, rm);
  return row;
}

/* ------------------------------------------------------------ reading */

const radio = (name) => { const r = form().querySelector('input[name="' + name + '"]:checked'); return r ? r.value : null; };
const yesNo = (v) => (v === 'yes' ? true : v === 'no' ? false : null);
const text = (name) => { const v = form()[name].value.trim(); return v || null; };

function collect() {
  const f = form();
  const zone = f.zone.value || ET;
  const at = (v) => { const ms = wallToUtc(v, zone); return Number.isFinite(ms) ? new Date(ms).toISOString() : null; };
  const n = (name) => J.num(f[name].value);
  const partials = [...f.querySelectorAll('.partial')].map((row) => {
    const g = (k) => row.querySelector('[data-p="' + k + '"]').value;
    return { at: g('at') ? at(g('at')) : null, price: J.num(g('price')), contracts: parseInt(g('contracts'), 10) || 0 };
  }).filter((p) => p.price !== null || p.contracts || p.at);
  return {
    ...(editing || {}),
    instrument: f.instrument.value,
    direction: radio('direction'),
    contracts: Number(f.contracts.value),
    enteredZone: zone,
    entryAt: f.entryAt.value ? at(f.entryAt.value) : null,
    exitAt: f.exitAt.value ? at(f.exitAt.value) : null,
    entryPrice: n('entryPrice'),
    exitPrice: n('exitPrice'),
    confidence: Number(radio('confidence')) || null,
    confluence: f.confluence.value.trim(),
    partials,
    stop: n('stop'),
    plannedExit: n('plannedExit'),
    intendedEntry: n('intendedEntry'),
    costs: n('costs'),
    account: text('account'),
    bias: radio('bias') || null,
    orderflow: [...f.querySelectorAll('input[name="orderflow"]:checked')].map((i) => i.value),
    setup: text('setup'),
    checklist: radio('checklist'),
    mae: n('mae'),
    mfe: n('mfe'),
    mood: Number(radio('mood')) || null,
    sleep: n('sleep'),
    followedPlan: yesNo(radio('followedPlan')),
    afterLimit: yesNo(radio('afterLimit')),
    nearNews: yesNo(radio('nearNews')),
    mistakes: [...f.querySelectorAll('input[name="mistakes"]:checked')].map((i) => i.value),
    notes: f.notes.value.trim(),
  };
}

/* ------------------------------------------------------------ hints */

function hints() {
  const f = form();
  const zone = f.zone.value || ET;
  for (const name of ['entryAt', 'exitAt']) {
    const out = f.querySelector('[data-shows="' + name + '"]');
    const ms = wallToUtc(f[name].value, zone);
    out.textContent = Number.isFinite(ms) ? shortDateET(ms) + ', ' + timeBoth(ms) : '';
  }
  const ins = instrument(f.instrument.value);
  for (const name of ['entryPrice', 'exitPrice']) {
    const out = f.querySelector('[data-tick="' + name + '"]');
    const v = J.num(f[name].value);
    if (!ins) { out.textContent = ''; continue; }
    if (Number.isFinite(v) && !onTick(ins.code, v)) out.textContent = 'Not on ' + ins.code + "'s " + ins.tick + ' tick. Check the price.';
    else out.textContent = name === 'entryPrice' ? ins.code + ': ' + ins.tick + ' tick = ' + money(ins.tickValue, { sign: false }) + ', per CME, checked ' + CHECKED + '.' : '';
  }
  const s = settings.get();
  const ch = f.querySelector('[data-costs-hint]');
  const q = Number(f.contracts.value) || 1;
  ch.textContent = s.costPerContract > 0
    ? 'Leave blank to use your default: ' + money(s.costPerContract, { sign: false }) + ' a contract, so ' + money(s.costPerContract * q, { sign: false }) + ' here.'
    : 'Commissions and fees for the whole trade. A default per contract can be set in Settings.';
  f.costs.placeholder = s.costPerContract > 0 ? (s.costPerContract * q).toFixed(2) : '0.00';
}

function preview() {
  const box = form().querySelector('[data-result-preview]');
  const e = collect();
  box.replaceChildren();
  const bad = J.validate(e);
  const needed = ['instrument', 'direction', 'contracts', 'entryPrice', 'exitPrice'];
  if (needed.some((k) => bad[k]) || bad.partials) return;
  const s = settings.get();
  const r = J.result(e, s);
  if (!r) return;
  box.appendChild(document.createTextNode('Result: '));
  box.appendChild(el('span', tone(r.net), money(r.net)));
  box.appendChild(document.createTextNode(' net · ' + money(r.gross) + ' gross · ' + unit(J.inUnit(r, e, 'ticks', 'gross'), 'ticks') + ' per contract'));
  if (r.risk) box.appendChild(document.createTextNode(' · ' + unit(J.inUnit(r, e, 'r', s.basis), 'r')));
}

/* ------------------------------------------------------------ saving */

function showErrors(bad) {
  const f = form();
  f.querySelectorAll('[data-err]').forEach((n) => { n.textContent = bad[n.dataset.err] || ''; });
  f.querySelectorAll('[name]').forEach((i) => i.removeAttribute('aria-invalid'));
  for (const k of Object.keys(bad)) {
    const i = f.querySelector('[name="' + k + '"]');
    if (i) i.setAttribute('aria-invalid', 'true');
  }
  const box = f.querySelector('[data-form-error]');
  const n = Object.keys(bad).length;
  box.hidden = !n;
  box.textContent = n ? (n === 1 ? 'One thing needs fixing before this can be saved.' : n + ' things need fixing before this can be saved.') + ' Each is marked below.' : '';
  if (n) {
    const first = f.querySelector('[aria-invalid="true"]') || f.querySelector('[data-err="' + Object.keys(bad)[0] + '"]');
    if (first) { first.scrollIntoView({ block: 'center' }); if (first.focus) first.focus({ preventScroll: true }); }
  }
}

async function submit(ev) {
  if (ev) ev.preventDefault();
  const e = collect();
  const bad = J.validate(e);
  showErrors(bad);
  if (Object.keys(bad).length) return;
  const btn = form().querySelector('[data-save]');
  btn.disabled = true;
  try {
    settings.update({ entryZone: e.enteredZone });
    const saved = await J.save(e);
    editing = null;
    go('/entry/' + saved.id);
  } catch (err) {
    showErrors({});
    const box = form().querySelector('[data-form-error]');
    box.hidden = false;
    box.textContent = String(err && err.message ? err.message : err);
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------ public */

export function initForm() {
  const f = form();
  fillInstruments();
  fillZones();
  f.addEventListener('submit', submit);
  f.addEventListener('input', () => { hints(); preview(); });
  f.addEventListener('change', () => { hints(); preview(); });
  f.querySelector('[data-add-partial]').addEventListener('click', () => {
    const row = partialRow();
    f.querySelector('[data-partials]').appendChild(row);
    row.querySelector('input').focus();
  });
  f.querySelectorAll('[data-chip-add]').forEach((b) => b.addEventListener('click', () => {
    const group = b.dataset.chipAdd;
    const input = f.querySelector('[data-chip-new="' + group + '"]');
    const v = input.value.trim();
    if (!v) return;
    const box = f.querySelector('[data-chips="' + group + '"]');
    const existing = [...box.querySelectorAll('input')].find((i) => i.value.toLowerCase() === v.toLowerCase());
    if (existing) existing.checked = true; else box.appendChild(chip(group, v, true));
    input.value = '';
  }));
  f.querySelectorAll('[data-chip-new]').forEach((i) => i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); f.querySelector('[data-chip-add="' + i.dataset.chipNew + '"]').click(); }
  }));
  document.querySelector('[data-preview-note]').hidden = isNative;
}

/* Ctrl+S while the form is open */
export function saveShortcut() { submit(); }

/* open the form empty (a new entry) or filled from an entry (editing) */
export function openForm(id) {
  const f = form();
  const s = settings.get();
  const e = id ? J.byId(id) : null;
  editing = e;
  f.reset();
  f.querySelector('[data-partials]').replaceChildren();
  showErrors({});
  document.querySelector('[data-form-title]').textContent = e ? 'Edit entry' : 'New entry';
  document.querySelector('[data-form-kicker]').textContent = e ? e.instrument + ' ' + e.direction + ', ' + shortDateET(J.closedAt(e)) : 'New entry';
  f.querySelector('[data-save]').firstChild.textContent = e ? 'Save changes ' : 'Save entry ';
  f.querySelector('[data-cancel]').href = e ? '#/entry/' + e.id : '#/overview';
  fillLists();
  fillChips('orderflow', ORDERFLOW, e ? e.orderflow || [] : []);
  fillChips('mistakes', MISTAKES, e ? e.mistakes || [] : []);

  const zone = (e && e.enteredZone) || s.entryZone || ET;
  f.zone.value = zoneChoices().some((z) => z.id === zone) ? zone : ET;
  const setRadio = (name, v) => { const r = f.querySelector('input[name="' + name + '"][value="' + v + '"]'); if (r) r.checked = true; };
  const put = (name, v) => { if (v !== null && v !== undefined) f[name].value = v; };

  if (!e) {
    f.entryAt.value = utcToWall(Date.now(), f.zone.value);
    f.contracts.value = 1;
  } else {
    f.instrument.value = e.instrument;
    setRadio('direction', e.direction);
    f.contracts.value = e.contracts;
    f.entryAt.value = utcToWall(Date.parse(e.entryAt), f.zone.value);
    if (e.exitAt) f.exitAt.value = utcToWall(Date.parse(e.exitAt), f.zone.value);
    put('entryPrice', e.entryPrice);
    put('exitPrice', e.exitPrice);
    setRadio('confidence', e.confidence);
    put('confluence', e.confluence);
    for (const p of e.partials || []) f.querySelector('[data-partials]').appendChild(partialRow(p));
    put('stop', e.stop); put('plannedExit', e.plannedExit); put('intendedEntry', e.intendedEntry);
    put('costs', e.costs); put('account', e.account);
    setRadio('bias', e.bias || '');
    put('setup', e.setup);
    if (e.checklist) setRadio('checklist', e.checklist);
    put('mae', e.mae); put('mfe', e.mfe);
    if (e.mood) setRadio('mood', e.mood);
    put('sleep', e.sleep);
    if (e.followedPlan !== null && e.followedPlan !== undefined) setRadio('followedPlan', e.followedPlan ? 'yes' : 'no');
    if (e.afterLimit !== null && e.afterLimit !== undefined) setRadio('afterLimit', e.afterLimit ? 'yes' : 'no');
    if (e.nearNews !== null && e.nearNews !== undefined) setRadio('nearNews', e.nearNews ? 'yes' : 'no');
    put('notes', e.notes);
  }
  hints();
  preview();
}
