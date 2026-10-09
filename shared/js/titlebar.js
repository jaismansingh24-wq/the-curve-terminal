/* The frameless window's own title bar: minimise, maximise or restore, close.
   Dragging and double-click to maximise come from data-tauri-drag-region. */

import { currentWindow } from './native.js';

export function initTitlebar(bar) {
  if (!bar) return;
  const w = currentWindow();
  const min = bar.querySelector('[data-win="min"]');
  const max = bar.querySelector('[data-win="max"]');
  const close = bar.querySelector('[data-win="close"]');

  if (!w) return;

  if (min) min.addEventListener('click', () => w.minimize());
  if (close) close.addEventListener('click', () => w.close());
  if (max) {
    max.addEventListener('click', () => w.toggleMaximize());
    const sync = async () => {
      let m = false;
      try { m = await w.isMaximized(); } catch (e) { /* keep the last state */ }
      max.classList.toggle('is-max', m);
      const label = m ? 'Restore' : 'Maximise';
      max.setAttribute('aria-label', label);
      max.dataset.tip = label;
    };
    w.onResized(sync);
    sync();
  }
}
