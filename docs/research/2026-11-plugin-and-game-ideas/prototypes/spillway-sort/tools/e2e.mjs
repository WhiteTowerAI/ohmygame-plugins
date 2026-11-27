// Plays the prototype in a real browser with taps: solves a rescued level from
// the solver's hints, and checks undo, restart, the hold-to-preview and the
// control version. Needs Playwright with Chromium.
//   node tools/e2e.mjs [screenshot folder]
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pour } from "../src/rules.js";
import { analyse } from "../src/solver.js";

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
const base = `http://127.0.0.1:${server.address().port}/spillway-sort/index.html`;
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
  const tap = (index) => page.locator(`[data-testid="bottle-${index}"]`).tap();

  // Level 11 is the first rescued level: unsolvable without the overflow.
  await page.goto(`${base}?level=11&player=tester-a`);
  await page.waitForFunction(() => window.__OHMYGAME_PLAYTEST__);
  const level = pack.main[10];
  check(level.kind === "rescued", "level 11 is a rescued level");
  let state = await snapshot();
  check(state.bottles.join() === level.bottles.join(), "it opens with the level's bottles");
  check((await page.locator('[data-testid^="pipe-"]').count()) === Object.keys(level.pipes).length, "its pipes show");
  if (shots) await page.screenshot({ path: path.join(shots, "spillway-level.png") });

  // Holding the target shows the pour without making it.
  const solved = analyse(level.bottles, 4, level.pipes, "O1");
  const first = solved.hint(level.bottles);
  await tap(first.from);
  const target = page.locator(`[data-testid="bottle-${first.to}"]`);
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  check((await page.locator(".bottle.preview").count()) >= 1, "holding a bottle previews where the water goes");
  if (shots) await page.screenshot({ path: path.join(shots, "spillway-preview.png") });
  await page.mouse.up();
  state = await snapshot();
  check(state.moves === 0, "the preview pours nothing");

  // Undo and restart.
  await tap(first.to);
  state = await snapshot();
  check(state.moves === 1, "a tap on the target pours");
  await page.getByTestId("undo").tap();
  check((await snapshot()).bottles.join() === level.bottles.join(), "undo puts it back");
  await tap(first.from);
  await tap(first.to);
  await page.getByTestId("restart").tap();
  check((await snapshot()).moves === 0, "restart starts over");

  // Solve it, following the solver.
  let overflowUsed = false;
  for (let step = 0; step < level.optimal; step += 1) {
    const before = await snapshot();
    const move = solved.hint(before.bottles);
    await tap(move.from);
    await tap(move.to);
    const after = await snapshot();
    check(after.moves === step + 1, `move ${step + 1}: ${move.from + 1} → ${move.to + 1}`);
    // A pour through a full bottle leaves it as it was, so ask the rules, not the bottles.
    if (pour(before.bottles, move.from, move.to, 4, level.pipes, "O1").overflow) overflowUsed = true;
  }
  state = await snapshot();
  check(state.solved, `solved in the shortest ${level.optimal} moves`);
  check(overflowUsed, "the solution sent water through a pipe");
  check((await page.getByTestId("done-text").textContent()).includes(String(level.optimal)), "the end says how it went");
  if (shots) await page.screenshot({ path: path.join(shots, "spillway-solved.png") });
  const exported = () => page.evaluate(() => JSON.parse(localStorage.getItem(`spillway-sort:main:${window.__OHMYGAME_PLAYTEST__.snapshot().player}`)));
  let saved = await exported();
  const tries = saved.levels[level.seed].tries;
  check(tries.length === 2 && tries[0].outcome === "abandoned" && tries[0].moves === 2 && tries[0].undos === 1 && tries[0].previews === 1, "the restarted try is kept, with what was done in it");
  check(tries[1].outcome === "solved" && tries[1].moves === level.optimal && tries[1].firstOverflow?.pauseMs >= 0, "the solving try says when the overflow was first used, and the pause before it");
  check(saved.levels[level.seed].kind === "rescued", "levels say what kind they are");

  // A refused pour shakes the bottle you poured into.
  await page.getByTestId("restart").tap();
  const illegal = (() => {
    for (let from = 0; from < level.bottles.length; from += 1)
      for (let to = 0; to < level.bottles.length; to += 1)
        if (level.bottles[from] && from !== to && !pour(level.bottles, from, to, 4, level.pipes, "O1")) return { from, to };
  })();
  await tap(illegal.from);
  await tap(illegal.to);
  check((await page.locator(`[data-testid="bottle-${illegal.to}"].shake`).count()) === 1, "a refused pour shakes the target");

  // A touch the browser cancels pours nothing.
  const cdp = await context.newCDPSession(page);
  await tap(first.from);
  const point = await page.locator(`[data-testid="bottle-${first.to}"]`).boundingBox();
  const at = [{ x: point.x + point.width / 2, y: point.y + point.height / 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  check((await snapshot()).moves === 0, "a cancelled touch doesn't pour");

  // Leaving a level unsolved keeps its try; another player starts a record of their own.
  await page.evaluate(() => window.__OHMYGAME_PLAYTEST__.setSeed(12));
  saved = await exported();
  check(saved.levels[level.seed].tries.at(-1).outcome === "abandoned", "a level left unsolved is recorded as abandoned");
  // Opened, restarted twice, then level 12: restarts are opens of the same level.
  check(saved.opens.map((item) => item.seed).join() === [level.seed, level.seed, level.seed, pack.main[11].seed].join(), "every level opened is logged in order");
  await page.goto(`${base}?level=11&player=tester-b`);
  await page.waitForFunction(() => window.__OHMYGAME_PLAYTEST__);
  saved = await exported();
  check(saved.levels[level.seed].tries.length === 1, "another player's record starts fresh");

  // A reload resumes the level, and a bad level number doesn't break the page.
  await page.evaluate(() => window.__OHMYGAME_PLAYTEST__.setSeed(15));
  await page.goto(`${base}?player=tester-b`);
  await page.waitForFunction(() => window.__OHMYGAME_PLAYTEST__);
  check((await snapshot()).level === 15, "a reload resumes the level");
  await page.evaluate(() => window.__OHMYGAME_PLAYTEST__.setSeed("x"));
  check((await snapshot()).level === 1, "a bad level number opens level 1");
  await page.evaluate(() => window.__OHMYGAME_PLAYTEST__.setSeed(0));
  check((await snapshot()).level === 0 && (await snapshot()).kind === "rescued", "level 0 opens today's level");

  // Nine bottles fit a narrow phone.
  const narrow = await browser.newPage({ viewport: { width: 320, height: 640 } });
  await narrow.goto(`${base}?level=23&player=tester-c`);
  await narrow.waitForFunction(() => window.__OHMYGAME_PLAYTEST__);
  const boxes = await narrow.locator(".bottle").evaluateAll((items) => items.map((item) => item.getBoundingClientRect()).map((box) => [box.left, box.right]));
  check(boxes.length === 9 && boxes.every(([left, right]) => left >= 0 && right <= 320), "nine bottles fit 320 px");
  if (shots) await narrow.screenshot({ path: path.join(shots, "spillway-narrow.png") });
  await narrow.close();

  // The control version has no pipes.
  await page.goto(`${base}?control=1&level=11&player=tester-a`);
  await page.waitForFunction(() => window.__OHMYGAME_PLAYTEST__);
  check((await page.locator('[data-testid^="pipe-"]').count()) === 0, "the control version shows no pipes");
  check((await snapshot()).version === "control", "and says it is the control version");

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
} finally {
  await browser.close();
  server.close();
}
