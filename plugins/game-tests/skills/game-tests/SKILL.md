---
name: game-tests
description: Write, run and fix this web game's saved tests in tests/game/, which game_test plays in real windows, multiplayer included. Use when asked to add, change or run game tests, or after changing a game that has them.
---

# Game tests

## What to test, in this order

1. The game's rules as players meet them: what a player may and may not do,
   turns, scoring, winning and losing, information one player must not see,
   and what one player's move does to the others.
2. Each flow from opening the game to playing again.
3. Screens and settings last.

Every test checks the result its name promises: steps that only click
through screens without checking an outcome don't catch anything. Rules that
need no screen, such as which card combinations are valid, belong in the
project's own unit tests, run by its package.json `test` script; game tests
check that those rules reach the screen and every player.

## How to write them

First read the game and its design document, and list its rules, what one
player's move does to the others, and its flows. Write a test for each, for
every player when the game is multiplayer, putting steps several tests share
in a setup file. When adding tests, compare that list with the existing tests
and add what they don't guard yet. Run `game_test`; when the game is wrong,
fix the game, not the test, and say what was wrong. End by listing each test
and the rule or flow it guards.

The Automated tests panel lists each test by its `name`, so write the name in the
language the person uses with you: English when they write in English,
Spanish when they write in Spanish. Before they have written to you, use
the language the request names, as the panel's buttons do, or English. File
names, `data-testid`s and state paths stay
as the game has them.

## The file

Each game test is one JSON file in `tests/game/`, such as
`tests/game/play-card.json`:

```json
{ "schemaVersion": 1, "name": "A played card leaves the hand and tops the pile for both players", "players": 2, "setup": "two-players",
  "steps": [
    { "player": 1, "remember": { "card": "hand.0" } },
    { "player": 1, "expect": { "enabled": [{ "testId": "card-{{card}}" }] } },
    { "player": 1, "action": { "type": "click", "target": { "testId": "card-{{card}}" } },
      "expect": { "state": { "pile.top": "{{card}}", "hand": { "excludes": "{{card}}" } } } },
    { "player": 2, "expect": { "state": { "pile.top": "{{card}}", "myTurn": true }, "hidden": [{ "testId": "opponent-hand-faces" }] } }
  ] }
```

**Actions.** A step's `action` is one `game_use` action (`click`, `type`,
`press`, `touch`, `wait`, `resize`, `bridge`), or `{ "type": "reload" }` to
refresh the player's page as a player would, or `{ "type": "offline" }` and
`{ "type": "online" }` to cut and restore that player's network, open
connections included, to test disconnecting and reconnecting. Target
elements by `data-testid`, adding it to the game where needed, rather than by
screen coordinates, so a test survives layout changes.

**Checks.** `expect` may hold:

- `visible` and `hidden`, `enabled` and `disabled`: elements by
  `{ "testId" }`, `{ "text" }` or `{ "role", "name" }`. `disabled` checks a
  control is shown but can't be used, such as a card the rules don't allow or
  Start before enough players joined.
- `state`: dotted paths into `window.__OHMYGAME_PLAYTEST__.snapshot()`, with a
  value to equal or one of `{ "eq" }`, `{ "ne" }`, `{ "gt" }`, `{ "gte" }`,
  `{ "lt" }`, `{ "lte" }`, `{ "contains" }`, `{ "excludes" }`, `{ "exists" }`.
- `screenChanged` and `notBlank`.
- `timeoutMs` (default 2000, at most 10000): how long `visible`, `hidden`,
  `enabled`, `disabled` and `state` are retried.

Every run also fails on console errors, failed requests, a game that stays
blank after opening, and a blank last frame; `ignoreErrors` lists console
error text to allow. Requests that fail while a test has the player off line
don't count.

**Values.** A step's `remember` names text, numbers or true/false in that
player's state, read after its checks, such as
`{ "remember": { "room": "room.code" } }`; later actions and checks use them
as `{{room}}`. In a check, a value that is only `{{name}}` keeps its type, so a
remembered number equals a number. This tests random games exactly without
fixing their deal: remember what was dealt, then check what happens to it.

**Players.** For a multiplayer game, `players` (up to 4) opens each player in
their own window as a separate guest of the real server; a step's `player`
(from 1, default 1) says whose window it acts in and checks, and every
player's console errors count at every step. For a real-time game, a step's
`together` lists players acting at the same moment, in place of `player` and
`action`, and its `expect` checks each of them:

```json
{ "together": [
  { "player": 1, "actions": [{ "type": "press", "key": "ArrowRight", "duration": 1000 }] },
  { "player": 2, "actions": [{ "type": "press", "key": "ArrowLeft", "duration": 1000 }] }
] }
```

Positions vary from run to run, so check what must hold rather than exact
values. Test a multiplayer game this way, with its real server, rather than
with a single-player stand-in or test-only game modes.

**Setup.** Steps several tests share, such as creating a room and the other
players joining it, go in `tests/game/setup/<name>.json` as
`{ "schemaVersion": 1, "name", "players", "steps" }`, and a test's
`"setup": "<name>"` runs them first; what they remember, such as the room
code, the test can use.

**Other fields.** `viewports` lists sizes to run at, 1280x720 by default;
`path` opens a path, query or hash of the game; `seed`, for a game whose
bridge has `setSeed` and `reset`, calls them before the first step.

## The game's bridge

A test that checks `state` needs the game to answer
`window.__OHMYGAME_PLAYTEST__.snapshot()` with plain JSON while the
`ohmygamePlaytest` query parameter is present, as `game_use` describes. Keep
what it returns to what a test needs: the player's hand, whose turn it is, the
score, the room code.
