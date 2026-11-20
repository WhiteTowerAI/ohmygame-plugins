import { describe, expect, it } from "vitest";
// @ts-expect-error The panel's own module is plain JavaScript.
import { addMorePrompt, fixFailurePrompt, fixUnitPrompt, statusOf, writePrompt } from "../../plugins/game-tests/panel/prompts.js";

describe("the panel's prompts and statuses", () => {
  it("asks for tests in a sentence, leaving the how to the skill", () => {
    expect(writePrompt("en")).toMatch(/^Write game tests for this game in tests\/game\/ as the game-tests skill says, then run them\. /);
    expect(addMorePrompt("en")).toContain("don't guard yet, as the game-tests skill says");
  });

  it("asks for test names in the person's language, then the panel's", () => {
    const names = "Write each test's name in the language the person uses in this conversation, not this request's; when they haven't written in it yet, in";
    expect(writePrompt("zh-CN")).toContain(`${names} Simplified Chinese.`);
    expect(addMorePrompt("en")).toContain(`${names} English.`);
    expect(writePrompt("fr")).toContain(`${names} English.`);
  });

  it("hands the agent where a test failed", () => {
    const viewport = { viewport: { width: 390, height: 844 }, status: "failed", steps: [{ index: 2, setup: true, player: 2, status: "failed", failures: ["state room.players is 1, expected 2"] }] };
    expect(fixFailurePrompt({ file: "deal.json", name: "Deal" }, viewport)).toBe(
      'The game test tests/game/deal.json ("Deal") failed at 390x844, setup step 3 (player 2): state room.players is 1, expected 2. Find out whether the game or the test is wrong and fix that one. Change the test only when it no longer describes how the game should work, and say why. Then run game_test again.',
    );
    expect(fixUnitPrompt({ status: "failed", command: "npm run test", failures: [{ name: "a bomb beats a pair" }] })).toContain("failed (`npm run test`): a bomb beats a pair.");
    expect(fixUnitPrompt({ status: "error", command: "npm run test", error: "Installing failed." })).toBe("The project's unit tests couldn't run (`npm run test`): Installing failed. Fix that, then run them again.");
  });

  it("says which test a run is on and which wait", () => {
    const run = { status: "running", files: ["a.json", "b.json", "c.json"], scenarios: [{ file: "a.json", status: "passed" }, { file: "b.json", status: "passed" }] };
    expect(statusOf({ file: "a.json" }, run).status).toBe("passed");
    expect(statusOf({ file: "b.json" }, run).status).toBe("running");
    expect(statusOf({ file: "c.json" }, run).status).toBe("waiting");
    expect(statusOf({ file: "d.json" }, undefined).status).toBe("none");
  });
});
