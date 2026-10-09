# Changelog

What changed for someone using The Curve Terminal, newest first. Not
commit detail: the in-app What's new panel says the same, in the same
words.

## 0.3.3 · 9 October 2026

- The Calendar page opens on the latest month that has trades when this
  month has none yet, instead of an empty month.
- When this month has no entries, the home screen says when your latest
  entry closed and points to Overview and Stats.
- Setup waits a few seconds for a copy of the app that has just been
  closed to let go of its file, instead of saying it is still open.

## 0.3.2 · 9 October 2026

- The Stats page is reorganised. Six charts come first, in equal panels:
  equity and drawdown, daily results, winners and losers (a ring),
  R-multiples, rolling expectancy and results by time of day. Their axes
  are labelled and drawn at the size of the panel, so the text is never
  stretched.
- Hover any chart, bar, ring segment, table row or calendar day for the
  figures under the pointer.
- Key figures sit in a row of eight equal tiles. The When and how cards
  are all the same size and scroll inside, showing at least five rows
  each. The prop account cards line their labels and values up in two
  columns.
- The calendar moves to the foot of the Stats page, in green and red by
  the size of each day, with the sign always written. The Calendar page
  itself stays in greys.

## 0.3.1 · 9 October 2026

- Simulated entries and accounts, generated for trying the app out, are
  labelled as simulated wherever they appear: on the home screen, in
  Overview, on the entry's own page, in Stats, the Calendar and Accounts.
- Settings, under Journal, can remove every simulated entry and account at
  once. Your own entries are not touched.
- The account form says plainly that the trailing drawdown is an amount,
  such as 2,000, and catches a balance line typed there by mistake.

## 0.3.0 · 9 October 2026

Stats and accounts.

- Stats: forty figures from your entries, in seven sections: results,
  risk and drawdown, execution, when and how, consistency, reliability,
  and prop accounts and costs. Net of costs by default, in money, ticks,
  points or R.
- Every figure shows its sample size. Rates and averages show a likely
  range, and say "too few to say" when the sample is small. Press a stat's
  name for what it measures, how it is worked out and where it misleads.
- The Calendar: each trading day's result, a month at a time, in greys
  with plus and minus signs.
- Accounts: each prop or personal account's rules (trailing drawdown,
  daily loss limit, consistency, profit target) and its fees and payouts.
  Stats show the distance to each rule.
- Entries can say whether a trade was near a high-impact release; October
  2026's releases are already known to the app, from thecurve.in's checked
  calendar.
- Contrast is now a slider from 0 to 100. Settings also take your own
  daily loss limit and your monthly platform and data fees.
- A trade closed on a Friday evening now counts towards Monday's trading
  day, as there is no weekend session.

## 0.2.0 · 9 October 2026

The journal.

- New entry records a trade: what you traded, when (in any time zone,
  converted to New York time), the prices, your confidence and the main
  confluence. Partials, the plan, order flow, mood and notes are optional.
- Overview lists every entry with filters, and each entry has its own page
  to read, edit or delete.
- The home screen now fills the window: a menu on the left, then the
  greeting and recent entries, then the last entry and profit and loss for
  today, this week and this month.
- Results are net of costs by default, and can be shown in money, ticks,
  points or R.
- Contract specifications for 26 CME futures, checked against CME Group's
  own on 9 October 2026.
- Setup now takes about five seconds so each step can be read, and
  finishes with a countdown.

## 0.1.0 · 8 October 2026

The first build.

- The opening: stars print one at a time like a tape, settle into the
  curve and form the mark. The loading bar under it shows real progress.
- The home screen, with New York time first and your own time beside it.
- Settings for text size, contrast, movement, the background (footprint
  grid, night sky or plain), the opening animation, Discord status and
  opening with Windows. All kept on this computer.
- Discord status, which shows The Curve Terminal and a short line on your
  profile. Never your trades.
- Setup with a choice of folder, shortcuts, opening with Windows and the
  readme; and a matching uninstaller.
- The journal itself arrives in the next update.
