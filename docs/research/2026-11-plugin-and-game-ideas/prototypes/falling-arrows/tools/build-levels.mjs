// Builds levels.json: Falling Arrows' 30 levels and the control version's 30.
//   node tools/build-levels.mjs
// Main: 10 tutorials (4×5, solvable with or without gravity), 12 levels on
// 5×7 and 8 on 6×8 that can't be solved without gravity, each the hardest of 8
// candidates for a random tapper. Control: level for level the same size and
// number of arrows (so the same number of taps to clear), solvable without
// gravity, played without it. That's all that can be matched: without gravity
// taking a free arrow never makes a board unsolvable, so there are no dead ends.
import { writeFile } from "node:fs/promises";
import { level } from "../src/generator.js";

const plan = [
  ...Array.from({ length: 10 }, (_, i) => ({ seed: `tutorial-${i}`, tier: "tutorial", kind: "plain" })),
  ...Array.from({ length: 12 }, (_, i) => ({ seed: `main-${i}`, tier: "main", kind: "rescued" })),
  ...Array.from({ length: 8 }, (_, i) => ({ seed: `deep-${i}`, tier: "deep", kind: "rescued" })),
];
const need = (found, what) => {
  if (!found) throw new Error(`No level for ${what}`);
  return found;
};
// Within each size, easier first: by how often a random tapper wins, highest first.
const ordered = (levels) => {
  const groups = ["tutorial", "main", "deep"].map((tier) => levels.filter((item) => item.tier === tier));
  return groups.flatMap((group) => [...group].sort((a, b) => (b.randomWin ?? 1) - (a.randomWin ?? 1)));
};
const main = ordered(plan.map((entry) => need(level(entry.seed, entry), entry.seed)));
const control = main.map((item) => need(level(`control-${item.seed}`, { tier: item.tier, kind: "control", arrows: item.arrows }), `control-${item.seed}`));
await writeFile(new URL("../levels.json", import.meta.url), `${JSON.stringify({ main, control })}\n`);
console.log(main.map((item) => `${item.tier}:${item.arrows}/${Math.round(item.randomWin * 100)}%`).join(" "));
