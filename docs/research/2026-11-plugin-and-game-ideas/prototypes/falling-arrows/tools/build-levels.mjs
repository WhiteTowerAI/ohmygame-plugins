// Builds levels.json: Falling Arrows' 30 levels, the control version's 30,
// and a pool of daily levels for each.
//   node tools/build-levels.mjs        (several minutes)
// Main: 10 tutorials (4×5, solvable with or without gravity), then 12 levels
// on 5×7 and 8 on 6×8 that can't be solved without gravity and that no
// top-down rule clears (see GREEDY in src/solver.js: on boards built
// backwards, taking the highest free arrow first clears almost all of them,
// so without this filter one obvious habit wins every level). Only about one
// board in 7,000–20,000 passes, which is why levels and dailies are built
// here rather than in the browser.
// Control: level for level the same size and number of arrows (so the same
// number of taps to clear), solvable without gravity, played without it.
// That's all that can be matched: without gravity taking a free arrow never
// makes a board unsolvable, so there are no dead ends.
import { writeFile } from "node:fs/promises";
import { level } from "../src/generator.js";

const DAILY = 14;
const hard = { beatTopDown: true, candidates: 1, maxTries: 200_000 };
const plan = [
  ...Array.from({ length: 10 }, (_, i) => ({ seed: `tutorial-${i}`, tier: "tutorial", kind: "plain" })),
  ...Array.from({ length: 12 }, (_, i) => ({ seed: `main-${i}`, tier: "main", kind: "rescued", ...hard })),
  ...Array.from({ length: 8 }, (_, i) => ({ seed: `deep-${i}`, tier: "deep", kind: "rescued", ...hard })),
];
const need = (found, what) => {
  if (!found) throw new Error(`No level for ${what}`);
  process.stdout.write(".");
  return found;
};
// Within each size, easier first: by how often a random tapper wins, highest first.
const ordered = (levels) => {
  const groups = ["tutorial", "main", "deep"].map((tier) => levels.filter((item) => item.tier === tier));
  return groups.flatMap((group) => [...group].sort((a, b) => (b.randomWin ?? 1) - (a.randomWin ?? 1)));
};
const matched = (item, prefix = "control-") => need(level(`${prefix}${item.seed}`, { tier: item.tier, kind: "control", arrows: item.arrows }), `${prefix}${item.seed}`);
const main = ordered(plan.map(({ seed, ...options }) => need(level(seed, options), seed)));
const control = main.map((item) => matched(item));
const daily = Array.from({ length: DAILY }, (_, i) => need(level(`daily-${i}`, { tier: "main", kind: "rescued", ...hard }), `daily-${i}`));
const dailyControl = daily.map((item) => matched(item));
await writeFile(new URL("../levels.json", import.meta.url), `${JSON.stringify({ main, control, daily: { main: daily, control: dailyControl } })}\n`);
console.log(`\n${main.map((item) => `${item.tier}:${item.arrows}/${Math.round(item.randomWin * 100)}%`).join(" ")}`);
