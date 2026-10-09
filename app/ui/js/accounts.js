/* Accounts: prop evaluations, funded accounts and personal accounts, with
   the rules each firm sets and the money in and out (fees and payouts).
   An entry counts towards an account when its Account field matches the
   account's name. The Stats page works out the distance to each rule. */

import * as J from './journal.js';
import * as settings from './settings.js';
import * as C from './stats-calc.js';
import { money, el, trades } from './format.js';

let editing = null;   /* the account in the form, or null for a new one */
const KIND = { evaluation: 'Evaluation', funded: 'Funded', personal: 'Personal' };
const DD = { eod: 'end of day', intraday: 'intraday, on closed trades', static: 'static' };
const LEDGER = { evaluation: 'Evaluation fee', reset: 'Reset', activation: 'Activation fee', payout: 'Payout', other: 'Other cost' };

const form = () => document.getElementById('account-form');
const numOrNull = (v) => { const n = J.num(v); return Number.isFinite(n) ? n : null; };

function list() {
  const box = document.querySelector('[data-accounts]');
  const s = settings.get();
  const accs = J.allAccounts();
  box.replaceChildren();
  document.querySelector('[data-accounts-empty]').hidden = accs.length > 0;
  for (const a of accs) {
    const r = C.account(a, s);
    const card = el('article', 'acc glass glass--quiet');
    const head = el('div', 'panel__head');
    const h = el('h2', 'acc__name', a.name);
    if (a.firm) h.appendChild(el('span', '', ' · ' + a.firm));
    head.append(h, el('span', 'kicker', KIND[a.kind] || 'Account'));
    card.appendChild(head);

    const facts = el('dl', 'acc__facts');
    const fact = (k, v) => { if (v === null || v === undefined || v === '') return; const d = el('div', 'row'); d.append(el('dt', '', k), el('dd', 'num', v)); facts.appendChild(d); };
    fact('Entries', trades(r.n));
    fact('Balance', money(r.balance, { sign: false }) + (Number.isFinite(a.start) ? ' (started at ' + money(a.start, { sign: false }) + ')' : ''));
    fact('Trailing drawdown', Number.isFinite(a.trailing) ? money(a.trailing, { sign: false }) + ', ' + DD[a.trailingType || 'eod'] + (a.lockAtStart ? ', stops at the start' : '') : null);
    fact('Distance to it', r.drawdown ? money(r.drawdown.distance, { sign: false }) : null);
    fact('Daily loss limit', Number.isFinite(a.dailyLimit) ? money(a.dailyLimit, { sign: false }) : null);
    fact('Consistency rule', Number.isFinite(a.consistency) ? 'best day at most ' + a.consistency + '% of profit' : null);
    fact('Profit target', Number.isFinite(a.profitTarget) ? money(a.profitTarget, { sign: false }) : null);
    fact('Spent', money(r.spent, { sign: false }));
    fact('Paid out', money(r.paid, { sign: false }));
    card.appendChild(facts);

    /* the ledger: fees in, payouts out */
    const led = el('div', 'acc__ledger');
    led.appendChild(el('p', 'kicker', 'Fees and payouts'));
    const rows = (a.ledger || []).slice().sort((x, y) => (x.date < y.date ? 1 : -1));
    if (!rows.length) led.appendChild(el('p', 'empty', 'Nothing recorded yet.'));
    for (const l of rows) {
      const row = el('div', 'acc__lrow');
      row.append(el('span', 'num dim', l.date), el('span', '', LEDGER[l.type] || l.type + (l.note ? ', ' + l.note : '')), el('span', 'num ' + (l.type === 'payout' ? 'pnl pnl--up' : ''), (l.type === 'payout' ? '+' : '') + money(l.amount, { sign: false })));
      const rm = el('button', 'link', 'Remove');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + (LEDGER[l.type] || l.type) + ' of ' + money(l.amount, { sign: false }) + ' on ' + l.date);
      rm.addEventListener('click', async () => { a.ledger = (a.ledger || []).filter((x) => x.id !== l.id); await J.saveAccount(a); });
      row.appendChild(rm);
      led.appendChild(row);
    }
    const add = el('form', 'acc__add');
    const d = document.createElement('input'); d.type = 'date'; d.className = 'inp inp--sm inp--num'; d.required = true; d.value = new Date().toISOString().slice(0, 10); d.setAttribute('aria-label', 'Date');
    const t = document.createElement('select'); t.className = 'inp inp--sm'; t.setAttribute('aria-label', 'Kind');
    Object.entries(LEDGER).forEach(([k, v]) => t.appendChild(new Option(v, k)));
    const amt = document.createElement('input'); amt.className = 'inp inp--sm inp--num'; amt.inputMode = 'decimal'; amt.placeholder = 'Amount, $'; amt.setAttribute('aria-label', 'Amount in dollars');
    const note = document.createElement('input'); note.className = 'inp inp--sm'; note.placeholder = 'Note (optional)'; note.setAttribute('aria-label', 'Note');
    const go = el('button', 'btn btn--quiet', 'Add'); go.type = 'submit';
    add.append(d, t, amt, note, go);
    add.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = numOrNull(amt.value);
      if (!(v > 0) || !d.value) { amt.setAttribute('aria-invalid', 'true'); amt.focus(); return; }
      a.ledger = [...(a.ledger || []), { id: crypto.randomUUID(), date: d.value, type: t.value, amount: v, note: note.value.trim() || null }];
      await J.saveAccount(a);
    });
    led.appendChild(add);
    card.appendChild(led);

    const actions = el('div', 'form__foot');
    const ed = el('button', 'btn', 'Edit rules'); ed.type = 'button';
    ed.addEventListener('click', () => openForm(a.id));
    actions.appendChild(ed);
    const del = el('button', 'btn btn--quiet', 'Delete account'); del.type = 'button';
    del.dataset.delete = a.id;
    actions.appendChild(del);
    card.appendChild(actions);
    box.appendChild(card);
  }
}

function openForm(id) {
  const f = form();
  const a = id ? J.accountById(id) : null;
  editing = a;
  f.reset();
  f.hidden = false;
  f.querySelector('[data-acc-title]').textContent = a ? 'Edit ' + a.name : 'New account';
  f.querySelector('[data-acc-err]').textContent = '';
  if (a) {
    const put = (n, v) => { if (v !== null && v !== undefined) f[n].value = v; };
    put('name', a.name); put('firm', a.firm); put('kind', a.kind || 'evaluation');
    put('start', a.start); put('trailing', a.trailing); put('trailingType', a.trailingType || 'eod');
    f.lockAtStart.checked = !!a.lockAtStart;
    put('dailyLimit', a.dailyLimit); put('consistency', a.consistency); put('profitTarget', a.profitTarget); put('notes', a.notes);
  }
  f.name.focus();
  f.scrollIntoView({ block: 'start' });
}

async function submit(ev) {
  ev.preventDefault();
  const f = form();
  const name = f.name.value.trim();
  const err = f.querySelector('[data-acc-err]');
  if (!name) { err.textContent = 'Give the account a name. Entries find it by that name.'; f.name.setAttribute('aria-invalid', 'true'); f.name.focus(); return; }
  const clash = J.accountByName(name);
  if (clash && (!editing || clash.id !== editing.id)) { err.textContent = 'There is already an account called ' + name + '.'; f.name.focus(); return; }
  const a = {
    ...(editing || { ledger: [] }),
    name, firm: f.firm.value.trim() || null, kind: f.kind.value,
    start: numOrNull(f.start.value), size: numOrNull(f.start.value),
    trailing: numOrNull(f.trailing.value), trailingType: f.trailingType.value, lockAtStart: f.lockAtStart.checked,
    dailyLimit: numOrNull(f.dailyLimit.value), consistency: numOrNull(f.consistency.value), profitTarget: numOrNull(f.profitTarget.value),
    notes: f.notes.value.trim() || null,
  };
  try {
    await J.saveAccount(a);
    editing = null;
    f.hidden = true;
  } catch (e) {
    err.textContent = String(e.message || e);
  }
}

export function renderAccounts() { list(); }

export function initAccounts({ confirm }) {
  form().addEventListener('submit', submit);
  document.querySelector('[data-acc-new]').addEventListener('click', () => openForm(null));
  form().querySelector('[data-acc-cancel]').addEventListener('click', () => { form().hidden = true; editing = null; });
  document.querySelector('[data-accounts]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-delete]');
    if (!b) return;
    const a = J.accountById(b.dataset.delete);
    if (!a) return;
    confirm('The account ' + a.name + ', with its rules and its ledger. Your entries stay; they keep the account name typed on them.', async () => { await J.removeAccount(a.id); }, 'Delete this account?');
  });
}
