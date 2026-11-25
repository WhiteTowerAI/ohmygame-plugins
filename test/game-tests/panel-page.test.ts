// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The panel's page against a stand-in for the app's bridge: what it shows
// for the state its native side gives, and what it asks the app for.

type Listener = (value: unknown) => void;
const bridge = vi.hoisted(() => ({
  state: undefined as unknown,
  detail: undefined as unknown,
  requests: [] as [string, unknown][],
  listeners: new Map<string, Listener>(),
}));
vi.mock("./plugin-ui.ts", () => ({
  connect: async () => ({
    locale: "en",
    on: (event: string, listener: Listener) => bridge.listeners.set(event, listener),
    request: async (name: string, value: { command?: string; input?: unknown }) => {
      bridge.requests.push([name === "command.run" ? value.command! : name, name === "command.run" ? value.input : value]);
      if (name === "command.run" && value.command === "state") return structuredClone(bridge.state);
      if (name === "command.run" && value.command === "capture") return { mediaType: "image/jpeg", data: btoa("frame") };
      if (name === "command.run" && value.command === "detail") return structuredClone(bridge.detail);
      return null;
    },
  }),
}));

const failedRun = {
  id: "run-1", status: "failed", source: "agent", startedAt: "2026-11-18T08:00:00.000Z", finishedAt: "2026-11-18T08:00:05.000Z",
  files: ["score.json"],
  scenarios: [{
    file: "score.json", name: "Score", status: "failed",
    viewports: [{ viewport: { width: 390, height: 844 }, status: "failed", steps: [{ index: 0, status: "failed", failures: ["state score is 0, expected 10"], captureId: "frame-1", durationMs: 5 }], logs: [{ level: "error", message: "Uncaught TypeError", timestamp: "" }] }],
  }],
};

async function show(state: unknown) {
  bridge.state = state;
  document.body.innerHTML = '<omg-page id="tests"></omg-page>';
  vi.resetModules();
  // @ts-expect-error The panel's page is plain JavaScript.
  await import("../../plugins/game-tests/panel/main.js");
  await vi.waitFor(() => expect(bridge.requests.some(([name]) => name === "state")).toBe(true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return document.getElementById("tests")!;
}
const click = (root: Element, label: string) =>
  ([...root.querySelectorAll("omg-button")].find((item) => item.textContent === label || item.getAttribute("aria-label") === label) as HTMLElement).click();

beforeEach(() => {
  bridge.requests = [];
  bridge.listeners.clear();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:frame");
});
afterEach(() => vi.useRealTimers());

describe("the Automated tests panel page", () => {
  it("offers to have tests written when there are none", async () => {
    const root = await show({ game: { files: [] }, unit: {} });
    expect(root.textContent).toContain("Ask the AI to write tests");
    expect(root.textContent).toContain("This project has none yet.");
    click(root, "Ask the AI to write tests");
    expect(bridge.requests.at(-1)).toEqual(["composer.fill", {
      text: "Write game tests for this game in tests/game/ as the game-tests skill says, then run them. Write each test's name in the language the person uses in this conversation, not this request's; when they haven't written in it yet, in English.",
    }]);
  });

  it("shows where a test failed, with its frame, and runs one", async () => {
    const root = await show({
      game: { files: [{ file: "score.json", name: "Score", steps: 1, viewports: [{ width: 390, height: 844 }] }, { file: "broken.json", error: "It isn't valid JSON" }], run: failedRun },
      unit: { script: { command: "npm run test", script: "vitest run" }, run: { id: "u", status: "failed", startedAt: "", command: "npm run test", exitCode: 1, passed: 3, failed: 1, failures: [{ name: "a bomb beats a pair", message: "1 == 2" }], output: "…" } },
    });
    expect(root.textContent).toContain("0 passed, 1 failed");
    // Each row says in a line why it failed; its frame and console wait in its details.
    const problems = [...root.querySelectorAll(".test-problem")].map((item) => item.textContent);
    expect(problems).toEqual(["Step 1 failed: state score is 0, expected 10", "It isn't valid JSON"]);
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("3 passed, 1 failed");
    expect(root.textContent).toContain("a bomb beats a pair");
    const toggles = root.querySelectorAll<HTMLButtonElement>("button.test-toggle");
    toggles[0]!.click();
    toggles[1]!.click();
    expect(root.textContent).toContain("At 390×844, step 1 failed");
    expect(root.textContent).toContain("broken.json can't be run");
    await vi.waitFor(() => expect(root.querySelector("img")?.getAttribute("src")).toBe("blob:frame"));
    expect(bridge.requests).toContainEqual(["capture", { runId: "run-1", captureId: "frame-1" }]);
    // Running all, and running the unit tests, are icons beside their sections' headings.
    expect([...root.querySelectorAll('[slot="actions"] omg-button')].map((item) => [item.getAttribute("aria-label"), item.textContent])).toEqual([
      ["Run all", "▶"],
      ["Run unit tests", "▶"],
    ]);
    click(root, "Run Score");
    expect(bridge.requests).toContainEqual(["run", { files: ["score.json"] }]);
    // Conditions that don't hold leave nothing behind, not the word null.
    expect(root.textContent).not.toMatch(/null|undefined/);
  });

  it("lists each unit test by file, failures first, and not the command it runs", async () => {
    const tests = [
      { name: "bomb beats pair", file: "rules.test.ts", status: "passed", durationMs: 1.4 },
      { name: "cannot pass first", groups: ["turns"], file: "rules.test.ts", status: "failed", durationMs: 2, message: "boom" },
      { name: "later", groups: ["turns"], file: "rules.test.ts", status: "skipped" },
    ];
    const root = await show({
      game: { files: [] },
      unit: { script: { command: "npm run test", script: "vitest run" }, run: { id: "u", status: "failed", startedAt: "", command: "npm run test", exitCode: 1, passed: 1, failed: 1, failures: [{ name: "rules.test.ts > turns > cannot pass first", message: "boom" }], tests, output: "…" } },
    });
    expect(root.textContent).not.toContain("npm run test");
    const unitSection = root.querySelectorAll("omg-section")[1]!;
    // Folded at first: only the failure shows, under a summary that opens the rest.
    const toggle = unitSection.querySelector<HTMLButtonElement>("button.summary-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("1 passed, 1 failed. Show each test");
    expect([...unitSection.querySelectorAll(".test-line")].map((line) => line.getAttribute("title"))).toEqual(["turns › cannot pass first"]);
    toggle.click();
    // Open: one list under its file, the failure first, then the runner's order.
    expect(root.querySelector(".file-heading")?.textContent).toBe("rules.test.ts");
    const lines = [...root.querySelectorAll("omg-section")[1]!.querySelectorAll(".test-line")];
    expect(lines.map((line) => line.getAttribute("title"))).toEqual(["turns › cannot pass first", "bomb beats pair", "turns › later"]);
    expect(lines[0]!.textContent).toBe("Failedturns › cannot pass firstboom2 ms");
    // Its output waits behind a link, beside the request to fix it.
    expect(root.querySelector("pre.log")).toBeNull();
    expect([...root.querySelectorAll("omg-section")[1]!.querySelectorAll("button.link")].map((item) => item.textContent)).toEqual(["Ask the AI to fix it", "Show output"]);
    expect(root.textContent).not.toContain("a bomb beats a pair");
  });

  it("shows the start of a long list of unit tests, and all of them when asked", async () => {
    const tests = Array.from({ length: 25 }, (_, index) => ({ name: `rule ${index + 1}`, status: "passed" }));
    const root = await show({ game: { files: [] }, unit: { script: { command: "npm run test", script: "node --test" }, run: { id: "u", status: "passed", startedAt: "", command: "npm run test", exitCode: 0, passed: 25, failed: 0, tests, output: "" } } });
    // All passed, so the list is folded away until asked for.
    expect(root.querySelectorAll(".test-line")).toHaveLength(0);
    root.querySelector<HTMLButtonElement>("button.summary-toggle")!.click();
    expect(root.querySelectorAll(".test-line")).toHaveLength(20);
    root.querySelector<HTMLButtonElement>("button.link")!.click();
    expect(root.querySelectorAll(".test-line")).toHaveLength(25);
    expect(root.querySelector("button.link")?.textContent).toBe("Show fewer");
  });

  it("shows nothing stray before anything has run", async () => {
    const root = await show({ game: { files: [{ file: "score.json", name: "Score", steps: 5, players: 2, viewports: [{ width: 1280, height: 720 }] }] }, unit: { script: { command: "npm run test", script: "vitest run" } } });
    expect(root.textContent).not.toMatch(/null|undefined/);
    // A test that hasn't failed stays one line: its name, and what it is beside it.
    expect(root.querySelector(".test-problem")).toBeNull();
    expect(root.querySelector(".test-aside")?.textContent).toBe("5 steps · 2 players");
  });

  it("opens a test's details: its file, setup and steps in words, and where the last run stopped", async () => {
    const name = "A played card leaves the hand and tops the pile for both players";
    bridge.detail = {
      schemaVersion: 1, name, players: 2, setup: "two-players",
      setupSteps: [{ player: 1, action: { type: "click", target: { testId: "create-room" } }, remember: { room: "room.code" } }],
      steps: [
        { player: 1, action: { type: "click", target: { testId: "card-{{card}}" } }, expect: { state: { "pile.top": "{{card}}", hand: { excludes: "{{card}}" } } } },
        { together: [{ player: 1, actions: [{ type: "press", key: "ArrowRight", duration: 500 }] }, { player: 2, actions: [{ type: "offline" }] }] },
      ],
    };
    const run = { ...failedRun, files: ["play.json"], scenarios: [{ file: "play.json", name, status: "failed", viewports: [{ viewport: { width: 1280, height: 720 }, status: "failed", steps: [{ index: 0, setup: true, status: "passed", durationMs: 1 }, { index: 0, status: "failed", failures: ["x"], durationMs: 1 }] }] }] };
    const root = await show({ game: { files: [{ file: "play.json", name, steps: 3, viewports: [{ width: 1280, height: 720 }] }], run }, unit: {} });
    const toggle = root.querySelector<HTMLButtonElement>("button.test-toggle")!;
    expect(toggle.getAttribute("title")).toBe(name);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    toggle.click();
    await vi.waitFor(() => expect(root.querySelector(".details .steps")).not.toBeNull());
    expect(bridge.requests).toContainEqual(["detail", { file: "play.json" }]);
    const details = root.querySelector(".details")!.textContent;
    expect(details).toContain("tests/game/play.json");
    expect(details).toContain("tests/game/setup/two-players.json");
    expect(details).toContain("1280×720");
    expect(details).toContain("Player 1: Click testId “create-room”");
    expect(details).toContain("Remember room.code as {{room}}");
    expect(details).toContain("State pile.top is “{{card}}”");
    expect(details).toContain("State hand doesn't contain “{{card}}”");
    expect(details).toContain("Players 1, 2 together: Player 1: Hold ArrowRight for 500 ms · Player 2: Go off line");
    expect(root.querySelectorAll(".step.is-passed")).toHaveLength(1);
    expect(root.querySelector(".step.is-failed")?.textContent).toContain("card-{{card}}");
    root.querySelector<HTMLButtonElement>("button.test-toggle")!.click();
    expect(root.querySelector(".details")).toBeNull();
  });

  it("follows a run while it goes", async () => {
    const running = { ...failedRun, status: "running", finishedAt: undefined, scenarios: [] };
    const root = await show({ game: { files: [{ file: "score.json", name: "Score", steps: 1 }], run: running }, unit: {} });
    expect(root.textContent).toContain("Running 1 of 1…");
    click(root, "Stop");
    expect(bridge.requests.at(-1)).toEqual(["cancel", undefined]);
    const before = bridge.requests.filter(([name]) => name === "state").length;
    await vi.waitFor(() => expect(bridge.requests.filter(([name]) => name === "state").length).toBeGreaterThan(before), { timeout: 3000 });
  });
});
