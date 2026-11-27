import { describe, expect, it } from "vitest";
import { jamKey, shouldRemind, timeLeft } from "../../plugins/ship-ladder/src/jam.ts";
import { emptyState, gameTestVerdict, isGameTestTool, judge, standing } from "../../plugins/ship-ladder/src/ladder.ts";
import { readShip, writeShip } from "../../plugins/ship-ladder/src/ship.ts";

// Game Tests' first line, as its runSummary writes it.
const run = (text: string, extra: { status?: string; truncated?: boolean } = {}) => gameTestVerdict({ status: "succeeded", text, ...extra });

describe("reading Game Tests' results", () => {
  it("passes only when every test passed", () => {
    expect(run("3 of 3 game tests passed.\npassed a.json \"A\" at 390x844")).toEqual({ verdict: "passed", detail: "3 of 3 game tests passed" });
  });

  it("fails with the first failure", () => {
    expect(run('2 of 3 game tests passed.\npassed a.json "A" at 390x844\nFAILED b.json "B" at 390x844: step 2: element play isn\'t visible')).toEqual({
      verdict: "failed",
      detail: 'b.json "B" at 390x844: step 2: element play isn\'t visible',
    });
  });

  it("reads the verdict line of a long report that was cut off at its end", () => {
    expect(run('40 of 40 game tests passed.\npassed a.json "A" at 390x844\npassed b.json', { truncated: true }).verdict).toBe("passed");
    expect(run("39 of 40 game tests passed.\npassed a.json", { truncated: true })).toEqual({ verdict: "failed", detail: "1 of 40 game tests failed" });
  });

  it("can't tell from a cut-off, failed, cancelled, empty or unfamiliar answer", () => {
    const unknown = [
      run("3 of 3 game tests pass", { truncated: true }),
      run("3 of 3 game tests passed.", { status: "failed" }),
      run("Cancelled: 1 of 3 game tests passed."),
      run("0 of 0 game tests passed."),
      run("This project has no game tests yet. The game-tests skill says what to test and how to write them in tests/game/."),
      run("All 3 tests are green"),
    ];
    for (const result of unknown) expect(result.verdict).toBe("unknown");
  });

  it("recognizes Game Tests' tool however an agent names it", () => {
    for (const name of ["game_test", "mcp__ohmygame__game_test", "ohmygame.game_test"]) expect(isGameTestTool(name)).toBe(true);
    for (const name of ["my_game_test", "game_tests", "game_use"]) expect(isGameTestTool(name)).toBe(false);
  });
});

describe("the ladder", () => {
  it("keeps each rung's latest judgement and when it first passed", () => {
    let state = judge(emptyState(), "starts", { verdict: "failed", source: "check", at: "2026-11-27T01:00:00Z" });
    state = judge(state, "starts", { verdict: "passed", source: "game-tests", at: "2026-11-27T02:00:00Z" });
    state = judge(state, "starts", { verdict: "failed", source: "game-tests", at: "2026-11-27T03:00:00Z" });
    expect(state.firstPassed).toEqual({ starts: "2026-11-27T02:00:00Z" });
    expect(standing(state).map((rung) => [rung.rung, rung.verdict])).toEqual([["starts", "failed"], ["core", "open"], ["loop", "open"]]);
  });
});

describe("the jam reminder", () => {
  const jam = { deadline: "2026-12-07T15:00:00.000Z" };
  it("reminds once, within the last day", () => {
    expect(shouldRemind(jam, [], new Date("2026-12-06T14:59:00Z"))).toBe(false);
    expect(shouldRemind(jam, [], new Date("2026-12-06T15:00:00Z"))).toBe(true);
    expect(shouldRemind(jam, [jamKey(jam)], new Date("2026-12-07T10:00:00Z"))).toBe(false);
    expect(shouldRemind(jam, [], new Date("2026-12-07T15:00:01Z"))).toBe(false);
    expect(shouldRemind(undefined, [], new Date())).toBe(false);
  });

  it("reminds again for a new deadline", () => {
    const moved = { deadline: "2026-12-08T15:00:00+00:00" };
    expect(shouldRemind(moved, [jamKey(jam)], new Date("2026-12-08T01:00:00Z"))).toBe(true);
  });

  it("counts down", () => {
    expect(timeLeft(jam.deadline, new Date("2026-12-05T13:30:00Z"))).toEqual({ days: 2, hours: 1, minutes: 30, over: false });
    expect(timeLeft(jam.deadline, new Date("2026-12-08T00:00:00Z")).over).toBe(true);
  });
});

describe("design/ship.json", () => {
  it("reads what a plan has and says what's wrong", () => {
    const { plan, problems } = readShip(
      JSON.stringify({ shipDate: "2026-12-11", platforms: ["itch.io", "", 3], core: " Draw one wall per wave ", notDoing: ["online play"], jam: { deadline: "soon" }, coreProbe: { actions: [] } }),
    );
    expect(plan).toEqual({ shipDate: "2026-12-11", platforms: ["itch.io"], core: "Draw one wall per wave", notDoing: ["online play"] });
    expect(problems).toEqual([
      "jam.deadline should be a date and time, such as 2026-12-07T23:00:00+08:00",
      "coreProbe needs actions (game_use actions) and state (a path in the game's snapshot)",
    ]);
    expect(readShip("{").problems[0]).toMatch(/isn't valid JSON/);
    expect(readShip(undefined)).toEqual({ problems: [] });
    expect(readShip(JSON.stringify({ shipDate: "Friday" })).problems).toEqual(["shipDate should be a date written YYYY-MM-DD"]);
  });

  it("writes a plan in a stable order", () => {
    const text = writeShip({ platforms: ["itch.io"], notDoing: [], core: "Sort the water", shipDate: "2026-12-11" });
    expect(Object.keys(JSON.parse(text))).toEqual(["$schema", "shipDate", "platforms", "core", "notDoing"]);
    expect(readShip(text).plan).toEqual({ shipDate: "2026-12-11", platforms: ["itch.io"], core: "Sort the water", notDoing: [] });
  });
});
