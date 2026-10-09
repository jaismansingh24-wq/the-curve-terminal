# The Curve Terminal

A trading journal from The Curve, by s7ven. A Windows desktop app built with
Tauri 2: a Rust core and a plain HTML, CSS and JavaScript interface, with no
framework and no build step for the interface. The brand, voice and rules are
in [CLAUDE.md](CLAUDE.md). Read that first.

## What is where

```
app/ui/                 the app's interface (intro, home, settings, panels)
app/src-tauri/          the app's Rust side: window, Discord status, startup entry, links
installer/ui/           setup's interface (install, update and remove)
installer/src-tauri/    setup's Rust side: copies files, shortcuts, registry, uninstall
shared/                 used by both: fonts, design tokens, the mark, the night sky, lines
assets/                 icon source (icon.svg) and the README.txt that ships with the app
scripts/                check, preview, sync and release
```

`shared/` is the one source. `npm run sync` copies it into `app/ui/shared/`
and `installer/ui/shared/` (the copies are not committed); every other
script runs it for you.

## Commands

```bash
npm run preview          # the app's interface in a browser, http://localhost:5181
npm run preview:setup    # setup's interface, http://localhost:5182 (add ?mode=uninstall)
npm run dev              # the real app window, with Discord and the registry
npm run dev:setup        # the real setup window (it has no app inside: see release)
npm run check            # the rules, checked by machine
npm run release          # builds dist/TheCurveTerminal-Setup-<version>.exe
npm run snap             # starts the built app, screenshots it to dist/snaps/, closes it
```

`npm run snap` is for testing from somewhere else: it drives the real window
through WebView2's local debugging port and reports any errors from inside
the app. Add `-- --at 1.5,3,7` for screenshots at those seconds, `-- --open
settings` to open a panel first. It starts the app with `--test`, which keeps
Discord status off for that run.

The preview has no native side, so Discord status, opening with Windows and
installing say they are not available there instead of pretending.

Build output goes to `C:/Users/jaism/.cache/the-curve-terminal/target`
(set in `.cargo/config.toml`), so OneDrive does not try to sync it.

## The rules check

`npm run check` fails on: the word "gradient"; the site's strategy phrases
and a few more; em dashes; any mention of AI; inline scripts, styles or
handlers, eval, or a loosened security policy; bid or ask colours outside
their tokens; a missing disclaimer; a stored key the Privacy panel does not
describe; anything loaded from outside; versions that disagree. The release
script will not build if it fails.

## Discord status

Discord status is on by default. It uses the Discord application "The Curve
Terminal" (ID `1557792319091249222`, set as `CLIENT_ID` in
`app/src-tauri/src/presence.rs`). Every copy of the app uses the same ID;
the people who install it need nothing but the Discord app open.

How it was set up, should it ever need doing again:

1. Go to the Discord Developer Portal, choose **New Application** and name it
   **The Curve Terminal**. That name is what profiles show after "Playing".
2. Copy the **Application ID** from General Information.
3. Under **Rich Presence**, then **Art Assets**, upload `assets/discord-mark.png`
   and name the asset `mark`.
4. Paste the ID into `CLIENT_ID` in `app/src-tauri/src/presence.rs`.

The ID is not a secret: every app that shows a Discord status carries one.

## Releasing

`npm run release` checks, builds the app, puts it inside setup, builds setup
and prints the file's size and SHA-256. It does not upload anything.

The setup file is not code-signed yet, so Windows SmartScreen will warn
people who download it ("Windows protected your PC"). Signing needs a
code-signing certificate, which costs money: the owner's call.

## Versions

The version lives in `package.json`, both `tauri.conf.json` files and the
root `Cargo.toml`. For each release, also add an entry to `CHANGELOG.md`, to
What's new in `app/ui/index.html`, and update `assets/README.txt`. The check
fails if any of these disagree.
