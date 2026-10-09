# The Curve Terminal: brief, design and rules

You are building **The Curve Terminal**, a new product from The Curve
(https://thecurve.in). This file tells you what The Curve is, how it looks
and sounds, and the rules it never breaks. The Terminal is a different
product from the website, but to a reader it must be unmistakably the same
thing: the same honesty, the same restraint, the same materials.

Where this file and the owner disagree, the owner wins. Where something is
not covered here, ask rather than invent.

---

## 1. Who and what

- **The Curve** is a free reference for how markets work underneath the
  chart: order flow, volume profile and TPO, futures, options, options flow,
  and the data and measurement problems under all of them.
- It is written, built and owned by **Jaisman**, who publishes as **s7ven**.
  Both names are the same person. There is no team, no company, no
  editorial board. Never imply otherwise.
- The site has six sections, each with a name and a plain subtitle:
  - The Tape (order flow)
  - The Auction (profile and auction)
  - The Contract (futures)
  - The Right (options)
  - The Hedge (options flow)
  - The Feed (data and measurement)
- Around them sit:
  - long reads (essays)
  - The Column (why the site publishes no strategies)
  - The Path (a reading order)
  - The Reading Room (practice drills on simulated data, in public beta)
  - Curve Projects (Prism, order flow studies for MotiveWave, in
    development, "coming soon" with no date)
  - Case Files (marked "soon", says nothing about its contents)
- The community lives on Discord: https://discord.gg/RKpuDyf2b

## 2. The core idea

**Explain what a measurement is, how it is calculated, and how it misleads.
Never tell anyone what to do.**

The site's own line: "No strategies. No signals. No one telling you what to
buy." Every term carries its definition and its common misreading. The
site is open about uncertainty:
- delta is inferred, not reported;
- dealer positioning in options is an assumption, not a fact;
- two platforms can show different numbers from the same session, and
  neither is wrong;
- figures not checked against a primary source are marked unverified.

The Terminal inherits this. It is an **instrument for looking**, not a
machine for deciding. It shows what happened, measured carefully, with the
limits of each measurement in plain view. If a screen would make someone
feel told to act, it is wrong.

---

## 3. Rules that are not preferences

Break none of these, even when it looks better or a feature seems to need
it. If a feature cannot exist without breaking one, raise it with the owner
before building it.

### No strategies, no signals, no advice
- **No buy, sell, long or short calls.** No entries, exits, targets or stops.
  No "bullish" or "bearish" verdicts, no scores ranking opportunities, no
  "setups", no win rates offered as promises.
- **Phrases the site's build rejects outright:**
  - "buy when"
  - "sell when"
  - "entry signal"
  - "take profit"
  - "stop loss placement"
  - "target of"
  - "go long when"
  - "go short when"
  - "this means price will"

  Treat that list as a floor, not the whole rule. Give the Terminal the same
  automated check.
- **Facts are fine; instructions are not.** "Cumulative delta turned negative
  at 10:42 ET" is fine. "Delta turned negative, consider shorting" is not.
- **Alerts:** if there are any, the user defines the condition and the alert
  reports a fact. Never ship preset "signal" alerts.
- **Describe, don't endorse:** when you describe how traders read something,
  say it is how it is read, and say where that read goes wrong.

### Data colours are for data only
- **Bid green `#2FA37A` and ask red `#C4453C` are data colours.** Use them for
  the bid and ask sides, buy and sell aggression, positive and negative delta,
  and the rows of a delta profile.
- **Never in chrome, branding or decoration.** That means no green buttons, no
  red error banners, no coloured logos, no "success" green. An error is shown
  in the normal greys with clear wording.
- **Fills** use the same hues at about 16% opacity:
  `rgb(47 163 122 / 0.16)` and `rgb(196 69 60 / 0.16)`.
- **Price bars:** on the site's figures and videos they are drawn in greys
  (light for up, dim for down). Keep the colours tied to the bid and ask
  sides, not to price direction.

### No gradients, anywhere
- That covers CSS, SVG fills, canvas, images and charts. The website's build
  fails on the word "gradient" in its stylesheet.
- Soft shapes are made with blurred ellipses or stacked alpha layers. Glass
  panels use alpha fills plus `backdrop-filter`.

### No em dashes in anything a user reads
- Use colons, semicolons, commas or parentheses.
- Titles separate with a middle dot: `Delta · The Curve`.

### No mention of AI
- Nowhere in the product, its copy, its marketing or its metadata.

### Never present simulated data as real
- Anything generated (practice data, demo modes, sample sessions) is labelled
  as simulated, every time it is shown.
- No figure in it corresponds to a real transaction, and the UI never
  suggests one does.

### Not advice, and says so
- Carry a disclaimer equivalent to the site's. It is educational material,
  not investment, financial, legal or tax advice, and not a recommendation.
  The author is not a SEBI-registered research analyst and holds no adviser
  or broker licence anywhere. Trading futures and options risks losses that
  can exceed deposits.
- Carry terms and a privacy page that say exactly what is stored and sent.
  See section 7.

### Don't invent facts
- No made-up dates, prices, release timings, partners, user counts or
  testimonials.
- Contract specifications come from the exchange's own documents. Anything
  unchecked is marked unverified.
- Scheduled times (data releases, market hours, holidays) come from the
  agency's or exchange's own published calendar, re-checked rather than
  carried forward.
- If you don't know, leave it out or ask.

---

## 4. Design language

### The mood
Dark, quiet, exact, editorial. Think of a well-made instrument panel, not a
casino or a crypto dashboard:
- **Hierarchy by weight and shade of grey, not colour.** White is the only
  accent.
- **Plenty of space.** Dense where data needs to be dense, calm everywhere
  else.
- **Nothing flashes.** Movement is slow and purposeful.

### Palette (exact)
```
INK          #0A0C10   page background
INK-RAISED   #0E1116   raised surfaces, dialogs
TEXT         #EDEFF2   primary text, the accent, active states
DIM          #98A0AA   secondary text
FAINT        #6B727C   labels, captions, tertiary
hairline     rgb(255 255 255 / 0.10)   borders
hairline-soft rgb(255 255 255 / 0.06)  dividers
glass-1/2/3  rgb(255 255 255 / 0.03 / 0.05 / 0.08)   layered fills
edge-catch   rgb(255 255 255 / 0.08)   1px lit top edge (inset box-shadow)
BID          #2FA37A   data only
ASK          #C4453C   data only
```
- **Radii:** overlays 22px, panels 14px, chips 5px; pills and buttons are
  fully rounded or 12px.
- **Shadows:** large, soft, dark, for example
  `0 18px 48px rgb(0 0 0 / 0.5)`, always with the 1px inset lit edge on top.
- **Focus:** a 2px solid TEXT outline with a 2px offset, on everything
  interactive.

### Type
- **Inter Tight:** display and UI headings, weight 600 to 650, tracking
  -0.01em to -0.03em at large sizes.
- **Source Serif 4:** body prose and definitions. Readable, around 1.55 line
  height.
- **JetBrains Mono:** labels, numbers, kickers, timestamps, tickers.
  - Kickers are uppercase, small (0.6 to 0.7rem) and widely tracked (0.14em
    to 0.22em), in FAINT.
  - Numbers use tabular figures.
- **Self-hosted variable woff2 files**, from the site's `site/fonts/`. No
  Google Fonts or other font CDN, since the security policy only allows the
  site's own files.
- **The kicker pattern** sits above a title: `THE TAPE · ORDER FLOW`, then
  the title in Inter Tight, then one plain line in serif DIM.

### The mark
The emblem, drawn on a 64-unit box. Copy the geometry exactly:
- **Outer ring:** circle r=30, stroke 1 unit, opacity 0.22.
- **Inner ring:** circle r=24.5, stroke 1 unit, opacity 0.10.
- **Two "contract month" rules:** x=24 and x=40, from y=16 to y=44,
  opacity 0.14.
- **Three base ticks** at y=50.5, x 18 to 22, 28 to 32 and 38 to 42,
  opacity 0.30.
- **The curve:** `M14 43 C21 42, 25.5 36, 29.5 27.5 C33.5 19, 40 15.5, 50 14.5`,
  stroke 2.2, round caps.
- **The node:** a filled circle at (50, 14.5), r=3.1.
- **Small sizes:** below about 60px, drop the inner ring, the rules and the
  ticks, leaving ring, curve and node.
- **The wordmark:** "THE CURVE" in Inter Tight 600, uppercase, tracked, with
  "by s7ven" beneath in JetBrains Mono, uppercase, FAINT.
- Always monochrome (TEXT on INK). Never in data colours, never with a
  gradient or glow effect.

### Materials and components (as the site has them)
- **Glass panels:** an INK-RAISED or near-ink fill at about 90%, glass
  layers, a 1px hairline, the lit top edge, a big soft shadow, and
  `backdrop-filter: blur(24px) saturate(160%)` where it floats over content.
- **Chips and pills:** fully rounded, hairline border, mono text in DIM. When
  active: a TEXT fill with INK text.
- **Buttons:**
  - primary: TEXT fill, INK text;
  - secondary: glass fill, hairline border, TEXT text;
  - copy is short and literal ("Copy link", "Continue", "Open the map").
- **Switches, segmented controls and sliders:** plain tracks in hairline
  greys; the knob or selected segment in TEXT. No coloured "on" states.
- **Icons:** simple line icons, about 1.5px stroke, round caps, in
  `currentColor`, on a 16 or 24 unit box.
- **Definition previews:** a small glass card with the term's definition on
  hover, focus or first tap, linking to the full entry. The Terminal should
  explain its own numbers the same way (section 6).

### Backgrounds
- **The default** is the footprint grid: a faint grid on INK, its cells
  holding short horizontal dashes like a footprint chart.
- **The night sky is an optional setting:**
  - the galaxy band with a dust lane, stars, and a few bright stars with
    four-point spikes;
  - the occasional shooting star;
  - the moon in its real phase for tonight, worked out locally;
  - a hidden constellation that draws the mark.

  All in greys, and the stars hold still for reduced motion.
- **Charts sit on calm surfaces**, never on busy backgrounds.

### Charts and figures
- On the website, every figure is hand-drawn inline SVG and no chart library
  is used.
- The Terminal will likely need live charts. Draw them yourself (canvas or
  WebGL) in this language: greys, hairline grids, mono axis labels, data
  colours only where the data is bid, ask or delta.
- If a library is unavoidable, restyle it completely: no default theme, no
  gradients, no coloured chrome, no tooltips in a stock style.
- **Volume and TPO profiles:** the point of control in TEXT, the value area
  a mid grey, the rest faint. TPO letters are shaded in flat steps by
  period, never a gradient.

### Motion
- **Arrivals:** a short rise and fade, about 700ms, with
  `cubic-bezier(.2,.7,.3,1)` and a translateY of 18px, staggered by about
  110ms where several items arrive together.
- **Travel and morphs:** ease in and out (cubic, `cubic-bezier(.65,0,.35,1)`).
  At most a tiny overshoot on a small pop. Nothing bouncy.
- **Reduced motion:** honour `prefers-reduced-motion` everywhere, and collapse
  to the final state.
- **The site's opening animation** could be echoed if the Terminal has a
  start screen: on the night sky the constellation joins star by star,
  gathers into the mark, holds with the name and a small loading bar of real
  progress, then the mark settles into its place in the header.

---

## 5. Voice and copy

- **Plain British English:** colour, realised, behaviour. Calm, precise,
  concrete. Short sentences.
- **What, where, what to press.** For example: "The map button at the top
  right shows the whole site as a map."
- No hype, no emojis, no exclamation marks, no countdown-to-riches tone, no
  "unlock", "secret", "edge" or "alpha".
- **Say what a thing measures and where it misleads,** without hedging the
  facts or overstating them.
- **Times:** New York time first, with the reader's own in brackets, e.g.
  "8:30 am ET (6:00 pm your time)".
- **Dates:** "6 October 2026". Thousands take commas: 4,200.
- **Errors and empty states** are honest and useful: "Nothing matches
  'absorbtion'". Never cute.

---

## 6. What the Terminal should do

- **Explain every number in place.** Each measurement label links to its
  definition on the site and shows what it measures, how it is calculated
  and its common misreading. Use the site's own wording rather than writing
  new definitions.
  - The terms live in `content/terms.json` in the website repo: title, also
    known as, definition, context, the common misreading, see also.
  - A term's page: `https://thecurve.in/<section>/<topic>.html#<term-id>`
  - Its share page, which shows the term's card when pasted:
    `https://thecurve.in/term/<term-id>.html`
- **Show where each number comes from and its limits:**
  - which feed;
  - session boundaries;
  - tick filtering;
  - whether a figure is reported or inferred;
  - when options positioning is an assumption.

  Two platforms disagreeing is normal; say why.
- **Show time honestly:** exchange time and local time, the session the
  numbers belong to, and how fresh the data is (with a clear stale or
  delayed state).
- **Respect the reader's choices,** as the site does:
  - settings kept on their device;
  - text size and contrast;
  - reduced motion;
  - full keyboard use;
  - visible focus;
  - screen reader labels;
  - layouts that work on phones (the site puts menu, search, map and
    settings in a bottom bar on phones).
- **Keep a changelog** of what changed for a user (not commit detail), and a
  plain-words "What's new" for each update, as the site does.
- **Share cards for anything shareable:**
  - a 1200x630 PNG in the site's style (grid backdrop, the mark, a mono
    kicker, the title in Inter Tight, THECURVE.IN in mono);
  - `og:image` with a content fingerprint (`?v=<hash>`);
  - the image's width, height, type and alt stated;
  - Twitter/X tags as well.

  Chat apps cache previews, including failed ones, so the fingerprint
  matters.
- **Enforce the rules automatically.** The website runs a check script on
  every build: no gradients, the strategy word list, the disclaimer on every
  page, links and share images resolve, no inline styles, no em dashes. Give
  the Terminal its own and keep it passing.

## 7. Privacy and security

- **No tracking.** No analytics, advertising, tracking pixels, or third-party
  scripts the user is not told about. By default nothing leaves the device.
- **Storage:** local storage only, under its own namespace (the site uses
  `thecurve.*`; something like `thecurve.terminal.*`). Every key is
  described in plain words on the privacy or terms page, and that page
  changes in the same release as any new key, field or outside request.
- **Strict security policy:**
  - `script-src 'self'`;
  - no inline scripts;
  - no inline `style=""` (style through classes or the CSSOM);
  - no `eval`.
- **Secrets never ship to the client.**
  - Data-feed API keys, tokens and webhook URLs stay server-side.
  - The site's report form posts to a small Cloudflare Worker that holds the
    Discord webhook as a secret, checks same-origin JSON, rate-limits, drops
    bots and forwards nothing about the sender. Follow that pattern for
    anything that talks to an outside service.
- **Market data licences** often limit redistribution. Don't display or
  cache data in ways the feed's licence does not allow; check with the owner.

## 8. Context you may need

- **Hosting:**
  - The site is static, on GoDaddy cPanel shared hosting, with Cloudflare in
    front (DNS, SSL in Flexible mode, Workers).
  - Under Flexible mode, do not add an HTTPS redirect at the origin; it loops
    with Cloudflare's own.
  - Where the Terminal will live (a subdomain, a desktop app, something else)
    is the owner's call: ask.
- **Brand assets in the website repo:**
  - `site/fonts/` (the three variable fonts)
  - `site/css/site.css` (every token above, and the components)
  - `tools/brand.py` (the emblem, colours and footprint backdrop for images
    and video)
  - `build.py` (the emblem SVG as `EMBLEM`)
  - `site/js/boot.js` (the night sky)
- **Third-party marks:** MotiveWave's mark appears only where Prism is
  described, in its own colours. Do not recolour other brands' marks, and do
  not imitate an exchange's or broker's look.

## 9. Working with the owner

- **Precise, targeted fixes** rather than broad rewrites. Verify against the
  real output (screenshots, the built files), not assumptions.
- **Say plainly what changed and what didn't,** and what you could not
  check.
- **Ask before anything outward-facing:** publishing, deploying, posting to
  Discord, sending a test message, installing software, or spending money.
- **Rule conflicts:** when a request seems to conflict with these rules,
  point at the rule and offer the closest version that keeps it.
