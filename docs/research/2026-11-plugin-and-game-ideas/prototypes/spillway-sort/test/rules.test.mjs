// Run with: node --test docs/research/2026-11-plugin-and-game-ideas/prototypes/spillway-sort/test/
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { level, random } from "../src/generator.js";
import { isSolved, pour } from "../src/rules.js";
import { analyse } from "../src/solver.js";

const sample = JSON.parse(await readFile(new URL("./python-sample.json", import.meta.url), "utf8"));
const pipesOf = (pipes) => Object.fromEntries(Object.entries(pipes).map(([from, to]) => [Number(from), to]));

describe("the overflow rule", () => {
  const pipes = { 1: 2, 2: 3 };
  it("pours as water sort into a bottle without a pipe", () => {
    assert.deepEqual(pour(["ab", "", "", ""], 0, 1, 4, {}, "O1").state, ["a", "b", "", ""]);
    assert.equal(pour(["ab", "a", "", ""], 0, 1, 4, {}, "O1"), null);
  });

  it("pours the whole run into a bottle with a pipe, and the excess flows on whatever the colour", () => {
    // Bottle 1 is full of b; pouring two b on top sends two b through its pipe onto bottle 2's a.
    const poured = pour(["cbb", "abbb", "ca", ""], 0, 1, 4, pipes, "O1");
    assert.deepEqual(poured.state, ["c", "abbb", "cabb", ""]);
    assert.deepEqual(poured.path, [1, 2]);
    assert.equal(poured.overflow, true);
  });

  it("chains through several pipes, and refuses when the water would reach a full bottle with no pipe", () => {
    const chained = pour(["dd", "dddd", "aaaa", "b"], 0, 1, 4, pipes, "O1");
    assert.deepEqual(chained.state, ["", "dddd", "aaaa", "bdd"]);
    assert.deepEqual(chained.path, [1, 2, 3]);
    assert.equal(pour(["dd", "dddd", "aaaa", "bbbb"], 0, 1, 4, pipes, "O1"), null);
  });

  it("refuses a pour that would leave every bottle as it was", () => {
    // Bottle 1 is full of b and its pipe runs back to bottle 0: pouring b from 0 sends it straight back.
    assert.equal(pour(["ab", "bbbb", ""], 0, 1, 4, { 1: 0 }, "O1"), null);
  });

  it("ignores pipes in the control version", () => {
    assert.equal(pour(["cbb", "abbb", "ca", ""], 0, 1, 4, pipes, "classic"), null);
  });

  it("never pours from a finished bottle", () => {
    assert.equal(pour(["aaaa", "", "", ""], 0, 1, 4, {}, "O1"), null);
    assert.equal(isSolved(["aaaa", "", "bbbb"], 4), true);
    assert.equal(isSolved(["aaab", "", "bbba"], 4), false);
  });
});

describe("the solver against the Python experiment", () => {
  for (const record of sample) {
    it(`${record.tier} #${record.i} gives the same answers`, () => {
      for (const rule of ["classic", "O1"]) {
        const expected = record.res[rule];
        const actual = analyse(record.deal, 4, pipesOf(record.pipes), rule);
        assert.equal(actual.states, expected.states, `${rule} states`);
        assert.equal(actual.solvable, expected.solvable, `${rule} solvable`);
        if (expected.solvable) assert.equal(actual.optimal, expected.opt, `${rule} shortest solution`);
        assert.ok(Math.abs(actual.deadRatio - expected.dead_ratio) < 1e-9, `${rule} dead ends`);
        // Every shortest solution needs the overflow exactly when Python found none without it.
        if (rule === "O1" && expected.solvable) assert.equal(actual.needsOverflow, expected.opt_no_overflow_frac === 0, "needs the overflow");
      }
    });
  }
});

describe("levels", () => {
  it("are the same for the same seed", () => {
    assert.deepEqual(level("day-2026-11-27"), level("day-2026-11-27"));
    const next = random("x");
    assert.ok(next() >= 0 && next() < 1);
  });

  it("rescued levels can't be solved without the overflow, and can with it", () => {
    for (const seed of ["a", "b", "c"]) {
      const found = level(seed, { tier: "rescued", kind: "rescued" });
      assert.ok(found, seed);
      assert.equal(analyse(found.bottles, 4, found.pipes, "classic").solvable, false);
      const withOverflow = analyse(found.bottles, 4, found.pipes, "O1");
      assert.equal(withOverflow.solvable, true);
      assert.equal(withOverflow.needsOverflow, true);
      assert.equal(withOverflow.optimal, found.optimal);
    }
  });

  it("tutorials with pipes, and control levels, are solvable as they are played", async () => {
    const pack = JSON.parse(await readFile(new URL("../levels.json", import.meta.url), "utf8"));
    for (const item of pack.main) {
      const played = analyse(item.bottles, 4, item.pipes, "O1", { cap: 1_000_000 });
      assert.equal(played.solvable, true, item.seed);
      assert.equal(played.optimal, item.optimal, item.seed);
    }
    for (const item of pack.main.filter((level) => level.kind === "rescued")) assert.equal(analyse(item.bottles, 4, item.pipes, "classic").solvable, false, `${item.seed} can't be solved without the overflow`);
    for (const item of pack.control) {
      assert.deepEqual(item.pipes, {});
      assert.equal(analyse(item.bottles, 4, {}, "classic").optimal, item.optimal, item.seed);
    }
  });

  it("classic levels can be solved without it", () => {
    const found = level("t", { tier: "tutorial", kind: "classic" });
    assert.equal(analyse(found.bottles, 4, found.pipes, "classic").solvable, true);
  });

  it("a hint is a pour on a shortest path", () => {
    const found = level("h", { tier: "rescued", kind: "rescued" });
    const solved = analyse(found.bottles, 4, found.pipes, "O1");
    let state = found.bottles;
    for (let step = 0; step < found.optimal; step += 1) {
      const { from, to } = solved.hint(state);
      state = pour(state, from, to, 4, found.pipes, "O1").state;
    }
    assert.equal(isSolved(state, 4), true);
  });
});
