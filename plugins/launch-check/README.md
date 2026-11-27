# Launch Check

Check a web game's build before you publish it elsewhere: first-load size, file
counts, paths and requests, against each platform's own limits.

Official OhMyGame plugin `ohmygame/launch-check`, an optional Beta for OhMyGame
plugin API **2.37+**. It is off until a project turns it on.

## What it does

**Check before publishing…** in the Publish menu, or in the Game panel's ⋯ menu,
opens the **Launch check** panel and scans. The app builds the game as **Export
web build** does and hands the plugin the folder; the plugin reads the files and
never runs them. A scan can't run while the AI is working or another export or
publish runs.

The report says:

- **What a player downloads.** The *first download* is the page and what it
  loads at once: its scripts and their static imports, style sheets and what
  they name. The higher figure adds every file the code or data files name,
  which most games load before play starts. Code behind `import()` and what only
  it names loads later. Text counts as a host gzips it; media as it is.
- **What breaks on other hosts.** Paths starting with `/` (itch.io and the
  portals serve games from a subfolder), fonts and libraries fetched from other
  sites, `http://` requests, references to files that aren't in the build or
  whose capitals differ (hosts are case-sensitive), package imports a browser
  can't load, files nothing names, and source maps.
- **Each platform's limits**, with the page each one is from and when it was
  read: OhMyGame Community, itch.io, CrazyGames, YouTube Playables and Poki. A
  required limit that's exceeded fails; a recommended one, or a first download
  that may exceed a limit once the named files are counted, asks you to check.
  Poki's pages disagree on its size target, so both figures show.

Tick where you plan to publish and **Ask the AI to fix these** puts a request in
the composer covering those platforms and what the scan found. A page without a
`<meta name="viewport">` tag is reported too: phones lay it out at desktop width.

## Test on a phone

**Test on a phone…** in the Game panel's ⋯ menu, or **Start** in the panel,
builds the game and serves it on this computer's local network until **Stop**,
or for an hour. Scan the QR code with a phone on the same Wi-Fi and play.

- The build is served as it is, at the root of the address, as OhMyGame
  Community serves it, so absolute paths still work. Only the page the phone
  gets has one script added first in its head; the project doesn't change.
- That script reports, every two seconds and after each error: console errors,
  uncaught errors and failed loads, the frame rate and its lowest second, load
  and first-frame times, whether the game's audio context is running or still
  waiting for a tap, the viewport, pixel ratio and safe area. A small line in a
  corner of the phone's screen says it is there.
- Each phone shows in the panel with what needs a look, and **Ask the AI to fix
  what phones reported** puts those in the composer.
- The address carries a random token; the first visit sets it as a cookie for
  the game's own requests. Without it the server answers 403, so others on the
  network can't open the game.
- It answers byte ranges, which iOS Safari needs to play audio and video.
- Your computer may ask whether to allow incoming connections. Guest and office
  networks often keep devices apart. The address is `http` on the local
  network, so the phone's browser treats it as not secure.

The last report is kept in the plugin's data folder, per project. The scan
changes no project files.

## Limits of a static scan

- A file whose name the game builds at run time from nothing fixed, such as
  `` `${folder}/${name}` ``, looks unused. Names built from a template or a
  joined string with fixed text, such as `` `enemy-${n}.png` `` or
  `"enemy-" + n`, are recognized. Check before deleting.
- What a game loads before play starts depends on its code; the first-download
  range brackets it.

## Development

The native entry is TypeScript in `src/`, bundled with `es-module-lexer` to
`dist/` by `npm run build:launch-check` (run before `npm test`). The phone's
script is `overlay/overlay.js`. The panel draws QR codes with
[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT),
in `panel/vendor/`. Tests are in `test/launch-check/`.
