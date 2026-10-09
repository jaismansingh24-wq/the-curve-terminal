/* High-impact releases, for "Near the news".

   Source: thecurve.in's US macro calendar (content/macro.py in the site's
   repository), whose dates come from the published schedules of the BLS,
   BEA and Federal Reserve, checked 30 September 2026. Only the releases the
   site marks as major are here. It covers October 2026; for any other month
   the app knows nothing, and a trade counts as near the news only if its
   entry says so (the tick box on the entry form).

   "Near" means a release between five minutes before the entry and five
   minutes after the exit, so a trade open across a release counts too. */

import { wallToUtc, ET } from './time.js';

export const SOURCE = "thecurve.in's macro calendar (BLS, BEA and Federal Reserve schedules)";
export const CHECKED = '30 September 2026';
export const COVERED = ['2026-10'];
export const WINDOW_MIN = 5;

const RAW = [
  ['2026-10-02T08:30', 'Employment situation (nonfarm payrolls)'],
  ['2026-10-14T08:30', 'Consumer price index'],
  ['2026-10-28T14:00', 'FOMC rate decision'],
  ['2026-10-29T08:30', 'GDP, advance estimate'],
  ['2026-10-29T08:30', 'Personal income and outlays (PCE)'],
];

export const RELEASES = RAW.map(([at, name]) => ({ at: wallToUtc(at, ET), name }));

/* is the month of a moment covered by the calendar? ("2026-10") */
function covered(ms) {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit' }).format(new Date(ms));
  return COVERED.includes(d.slice(0, 7));
}

/* { status: 'yes' | 'no' | 'unknown', release?, from: 'entry' | 'calendar' } */
export function nearNews(e) {
  if (e.nearNews === true) return { status: 'yes', from: 'entry' };
  if (e.nearNews === false) return { status: 'no', from: 'entry' };
  const a = Date.parse(e.entryAt), b = Date.parse(e.exitAt || e.entryAt);
  if (!covered(a) && !covered(b)) return { status: 'unknown', from: 'calendar' };
  const w = WINDOW_MIN * 60000;
  const hit = RELEASES.find((r) => r.at >= a - w && r.at <= b + w);
  return hit ? { status: 'yes', release: hit, from: 'calendar' } : { status: 'no', from: 'calendar' };
}
