# Changelog

What changed for someone using The Curve Terminal, newest first. Not
commit detail: the in-app What's new panel says the same, in the same
words.

## 0.5.0 · 11 October 2026

- The Folio, a new part of the menu between Journal and Atlas: pages for
  research and notes, with headings, bold, italic, underline and
  strikethrough, text colour, highlights, quotes, lists and screenshots
  (paste them, drop them in, or choose a file).
- Select the text that matters and mark it as important, shown on the page
  as an underline (Ctrl+M) or hidden (Ctrl+Shift+M) so the page stays
  clean. The Digest gathers every marked line from all your pages, with
  the page and heading it came from; pressing a line opens it where it was
  written.
- Pages take tags and can be pinned; Pages lists them with search and
  three ways to order them. A page can start blank or from a few headings
  to fill in: Before the session (with today's scheduled releases and the
  background from Atlas filled in), After the session, or Research.
- Add the background from Atlas puts the figures Atlas holds now into a
  page, each with its source and date, so a page keeps what the background
  was when it was written.
- Pages save themselves as you write, to folio.json beside the journal,
  with the version before kept as a backup. Screenshots are kept in a
  folder beside it. The Privacy panel says so; nothing in the Folio is
  sent anywhere.
- D opens the Digest and P opens Pages.

## 0.4.1 · 11 October 2026

- The Backdrop is now called Atlas.
- Atlas has a new first page, How it connects. It takes each part of Atlas
  in turn (real yields, Treasury yields and the curve, the Fed and
  overnight rates, auctions, the dollar, positioning, energy and scheduled
  releases) and says how it is linked to NQ, how that link is usually
  read, and where the read goes wrong, with the figures Atlas holds now
  beside each one as plain facts with their source and date.
- It closes with a checklist for reading the background and the words
  people use for regimes, each with where it misleads. It explains; it
  does not say what NQ will do, label the current regime or score
  anything.
- It is written for NQ. A menu at the top lists ES, YM and RTY, which
  follow in a later update.

## 0.4.0 · 9 October 2026

- The Backdrop, a new part of the menu: the market's background from
  official public data only. Rates (the Treasury curve against a week and
  a month before, 2s10s and 3m10y with their history, real yields, and the
  overnight rates with the fed funds target range), Auctions (each
  Treasury auction's results and who bought), Positioning (the CFTC's
  Commitments of Traders for 29 futures markets, by type of trader, back
  to 2007), Energy (US crude, gasoline and distillate stocks against the
  five years before), Currencies (the ECB's euro reference rates),
  Releases (scheduled data releases in New York time and yours) and Fed
  wire (the Federal Reserve Board's press releases).
- Every figure names its publisher and the day it is for, and every page
  says when its copy was fetched, or that a newer one could not be. A
  figure's name opens what it is, how it is worked out and where it
  misleads. There are no forecasts, no consensus figures and no verdicts.
- The Backdrop fetches from the US Treasury, the New York Fed, the Federal
  Reserve Board, the CFTC, the ECB and EIA while one of its pages is open,
  at most every 12 hours (24 for the weekly reports). It is on by default;
  Settings, under The Backdrop, switches it off and can delete the
  downloaded copies. Sources, at the foot of every page, lists every
  address, and the Privacy panel and Terms now cover it.
- The menu scrolls when the window is too short to show all of it.

## 0.3.7 · 9 October 2026

- Journal, in the menu, is now a title of its own: centred above its
  pages and set apart from Home by a line.

## 0.3.6 · 9 October 2026

- Every panel, card, button and field is now a plain surface, in the app
  and in setup, so the grid or night sky only shows around them, never
  through them.

## 0.3.5 · 9 October 2026

- The charts on the Stats page sit on a plain surface, so the background
  no longer shows through them.
- If the journal file has not been read, an empty page says so instead of
  looking like a journal with no entries, and moving to another page reads
  it again.

## 0.3.4 · 9 October 2026

- Settings, under Journal, has a Show simulated trades switch. Off leaves
  simulated entries and accounts out of every page and figure; they stay
  in the journal file until you remove them, and a page left empty says
  how many are hidden.
- Settings, under Journal, says how many entries and accounts your journal
  file holds, and how many are simulated.
- If the journal file cannot be read when the app opens, it tries again,
  and Settings says so with a Read it again button, instead of showing an
  empty journal without a word.

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
