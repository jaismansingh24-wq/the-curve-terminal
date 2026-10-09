/* Text contrast, 0 (as designed) to 100: the dim and faint greys and the
   hairlines walk towards white, and the main text goes from #EDEFF2 to
   white. The same mix as thecurve.in, set through the CSSOM. */

export function applyContrast(value) {
  const d = document.documentElement;
  const k = Math.max(0, Math.min(100, Number(value) || 0)) / 100;
  const P = ['--text', '--text-dim', '--text-faint', '--hairline', '--hairline-soft'];
  if (!k) { P.forEach((p) => d.style.removeProperty(p)); return; }
  const mix = (a, b) => 'rgb(' + a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(' ') + ')';
  d.style.setProperty('--text', mix([237, 239, 242], [255, 255, 255]));
  d.style.setProperty('--text-dim', mix([152, 160, 170], [222, 226, 231]));
  d.style.setProperty('--text-faint', mix([107, 114, 124], [190, 196, 204]));
  d.style.setProperty('--hairline', 'rgb(255 255 255 / ' + (0.10 + 0.14 * k).toFixed(3) + ')');
  d.style.setProperty('--hairline-soft', 'rgb(255 255 255 / ' + (0.06 + 0.10 * k).toFixed(3) + ')');
}

/* earlier versions stored three steps (0, 1, 2); they become 0, 50 and 100 */
export function migrateContrast(s) {
  if (s && s.contrastScale !== 100) {
    const old = Number(s.contrast) || 0;
    s.contrast = old === 1 ? 50 : old === 2 ? 100 : old;
    s.contrastScale = 100;
  }
  return s;
}
