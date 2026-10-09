/* Settings: kept on this computer under thecurve.terminal.settings, applied
   to <html> the moment they change. boot.js applies the same ones before the
   first paint. Launching with Windows is not stored here: it lives in the
   Windows registry, so it is read from and written to the Rust side. */

import { getJSON, setJSON } from '../shared/js/store.js';
import { applySky, SkyMotion } from '../shared/js/sky.js';
import { invoke, isNative } from '../shared/js/native.js';

export const DEFAULTS = Object.freeze({
  text: 'm',
  contrast: 0,
  motion: 'system',
  intro: true,
  bg: 'grid',
  stars: true,
  discord: true,
});

let S = { ...DEFAULTS };
const listeners = [];
const sky = new SkyMotion();
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

export function load() {
  const saved = getJSON('settings', {});
  S = { ...DEFAULTS, ...saved };
  return S;
}

export function get() { return S; }

export function reducedMotion() {
  if (S.motion === 'reduce') return true;
  if (S.motion === 'full') return false;
  return mq.matches;
}

export function apply() {
  const d = document.documentElement;
  if (S.text && S.text !== 'm') d.setAttribute('data-text', S.text); else d.removeAttribute('data-text');
  if (+S.contrast) d.setAttribute('data-contrast', String(S.contrast)); else d.removeAttribute('data-contrast');
  d.setAttribute('data-bg', S.bg);
  const rm = reducedMotion();
  d.classList.toggle('rm', rm);

  applySky(S.bg === 'sky');
  sky.meteors = S.stars !== false;
  if (S.bg === 'sky' && !rm) sky.start(); else sky.stop();
}

export function update(patch) {
  S = { ...S, ...patch };
  setJSON('settings', S);
  apply();
  listeners.forEach((fn) => fn(S, patch));
}

export function reset() {
  update({ ...DEFAULTS });
}

export function onChange(fn) { listeners.push(fn); }

mq.addEventListener('change', () => { if (S.motion === 'system') apply(); });

/* ---------------------------------------------------- the settings panel */

export function bindPanel(panel) {
  const segs = panel.querySelectorAll('.seg[data-setting]');
  const switches = panel.querySelectorAll('.switch[data-setting]');

  function render() {
    segs.forEach((g) => {
      const key = g.dataset.setting;
      g.querySelectorAll('.seg__opt').forEach((b) => {
        const on = String(S[key]) === b.dataset.value;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    });
    switches.forEach((sw) => sw.setAttribute('aria-checked', S[sw.dataset.setting] ? 'true' : 'false'));
    panel.querySelectorAll('[data-needs="sky"]').forEach((row) => {
      const off = S.bg !== 'sky';
      row.classList.toggle('is-off', off);
      row.querySelector('.switch').disabled = off;
    });
  }

  segs.forEach((g) => {
    const key = g.dataset.setting;
    const opts = [...g.querySelectorAll('.seg__opt')];
    const pick = (b) => {
      const v = b.dataset.value;
      update({ [key]: key === 'contrast' ? +v : v });
    };
    opts.forEach((b) => b.addEventListener('click', () => pick(b)));
    /* a radio group: the arrow keys move the choice, as screen readers expect */
    g.addEventListener('keydown', (e) => {
      const i = opts.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      let n = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % opts.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + opts.length) % opts.length;
      if (e.key === 'Home') n = 0;
      if (e.key === 'End') n = opts.length - 1;
      if (n < 0) return;
      e.preventDefault();
      pick(opts[n]);
      opts[n].focus();
    });
  });

  switches.forEach((sw) => sw.addEventListener('click', () => {
    const key = sw.dataset.setting;
    update({ [key]: !S[key] });
  }));

  const resetBtn = panel.querySelector('[data-reset]');
  if (resetBtn) resetBtn.addEventListener('click', reset);

  onChange(render);
  render();

  bindStartup(panel);
}

/* Open when Windows starts: one value under HKCU\...\Run, owned by Rust */
function bindStartup(panel) {
  const sw = panel.querySelector('[data-startup]');
  const note = panel.querySelector('[data-startup-status]');
  if (!sw) return;
  const say = (text) => { note.hidden = !text; note.textContent = text || ''; };

  if (!isNative) {
    sw.disabled = true;
    sw.setAttribute('aria-checked', 'false');
    say('Not available in the design preview');
    return;
  }
  const read = () => invoke('startup_get').then((on) => {
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    say('');
  }).catch(() => say('Could not read the Windows setting'));

  sw.addEventListener('click', async () => {
    const want = sw.getAttribute('aria-checked') !== 'true';
    sw.disabled = true;
    try {
      await invoke('startup_set', { enabled: want });
      sw.setAttribute('aria-checked', want ? 'true' : 'false');
      say('');
    } catch (e) {
      say('Windows did not accept the change');
    }
    sw.disabled = false;
  });
  read();
}
