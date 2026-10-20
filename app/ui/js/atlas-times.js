/* How long each Atlas page took to fetch, so Fetch again can say what to
   expect. Kept on this computer under thecurve.terminal.atlas-fetches: for
   each page, the seconds its last five fetches took, counting only those
   where every source answered. Nothing about what was fetched. */

import { getJSON, setJSON } from '../shared/js/store.js';

/* the middle of the times kept for a page, in whole seconds; null when
   there are none yet */
export function expectedTime(view) {
  const t = (getJSON('atlas-fetches', {})[view] || []).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!t.length) return null;
  const m = t.length >> 1;
  return Math.max(1, Math.round(t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2));
}

export function rememberTime(view, secs) {
  const all = getJSON('atlas-fetches', {});
  all[view] = [...(Array.isArray(all[view]) ? all[view] : []), Math.round(secs * 10) / 10].slice(-5);
  setJSON('atlas-fetches', all);
}
