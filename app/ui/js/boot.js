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

  /* contrast, 0 to 100 (older versions stored 0, 1 or 2); the same mix as
     shared/js/contrast.js, repeated here because this runs before modules */
  var c = Number(S.contrast) || 0;
  if (S.contrastScale !== 100) c = c === 1 ? 50 : c === 2 ? 100 : c;
  var k = Math.max(0, Math.min(100, c)) / 100;
  if (k) {
    var mix = function (a, b) { return 'rgb(' + a.map(function (x, i) { return Math.round(x + (b[i] - x) * k); }).join(' ') + ')'; };
    d.style.setProperty('--text', mix([237, 239, 242], [255, 255, 255]));
    d.style.setProperty('--text-dim', mix([152, 160, 170], [222, 226, 231]));
    d.style.setProperty('--text-faint', mix([107, 114, 124], [190, 196, 204]));
    d.style.setProperty('--hairline', 'rgb(255 255 255 / ' + (0.10 + 0.14 * k).toFixed(3) + ')');
    d.style.setProperty('--hairline-soft', 'rgb(255 255 255 / ' + (0.06 + 0.10 * k).toFixed(3) + ')');
  }
  d.setAttribute('data-bg', S.bg === 'sky' || S.bg === 'plain' ? S.bg : 'grid');
  if (rm) d.classList.add('rm');
  d.classList.add('intro-armed');
})();
