/* The release calendar: scheduled dates and times, copied from each
   agency's own published schedule and re-checked for every release of the
   app, never carried forward from memory. Agencies can move a date (a
   holiday, a closure); each entry links to the page it came from.

   Read on 9 October 2026 from:
     BLS     Schedule of Releases for the Consumer Price Index, and for the
             Employment Situation (2027 dates not yet published)
     BEA     Release Schedule, 2026 and 2027
     Fed     Meeting calendars and information (FOMC), 2026 and 2027
     CFTC    Commitments of Traders release schedule, 2026
     EIA     Weekly Petroleum Status Report schedule: Wednesdays at
             10:30 am ET, with the holiday changes it lists

   Treasury auctions are not listed here: the auction list on Fiscal Data
   carries each one as soon as it is announced, and the page adds those. */

import { wallToUtc, ET } from './time.js';

export const CHECKED = '9 October 2026';

export const PAGES = {
  cpi: 'https://www.bls.gov/schedule/news_release/cpi.htm',
  jobs: 'https://www.bls.gov/schedule/news_release/empsit.htm',
  bea: 'https://www.bea.gov/news/schedule',
  fomc: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
  cot: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm',
  eia: 'https://www.eia.gov/petroleum/supply/weekly/schedule.php',
};

/* [date, ET time or '', what, agency, page key, note] */
const E = [];
const add = (date, time, what, agency, page, note = '') => E.push({ date, time, what, agency, page, note });

/* BLS, 8:30 am ET */
[['2026-10-14', 'September 2026'], ['2026-11-10', 'October 2026'], ['2026-12-10', 'November 2026']]
  .forEach(([d, m]) => add(d, '08:30', 'Consumer Price Index, ' + m, 'BLS', 'cpi'));
[['2026-11-06', 'October 2026'], ['2026-12-04', 'November 2026']]
  .forEach(([d, m]) => add(d, '08:30', 'Employment Situation, ' + m, 'BLS', 'jobs'));

/* BEA, 8:30 am ET: GDP, and Personal Income and Outlays (which carries the PCE price index) */
[
  ['2026-10-29', 'GDP, advance estimate, 3rd quarter 2026', 'September 2026'],
  ['2026-11-25', 'GDP, second estimate, 3rd quarter 2026', 'October 2026'],
  ['2026-12-23', 'GDP, third estimate, 3rd quarter 2026', 'November 2026'],
  ['2027-01-28', 'GDP, advance estimate, 4th quarter and year 2026', 'December 2026'],
  ['2027-02-25', 'GDP, second estimate, 4th quarter and year 2026', 'January 2027'],
  ['2027-03-31', 'GDP, third estimate, 4th quarter and year 2026', 'February 2027'],
  ['2027-04-29', 'GDP, advance estimate, 1st quarter 2027', 'March 2027'],
  ['2027-05-27', 'GDP, second estimate, 1st quarter 2027', 'April 2027'],
  ['2027-06-25', 'GDP, third estimate, 1st quarter 2027', 'May 2027'],
  ['2027-07-29', 'GDP, advance estimate, 2nd quarter 2027', 'June 2027'],
  ['2027-08-25', 'GDP, second estimate, 2nd quarter 2027', 'July 2027'],
  ['2027-09-30', 'GDP, third estimate, 2nd quarter 2027', 'August 2027'],
  ['2027-10-28', 'GDP, advance estimate, 3rd quarter 2027', 'September 2027'],
  ['2027-11-24', 'GDP, second estimate, 3rd quarter 2027', 'October 2027'],
  ['2027-12-22', 'GDP, third estimate, 3rd quarter 2027', 'November 2027'],
].forEach(([d, gdp, m]) => {
  add(d, '08:30', gdp, 'BEA', 'bea');
  add(d, '08:30', 'Personal Income and Outlays, ' + m + ' (with the PCE price index)', 'BEA', 'bea');
});

/* FOMC: the second day of each meeting. The Fed's calendar page gives the
   dates, not a time, so none is shown. An asterisk there marks a meeting
   with a Summary of Economic Projections. */
[
  ['2026-10-28', false], ['2026-12-09', true],
  ['2027-01-27', false], ['2027-03-17', true], ['2027-04-28', false], ['2027-06-09', true],
  ['2027-07-28', false], ['2027-09-15', true], ['2027-10-27', false], ['2027-12-08', true],
].forEach(([d, sep]) => add(d, '', 'FOMC meeting ends' + (sep ? ', with the Summary of Economic Projections' : ''), 'Fed', 'fomc', 'Second day of a two-day meeting'));

/* CFTC Commitments of Traders, 3:30 pm ET (positions from the Tuesday before) */
[['2026-10-09'], ['2026-10-16'], ['2026-10-23'], ['2026-10-30'], ['2026-11-06'], ['2026-11-16', true], ['2026-11-20'],
  ['2026-11-30', true], ['2026-12-04'], ['2026-12-11'], ['2026-12-18'], ['2026-12-28', true]]
  .forEach(([d, late]) => add(d, '15:30', 'Commitments of Traders', 'CFTC', 'cot', late ? 'Later than usual: a federal holiday' : ''));

/* EIA Weekly Petroleum Status Report: Wednesdays 10:30 am ET, except where
   EIA lists a holiday change (15 October and 12 November 2026, Thursdays at
   noon). Its list has no other change for 2026. */
{
  const moved = { '2026-10-14': ['2026-10-15', '12:00', 'Columbus Day'], '2026-11-11': ['2026-11-12', '12:00', 'Veterans Day'] };
  for (let t = Date.parse('2026-10-14T12:00:00Z'); t <= Date.parse('2026-12-30T12:00:00Z'); t += 7 * 864e5) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (moved[d]) add(moved[d][0], moved[d][1], 'Weekly Petroleum Status Report', 'EIA', 'eia', 'Moved for ' + moved[d][2]);
    else add(d, '10:30', 'Weekly Petroleum Status Report', 'EIA', 'eia');
  }
}

/* every scheduled release, with its moment in UTC ms (noon ET when there is no time) */
export const EVENTS = E.map((e) => ({ ...e, at: wallToUtc(e.date + 'T' + (e.time || '12:00'), ET), url: PAGES[e.page] }))
  .sort((a, b) => a.at - b.at || a.what.localeCompare(b.what));

/* how far each agency's published schedule reaches, so the page can say so */
export const REACH = {
  BLS: '10 December 2026',
  BEA: '22 December 2027',
  Fed: '8 December 2027',
  CFTC: '28 December 2026',
  EIA: '30 December 2026',
};
