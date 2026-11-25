# Game Tests

An optional Beta plugin that keeps a web game's tests in the project and runs
them in real game windows, multiplayer included. It needs OhMyGame plugin API
**2.37**: a desktop build from OhMyGame's `dev` branch until a release has it.

## What it does

- **Game tests** are JSON files in `tests/game/`. Each opens the game in fresh
  windows, one per player, acts as players do (click, type, press, touch,
  several players at the same moment, reload a page, take a player off line
  and back) and checks what each player sees: elements shown, hidden, usable
  or not, the game's state through `window.__OHMYGAME_PLAYTEST__.snapshot()`,
  the frame, console errors and failed requests. Steps several tests share go
  in `tests/game/setup/`.
- **The agent** gets the `game_test` tool and the `game-tests` skill, which
  gives the file format and what to test first: the game's rules as players
  meet them, then flows, then screens. It names each test in the language the
  person writes to it in, which is what the panel lists. Its instructions ask
  it to run the tests after it changes a game that has them.
- **The Automated tests panel** opens from **Automated tests** in the ⋯ menu
  of the Game panel, or the panel menu, rather than on its own. It lists the
  tests, runs all or one, and shows where one failed: the step, what was
  wrong, the frame and the console. It also runs the
  project's own unit tests, its package.json `test` script, and lists each
  test with its result, by file where the runner says, for Node's test
  runner, Vitest, Jest and Bun. It asks Vitest and Jest to name every test
  when the script runs one of them alone; other runners show their failures
  or their output and exit code. Its buttons put a request for the
  agent in the composer: write tests, add more, fix a failure.

## Limits

- Web games only (`web-game`, and `general` projects with a web preview), in
  the desktop app, whose game windows `game_use` also uses: four at most, so a
  test has at most four players.
- A player taken off line loses every connection through a proxy of its own
  window, so the game's server sees the drop; the game's own network calls made
  outside the page aren't affected.
- The agent reads a run as text. The frame where a test failed is in the panel;
  the agent can open the game with `game_use` to look.
- A run lives in the project's plugin host. The panel keeps the host running
  while it waits for a run it started; the latest run goes when the host stops.
- Unit tests run where the project's own `package.json` is, after `install`
  when it has no `node_modules` yet, for at most five minutes.

## Develop

Run `npm ci` and `npm run build:game-tests`, then add `plugins/game-tests`
through **Plugins → This computer** with **Develop** on, and turn it on in a
web game project.
