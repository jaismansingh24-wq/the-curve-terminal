/* Runs before first paint, as a plain script. Its only job is to decide how
   the window should look at frame one, so nothing flashes in the wrong state:
   text size, contrast, motion, background, and whether the intro is armed.
   Everything else waits for main.js. */

(function () {
  var d = document.documentElement;
  var S = {};
  try { S = JSON.parse(window.localStorage.getItem('thecurve.terminal.settings') || '{}') || {}; } catch (e) { S = {}; }

  var sys = false;
  try { sys = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var rm = S.motion === 'reduce' ? true : S.motion === 'full' ? false : sys;

  if (S.text && S.text !== 'm') d.setAttribute('data-text', S.text);
  if (S.contrast) d.setAttribute('data-contrast', String(S.contrast));
  d.setAttribute('data-bg', S.bg === 'sky' || S.bg === 'plain' ? S.bg : 'grid');
  if (rm) d.classList.add('rm');
  d.classList.add('intro-armed');
})();
