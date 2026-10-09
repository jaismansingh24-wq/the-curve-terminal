/* Time, shown honestly: New York first, the reader's own in brackets, as
   "9:41 pm ET (7:11 am Friday your time)". The day is named only when the
   two clocks are on different dates. Updated on the minute. */

const ET_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
const LOCAL_TIME = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
const ET_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const LOCAL_DAY = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long' });

/* "9:41 pm", lower case, as the site writes it */
function hm(fmt, d) { return fmt.format(d).replace(/\s?(am|pm)$/i, (m, p) => ' ' + p.toLowerCase()); }

/* "Thursday 8 October 2026", built from parts so no comma creeps in */
export function longDate(d) {
  return WEEKDAY.format(d) + ' ' + d.getDate() + ' ' + MONTH.format(d) + ' ' + d.getFullYear();
}

export function greeting(d) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'Good morning.';
  if (h >= 12 && h < 17) return 'Good afternoon.';
  return 'Good evening.';
}

export function startClock({ et, local, date, greet }) {
  let timer = 0;
  function tick() {
    const d = new Date();
    const etText = hm(ET_TIME, d), localText = hm(LOCAL_TIME, d);
    const sameDay = ET_DAY.format(d) === LOCAL_DAY.format(d);
    if (et) et.textContent = etText + ' ET';
    if (local) {
      if (etText === localText && sameDay) local.textContent = '(the same as your time)';
      else local.textContent = '(' + localText + (sameDay ? '' : ' ' + WEEKDAY.format(d)) + ' your time)';
    }
    if (date) date.textContent = longDate(d);
    if (greet) greet.textContent = greeting(d);
    /* wake again just after the next minute turns */
    timer = setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
  }
  tick();
  return () => clearTimeout(timer);
}
