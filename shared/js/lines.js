/* The lines under the loading bar. Order flow in-jokes, in the site's voice:
   plain, calm, never hype. They rotate while the app loads and say nothing
   about what is actually loading; the step label above the bar does that. */

export const LOADING_LINES = [
  'Tinkering through orders',
  'Looking at historical data',
  'Counting every lot at the bid',
  'Asking the tape what it meant',
  'Waiting for the iceberg to show its size',
  'Telling absorption from exhaustion',
  'Reminding delta that it is inferred',
  'Lining up footprints in neat rows',
  'Filtering out the odd lots',
  'Checking the session boundary twice',
  'Letting the value area settle',
  'Polishing the point of control',
  'Revisiting the poor high',
  'Asking two platforms why they disagree',
  'Persuading the ladder to sit still',
  'Sorting the aggressive from the patient',
  'Warming up the tape',
  'Rereading the auction from the open',
];

/* a fresh order each launch, never the same line twice in a row */
export function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
