/* The units switch, wherever results are shown: money, ticks, points or R,
   and net or gross. One setting, so changing it in one place changes it
   everywhere. */

import * as settings from './settings.js';

const UNITS = [['money', '$'], ['ticks', 'Ticks'], ['points', 'Points'], ['r', 'R']];
const BASES = [['net', 'Net'], ['gross', 'Gross']];

function group(label, key, opts) {
  const g = document.createElement('div');
  g.className = 'seg';
  g.setAttribute('role', 'radiogroup');
  g.setAttribute('aria-label', label);
  for (const [value, text] of opts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg__opt';
    b.setAttribute('role', 'radio');
    b.dataset.value = value;
    b.textContent = text;
    if (value === 'money') b.setAttribute('aria-label', 'Money');
    b.addEventListener('click', () => settings.update({ [key]: value }));
    g.appendChild(b);
  }
  g.addEventListener('keydown', (e) => {
    const list = [...g.children];
    const i = list.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % list.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + list.length) % list.length;
    if (n < 0) return;
    e.preventDefault();
    list[n].click();
    list[n].focus();
  });
  return g;
}

function sync(box) {
  const s = settings.get();
  box.querySelectorAll('.seg').forEach((g) => {
    const key = g.dataset.key;
    g.querySelectorAll('.seg__opt').forEach((b) => {
      const on = s[key] === b.dataset.value;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  });
}

export function initUnits() {
  const boxes = [...document.querySelectorAll('[data-units]')];
  for (const box of boxes) {
    const u = group('Show results in', 'units', UNITS); u.dataset.key = 'units';
    const b = group('Results are', 'basis', BASES); b.dataset.key = 'basis';
    box.append(u, b);
    sync(box);
  }
  settings.onChange((s, patch) => { if ('units' in patch || 'basis' in patch) boxes.forEach(sync); });
}
