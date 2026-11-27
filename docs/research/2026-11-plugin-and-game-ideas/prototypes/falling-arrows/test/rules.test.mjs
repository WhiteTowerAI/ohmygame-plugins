// Run with: node --test docs/research/2026-11-plugin-and-game-ideas/prototypes/falling-arrows/test/*.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { construct, level } from "../src/generator.js";
import { canLeave, isSolved, take } from "../src/rules.js";
import { analyse, findSolution, greedyClears, greedyWins, GREEDY, randomWin, solvableWithoutGravity, TOP_DOWN } from "../src/solver.js";
import { random } from "../../spillway-sort/src/generator.js";

// Three columns, two rows:  R . L   (the R and the L face each other)
//                           D . .   (the D under the R can leave)
const FACING = "R.LD..";

describe("the falling rule", () => {
  it("sends an arrow off only along a clear path", () => {
    assert.equal(canLeave(FACING, 3, 2, 0, 0), false);
    assert.equal(canLeave(FACING, 3, 2, 2, 0), false);
    assert.equal(canLeave(FACING, 3, 2, 0, 1), true);
    assert.equal(take(FACING, 3, 2, 0, 0), null);
  });

  it("drops the column above a taken arrow by one cell, or leaves a hole without gravity", () => {
    assert.equal(take(FACING, 3, 2, 0, 1, true), "..LR..");
    assert.equal(take(FACING, 3, 2, 0, 1, false), "R.L...");
  });

  it("is solved when no arrow is left", () => {
    assert.equal(isSolved("......"), true);
    assert.equal(isSolved("..L..."), false);
  });
});

describe("the solver", () => {
  it("knows facing arrows deadlock without gravity, and gravity can break it", () => {
    assert.equal(solvableWithoutGravity(FACING, 3, 2), false);
    const map = analyse(FACING, 3, 2);
    assert.equal(map.solvable, true);
    assert.deepEqual(findSolution(FACING, 3, 2), [{ x: 0, y: 1 }, { x: 2, y: 0 }, { x: 0, y: 1 }]);
    assert.equal(map.hint(FACING).board, "..LR..");
  });

  it("measures how often random taps solve a board", () => {
    // Only one first move, and every order after it works.
    assert.equal(randomWin(FACING, 3, 2, { rollouts: 50 }), 1);
    assert.equal(randomWin("RL", 2, 1, { rollouts: 10 }), 0);
  });
});

describe("boards built backwards", () => {
  it("can always be solved with gravity", () => {
    for (let i = 0; i < 40; i += 1) {
      const cells = construct(5, 7, 16, random(`built-${i}`), true);
      assert.ok(findSolution(cells, 5, 7), cells);
    }
  });

  it("built without gravity can always be solved without it", () => {
    for (let i = 0; i < 40; i += 1) assert.equal(solvableWithoutGravity(construct(5, 7, 16, random(`plain-${i}`), false), 5, 7), true);
  });
});

describe("greedy players", () => {
  it("take the first free arrow in their order", () => {
    // One column, ↓ above ↑: each blocks the other, so no order clears it.
    assert.equal(greedyClears("D" + "U" + ".", 1, 3, GREEDY["top first"]), false);
    // Two left arrows side by side: only the leftmost can leave first; any order clears it.
    for (const name of Object.keys(GREEDY)) assert.equal(greedyClears("LL", 2, 1, GREEDY[name]), true, name);
  });
});

describe("levels", () => {
  it("are the same for the same seed, and fit their kind", () => {
    const rescued = level("check", { tier: "main", kind: "rescued" });
    assert.deepEqual(level("check", { tier: "main", kind: "rescued" }), rescued);
    assert.equal(solvableWithoutGravity(rescued.board, rescued.width, rescued.height), false);
    assert.ok(findSolution(rescued.board, rescued.width, rescued.height));
    const plain = level("check", { tier: "tutorial", kind: "plain" });
    assert.equal(solvableWithoutGravity(plain.board, plain.width, plain.height), true);
    assert.ok(findSolution(plain.board, plain.width, plain.height));
    const control = level("check", { tier: "main", kind: "control" });
    assert.equal(solvableWithoutGravity(control.board, control.width, control.height), true);
  });

  it("in levels.json can be cleared as they are played, no top-down habit clears a gravity level, and each control matches its level", async () => {
    const pack = JSON.parse(await readFile(new URL("../levels.json", import.meta.url), "utf8"));
    assert.equal(pack.main.length, pack.control.length);
    assert.equal(pack.daily.main.length, pack.daily.control.length);
    [...pack.main.map((item, i) => [item, pack.control[i]]), ...pack.daily.main.map((item, i) => [item, pack.daily.control[i]])].forEach(([item, matched]) => {
      if (item.kind === "rescued") assert.deepEqual(greedyWins(item.board, item.width, item.height, TOP_DOWN), [], item.seed);
      assert.ok(findSolution(item.board, item.width, item.height), item.seed);
      assert.equal(solvableWithoutGravity(item.board, item.width, item.height), item.kind === "plain", item.seed);
      assert.equal(solvableWithoutGravity(matched.board, matched.width, matched.height), true, matched.seed);
      assert.deepEqual([matched.width, matched.height, matched.board.replace(/\./g, "").length], [item.width, item.height, item.arrows], matched.seed);
    });
  });
});
