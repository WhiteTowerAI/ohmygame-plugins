// Plays the prototype in a real browser with taps: clears a level that needs
// gravity by following the solver, and checks a bump and its shake, undo,
// restart, the hold-to-preview, a cancelled touch, the record, resuming, the
// daily level, the no-preview switch and the control version.
//   node tools/e2e.mjs [screenshot folder]
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canLeave } from "../src/rules.js";
import { findSolution } from "../src/solver.js";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(path.join(process.env.PLAYWRIGHT_ROOT ?? "/usr/local/lib/node_modules", "playwright"));
}
const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// The prototypes share code, so serve their parent folder.
const root = path.dirname(here);
const shots = process.argv[2];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (request, response) => {
  const file = path.join(root, decodeURIComponent(new URL(request.url, "http://x").pathname).replace(/^\/+/, ""));
  if (!file.startsWith(root)) return response.writeHead(403).end();
  try {
    response.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/falling-arrows/index.html`;
const pack = JSON.parse(await readFile(path.join(here, "levels.json"), "utf8"));
const check = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`ok - ${message}`);
};

const browser = await playwright.chromium.launch();
try {
  const context = await browser.newContext({ ...playwright.devices["iPhone 13"], locale: "en-US" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  const snapshot = () => page.evaluate(() => window.__OHMYGAME_PLAYTEST__.snapshot());
  const tap = (x, y) => page.locator(`[data-testid="arrow-${x}-${y}"]`).tap();

  // Level 11 is the first that can't be cleared without gravity.
  await page.goto(`${base}?level=11&player=tester-a`);
  await page.waitForFunction(() => window.__OHMYGAME_PLAYTEST__);
  const level = pack.main[10];
  check(level.kind === "rescued", "level 11 needs gravity");
  const { width, height } = level;
  check((await snapshot()).board === level.board, "it opens with the level's board");
  check((await page.locator(".cell.free").count()) === 0, "it doesn't show which arrows can leave");
  if (shots) await page.screenshot({ path: path.join(shots, "arrows-level.png") });

  // A blocked arrow bounces and costs a heart.
  const blocked = [...level.board].findIndex((cell, i) => cell !== "." && !canLeave(level.board, width, height, i % width, Math.floor(i / width)));
  await tap(blocked % width, Math.floor(blocked / width));
  let state = await snapshot();
  check(state.hearts === 2 && state.board === level.board, "a blocked arrow costs a heart and changes nothing");
  check((await page.locator(`[data-testid="arrow-${blocked % width}-${Math.floor(blocked / width)}"].shake`).count()) === 1, "and shakes");

  // Holding shows the board after taking an arrow, without taking it.
  const solution = findSolution(level.board, width, height);
  const first = solution[0];
  const target = page.locator(`[data-testid="arrow-${first.x}-${first.y}"]`);
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  const GLYPH = { U: "↑", D: "↓", L: "←", R: "→" };
  const leaving = page.locator(".cell.leaving");
  check((await leaving.count()) === 1 && (await leaving.getAttribute("data-taken")) === GLYPH[level.board[first.y * width + first.x]], "holding an arrow previews taking it, and marks the arrow taken");
  if (shots) await page.screenshot({ path: path.join(shots, "arrows-preview.png") });
  await page.mouse.up();
  check((await snapshot()).moves === 0, "the preview takes nothing");

  // A touch the browser cancels takes nothing.
  const cdp = await context.newCDPSession(page);
  const at = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  check((await snapshot()).moves === 0, "a cancelled touch takes nothing");
  await page.waitForTimeout(650);
  check((await page.locator(".cell.leaving, .cell.blocked").count()) === 0, "nor turns into a preview");

  // Undo and restart.
  await tap(first.x, first.y);
  check((await snapshot()).moves === 1, "a tap takes the arrow");
  await page.getByTestId("undo").tap();
  check((await snapshot()).board === level.board, "undo puts it back");
  await page.getByTestId("restart").tap();
  state = await snapshot();
  check(state.hearts === 3 && state.moves === 0, "restart gives the hearts back");

  // Clear it, following the solver: every move is a real tap.
  for (const move of solution) await tap(move.x, move.y);
  state = await snapshot();
  check(state.solved && state.moves === level.arrows, `cleared all ${level.arrows} arrows with taps`);
  check((await page.getByTestId("done-text").textContent()).startsWith("Cleared"), "the end says so");
  if (shots) await page.screenshot({ path: path.join(shots, "arrows-cleared.png") });
  const exported = (version = "main") => page.evaluate((key) => JSON.parse(localStorage.getItem(`${key}:${window.__OHMYGAME_PLAYTEST__.snapshot().player}`)), `falling-arrows:${version}`);
  let tries = (await exported()).levels[level.seed].tries;
  check(tries.length === 2 && tries[0].outcome === "abandoned" && tries[0].bumps === 1 && tries[0].previews === 1 && tries[0].undos === 1 && tries[0].firstBump, "the restarted try is kept, with its bump, preview and undo");
  check(tries[1].outcome === "solved" && tries[1].moves === level.arrows && tries[1].bumps === 0, "the clearing try is recorded");

  // Running out of hearts ends the level, and is recorded as lost.
  await page.getByTestId("restart").tap();
  for (let i = 0; i < 3; i += 1) await tap(blocked % width, Math.floor(blocked / width));
  check(!(await page.locator("#done").isHidden()) && (await snapshot()).hearts === 0, "three bumps end the level");
  tries = (await exported()).levels[level.seed].tries;
  check(tries.at(-1).outcome === "lost" && tries.at(-1).bumps === 3, "a level out of hearts is recorded as lost");

  // A reload resumes the level; level 0 is today's.
  await page.evaluate(() => window.__OHMYGAME_PLAYTEST__.setSeed(14));
  await page.goto(`${base}?player=tester-a`);
  await page.waitForFunction(() => window.__OHMYGAME_PLAYTEST__);
  check((await snapshot()).level === 14, "a reload resumes the level");
  await page.evaluate(() => window.__OHMYGAME_PLAYTEST__.setSeed(0));
  state = await snapshot();
  check(state.level === 0 && state.kind === "daily" && pack.daily.main.some((item) => item.board === state.board), "level 0 opens today's level, from the daily pool");

  // With the preview off, a long press is just a slow tap; the record is kept apart.
  await page.goto(`${base}?level=11&preview=0&player=tester-a`);
  await page.waitForFunction(() => window.__OHMYGAME_PLAYTEST__);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  check((await page.locator(".cell.leaving, .cell.blocked").count()) === 0, "with the preview off, holding shows nothing");
  await page.mouse.up();
  state = await snapshot();
  check(state.moves === 1 && state.version === "main-nopreview", "and takes the arrow, recorded as its own version");
  check((await exported("main-nopreview")).levels[level.seed].tries[0].previews === 0, "no previews are counted");

  // The control version doesn't fall.
  await page.goto(`${base}?control=1&level=11&player=tester-a`);
  await page.waitForFunction(() => window.__OHMYGAME_PLAYTEST__);
  state = await snapshot();
  check(state.version === "control" && state.kind === "control", "the control version opens");
  check(pack.control[10].board.replace(/\./g, "").length === level.arrows, "its level has as many arrows as the main one");
  // Without gravity, taking an arrow leaves every other arrow where it was.
  const free = [...state.board].findIndex((cell, i) => cell !== "." && canLeave(state.board, width, height, i % width, Math.floor(i / width)));
  await tap(free % width, Math.floor(free / width));
  const after = (await snapshot()).board;
  check([...after].every((cell, i) => (i === free ? cell === "." : cell === state.board[i])), "and nothing falls");
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
} finally {
  await browser.close();
  server.close();
}
