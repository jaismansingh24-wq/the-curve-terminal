# Changelog

What changed for someone using The Curve Terminal, newest first. Not
commit detail: the in-app What's new panel says the same, in the same
words.

## 0.9.4 · 20 October 2026

- TPO single prints are now the rows where only one letter printed with
  rows of two or more letters directly above and below them, so a single
  row counts too. One letter at the top or bottom of a TPO is a tail, and
  is no longer marked or carried forward as a single print.

## 0.9.3 · 19 October 2026

- A TPO chart is now set by length: a TPO every 30 minutes, every 4
  hours, each trading day, or any number of minutes, counted from the
  start of the trading day at 6:00 pm ET. Choosing a length sets its usual
  rows and letter time (30 minutes: rows of 1 tick, a letter each minute;
  4 hours: 4 ticks, a letter each minute; a day: 4 ticks, a letter each 30
  minutes), and each can then be changed in Style.
- Every TPO is drawn, each labelled on the time axis with the time it
  started, New York time. The overnight and regular-hours labels are gone.
- Auto rows, on at first: as you zoom out or squeeze the price scale, rows
  join (8, 20, 40 ticks and so on) so the letters stay readable, and they
  go back to the size you set as you zoom in. Turned off in Style, rows
  stay at your size.
- The initial balance is the range of the hour from 9:30 am ET, shown on a
  TPO that holds that whole hour. A TPO chart left at the old settings
  becomes a day's TPO with rows of 4 ticks; one with your own rows and
  letter time keeps them.

## 0.9.2 · 12 October 2026

- The mark on Home now sits at the centre of a turning sphere, drawn like
  a Dyson sphere: a tilted wireframe that turns once every five seconds,
  with small collector panels riding its equator and a second, steeper
  orbit. The mark itself is unchanged, and the sphere stays still when
  movement is reduced.

## 0.9.1 · 12 October 2026

- The menu is the vertical list again, in a panel down the left side. The
  menu button, now under the title bar at the left, opens it and closes
  it; so does M.
- The mark on Home prints itself again every ten seconds: the curve and
  its node fade, the three base ticks print one after another while the
  curve draws from the left, and the node settles at its end. Now and then
  a slow wave passes along the name in the title bar. Both stay still when
  movement is reduced.

## 0.9.0 · 12 October 2026

- The menu is now a panel. The button at the top left of the window, or M,
  opens it; choosing a page, Esc or a click outside closes it, and the
  arrow keys move through it. Pages use the whole width of the window.
- Settings is a page of its own, with each group in its own panel: in the
  menu, from the button at the top right, or with Ctrl+,.
- Home shows your journal's figures (closed trades, win rate with its
  likely range, average per trade, profit factor and the largest drawdown,
  each with what it rests on), your research in the Folio (pages, words,
  marked lines, tags and the page you edited last), and NQ positioning
  from the copy of the CFTC's report that Atlas last kept. Home fetches
  nothing.
- Discord's status is now its mark beside the shortcuts button: a green
  dot when connected, a red one when not (switched off, Discord closed or
  not answering), and an empty ring while it checks. Selecting it opens
  the Discord switch in Settings.

## 0.8.1 · 12 October 2026

- TPO single prints from finished sessions are carried to the right as
  faint bands until a later period trades into them. The part traded into
  stops at that session; the rest runs on. Style turns this off.
- Volume and delta profiles of each day or regular session now sit against
  the right end of that day, at a fixed width, so they no longer grow as
  you move or zoom the chart. Style sets both widths in pixels, and they
  size the visible-range strip too.
- A footprint now puts its latest bar back in the middle only when the
  replay carries the price out of view. While the price stays in view, the
  chart stays where it is.

## 0.8.0 · 12 October 2026

- Replay's order panel in colour: the Buy buttons green and the Sell
  buttons red, a long position green and a short one red, and the same in
  the right-click menu and the table of trades.
- Charts start in new colours: white candles up, black candles down, white
  borders and wicks, on a plain black chart. Style changes the borders and
  wicks too, as well as everything else.
- Drag a chart past the latest bar to leave room to its right.
- A footprint keeps its latest bar in the middle of the chart, both ways,
  as the replay moves. Drag that bar out of view and the chart stays where
  you left it; Fit or a double click brings it back.
- Footprint buys and sells as a full fill, shaded by size as before, or as
  a histogram, in Style.
- Volume and delta profiles each choose their own range: the visible bars,
  each day, or each regular session. Thin lines mark each volume profile's
  point of control and the top and bottom of its value area; Style turns
  them off.
- TPO shows the overnight session and regular hours apart. When a replay
  starts, the overnight session (from the 4:00 pm ET close to the 9:30 am
  open, in lower-case letters) is already built, and the regular session
  builds as you play. Single prints (runs of two or more rows where only
  one period traded) are marked, and so is the initial balance (the range
  of the regular session's first hour).
- TPO in Style: the sessions (overnight and regular hours, regular hours
  only, or the full trading day), letters or blocks, the period, rows and
  value area, shading by period, single prints, the value area, the
  initial balance and the open each on or off, and the colour of each.
- Indicators, on each chart: VWAP, starting again each trading day,
  regular session or week, with bands at 0.5, 2 and 2.5 standard
  deviations to begin with, which you can change. From a file of trades it
  is worked out from every trade; from a file of bars, from each bar's
  typical price, so it can differ a little from another platform's.

## 0.7.0 · 12 October 2026

- Replay now reads files of trades as well as bars: MotiveWave's tick
  export (Data, Export, with Tick chosen) is read as it is. The replay
  then moves trade by trade, the clock shows the second, and orders fill
  at the trade that reaches them rather than on an assumed path through a
  bar.
- A tick export only reaches back so far. Add an export to this file joins
  a later export of the same contract to the one you have, keeping one
  copy of the trades where the two overlap.
- One, two (side by side or stacked) or four charts, each with its own
  timeframe and type, and its own toolbar. All of them follow the same
  replay.
- Three chart types. Candles. Footprint: each bar's buys and sells at
  every price, from a file of trades, its busiest row boxed and its delta
  under it. TPO: each session's prices by period as letters, regular hours
  or the full session, with its point of control and value area.
- Volume and delta: a volume pane, a delta pane (each bar's buys less
  sells, with a running total that starts again each trading day), and
  volume and delta profiles of the visible bars or of each session, with
  the point of control and value area marked.
- Buys and sells are inferred: a trade at the ask counts as a buy, at the
  bid as a sell. The exchange does not report the side, so platforms that
  infer it differently show different deltas from the same trades, and
  Replay says so on the page. From a file of bars there is no footprint or
  delta, and a profile spreads each bar's volume evenly over its range.
- Move a chart in any direction by dragging it. Drag the price axis to
  stretch prices and the time axis to stretch time; the wheel zooms time,
  and with Ctrl, prices. A double click returns to the present; on the
  price axis, it fits the prices again.
- Style, on each chart: candle colours, the chart's background, the grid,
  and the colours of volume, profiles, the value area, the point of
  control, buys and sells, with the value area's share, row sizes and TPO
  periods. Only the chart changes; the page keeps its own colours.
- Lines: horizontal lines and trend lines, in a colour you choose, kept
  with each file. Click a line to select it, drag to move it, Delete to
  remove it; right-click a chart for a line at that price.
- Play speeds are now times real time, from 1× to 3,600×, skipping the
  daily break and weekends. Next trade, Next minute and Next chart bar
  step forward by hand.
- Keys in Replay: Space plays and pauses; the Right arrow moves one trade
  (with a file of bars, one minute), and with Shift, one bar of the first
  chart; Delete removes the selected line; Escape stops a line half drawn.

## 0.6.0 · 12 October 2026

- Replay, under a new Practice heading in the menu: load your own export
  of one-minute bars (MotiveWave's is read as it is) and play it forward
  bar by bar on a candlestick chart, at five speeds, from any date and
  time you choose or from a random day.
- Practise orders against it: market, limit and stop orders, from the
  order panel or by right-clicking the chart at a price, with bracket
  presets that place a limit exit and a stop exit when an entry fills, one
  cancelling the other. Drag an order's line to move it; its × cancels it.
  Flatten closes everything at the last price.
- Timeframes from one minute to a day, built from the file's own bars, the
  last one forming as the replay moves. The wheel zooms, dragging pans, a
  double click returns to the present. Times are New York time, with yours
  beside them where it matters.
- How fills are worked out is set out on the page: a one-minute bar's high
  and low are taken in an assumed order, limits fill once price trades
  through by a tick unless you choose a touch, and slippage on market and
  stop orders is yours to set. Costs per contract come from Settings.
- Every replay trade is practice: labelled so, kept in Replay's own log
  apart from the journal, and never sent anywhere. A file's time zone is
  found from CME's daily 5:00 pm ET break and shown for you to confirm.
  Files stay on this computer; the Privacy panel lists what Replay keeps.
- R opens Replay. In Replay, Space plays and pauses and the Right arrow
  moves one bar (with Shift, one chart bar).

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
