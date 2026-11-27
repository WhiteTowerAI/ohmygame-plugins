// Day 0 of the validation plan, without players: does gravity matter?
//   node tools/day0.mjs [boards per size]
// For each size, boards built backwards with gravity (so solvable with it):
// how many can't be solved without gravity ("rescued"), how hard they are for
// a random tapper, and how much of their map is a dead end; then the same for
// the hardest of 8 such boards for a random tapper. A second table: how often
// a player sticking to one simple rule (GREEDY) clears the boards gravity
// rescues, which is why shipped levels must also defeat the top-down rules.
import { random } from "../../spillway-sort/src/generator.js";
import { construct, level, TIERS } from "../src/generator.js";
import { analyse, GREEDY, greedyWins, randomWin, solvableWithoutGravity, TOP_DOWN } from "../src/solver.js";

const count = Number(process.argv[2] ?? 300);
const percent = (value) => (Number.isFinite(value) ? `${(100 * value).toFixed(1)}%` : "–");
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);

console.log("| Size | Boards | Arrows (mean) | Unsolvable without gravity | Random tapper wins: all boards | rescued boards | Dead ends (mapped boards) | Chosen levels (hardest of 8 rescued): random tapper wins | dead ends |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [name, { width, height, fill }] of Object.entries(TIERS)) {
  const arrows = [], wins = [], rescuedWins = [], dead = [];
  let rescued = 0;
  for (let i = 0; i < count; i += 1) {
    const cells = construct(width, height, Math.round(width * height * fill), random(`day0-${name}-${i}`), true);
    arrows.push(cells.replace(/\./g, "").length);
    const win = randomWin(cells, width, height, { rollouts: 60, seed: i + 1 });
    wins.push(win);
    if (!solvableWithoutGravity(cells, width, height)) {
      rescued += 1;
      rescuedWins.push(win);
    }
    if (width * height <= 40 && i < 100) {
      const map = analyse(cells, width, height, { rollouts: 1 });
      if (!map.capped) dead.push(map.deadRatio);
    }
  }
  const chosen = Array.from({ length: Math.min(30, count / 10) }, (_, i) => level(`day0-chosen-${name}-${i}`, { tier: name, kind: "rescued" })).filter(Boolean);
  console.log(
    `| ${name} ${width}×${height} | ${count} | ${mean(arrows).toFixed(1)} | ${percent(rescued / count)} | ${percent(mean(wins))} | ${percent(mean(rescuedWins))} | ${percent(mean(dead))} | ${percent(mean(chosen.map((item) => item.randomWin)))} (${chosen.length} levels) | ${percent(mean(chosen.filter((item) => item.deadRatio !== undefined).map((item) => item.deadRatio)))} |`,
  );
}

console.log("\n| Size | Boards that need gravity | " + Object.keys(GREEDY).map((name) => `"${name}" clears`).join(" | ") + " | No top-down rule clears |");
console.log("|---|---|" + Object.keys(GREEDY).map(() => "---|").join("") + "---|");
for (const [name, { width, height, fill }] of Object.entries(TIERS)) {
  if (name === "tutorial") continue;
  const wins = Object.fromEntries(Object.keys(GREEDY).map((rule) => [rule, 0]));
  let boards = 0;
  let beaten = 0;
  for (let i = 0; i < count * 20 && boards < count; i += 1) {
    const cells = construct(width, height, Math.round(width * height * fill), random(`day0-greedy-${name}-${i}`), true);
    if (cells.replace(/\./g, "").length < width * height * fill * 0.85 || solvableWithoutGravity(cells, width, height)) continue;
    boards += 1;
    const cleared = greedyWins(cells, width, height);
    for (const rule of cleared) wins[rule] += 1;
    if (!cleared.some((rule) => TOP_DOWN.includes(rule))) beaten += 1;
  }
  console.log(`| ${name} ${width}×${height} | ${boards} | ${Object.values(wins).map((value) => percent(value / boards)).join(" | ")} | ${beaten} (${percent(beaten / boards)}) |`);
}
