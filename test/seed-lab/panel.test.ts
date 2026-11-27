// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The panel's helpers are plain JavaScript.
import { barHeights, fixPrompt, hasProblems, rangeLabel, readForm, setupPrompt } from "../../plugins/seed-lab/panel/format.js";
import { summarize, type SeedResult } from "../../plugins/seed-lab/src/stats.ts";

const sampleRun = (results: SeedResult[] = [
  { seed: 0, solvable: true, metrics: { moves: 3 } },
  { seed: 1, solvable: true, metrics: { moves: 5 } },
  { seed: 2, solvable: false, metrics: { moves: 0 } },
  { seed: 3, error: "TypeError: boom" },
]) => ({ version: 1, id: "r", at: "2026-11-27T10:00:00.000Z", entry: "sim/index.ts", from: 0, count: results.length, seconds: 1.25, threads: 2, timeoutMs: 5000, file: "/data/r.jsonl", summary: summarize(results) });

describe("the Seed lab page's helpers", () => {
  it("reads the form, with defaults for empty fields and the field that's wrong", () => {
    expect(readForm({ entry: "", from: "", count: "", timeoutMs: "", difficulty: "", params: "" })).toEqual({ input: {} });
    expect(readForm({ entry: " sim/levels.ts ", from: "10", count: "2000", difficulty: "moves", params: '{"size": 7}' })).toEqual({ input: { entry: "sim/levels.ts", from: 10, count: 2000, difficulty: "moves", params: { size: 7 } } });
    expect(readForm({ count: "0" })).toEqual({ error: "count" });
    expect(readForm({ count: "100001" })).toEqual({ error: "count" });
    expect(readForm({ from: "-1" })).toEqual({ error: "from" });
    expect(readForm({ timeoutMs: "50" })).toEqual({ error: "timeoutMs" });
    expect(readForm({ params: "[1]" })).toEqual({ error: "params" });
    expect(readForm({ params: "{size" })).toEqual({ error: "params" });
  });

  it("draws bars against the tallest, never hiding a bin with seeds in it", () => {
    expect(barHeights([{ count: 0 }, { count: 1 }, { count: 1000 }])).toEqual([0, 0.02, 1]);
    expect(barHeights([{ count: 0 }])).toEqual([0]);
    expect(rangeLabel({ from: 3, to: 3 }, "en")).toBe("3");
    expect(rangeLabel({ from: 1.5, to: 2.25 }, "en")).toBe("1.5–2.25");
  });

  it("asks the AI about the seeds a run lists, and to set up a module", () => {
    const run = sampleRun();
    expect(hasProblems(run.summary)).toBe(true);
    const prompt = fixPrompt(run);
    expect(prompt).toContain("2 of 4 solvable (66.7% of those that answered)");
    expect(prompt).toContain("Unsolvable (1): 2.");
    expect(prompt).toContain("seed 3: TypeError: boom");
    expect(prompt).toContain("run seedlab_run again on the same range");
    expect(setupPrompt("sim/levels.ts")).toContain("into sim/levels.ts exporting generate(seed, params)");
    expect(hasProblems(sampleRun([{ seed: 0, solvable: true, metrics: {} }]).summary)).toBe(false);
  });
});

type Listener = (value: unknown) => void;
const bridge = vi.hoisted(() => ({
  last: null as unknown,
  ran: null as unknown,
  runError: undefined as string | undefined,
  storage: undefined as unknown,
  requests: [] as [string, unknown][],
  listeners: new Map<string, Listener>(),
  release: undefined as undefined | (() => void),
}));
vi.mock("../plugin-ui.ts", () => ({
  connect: async () => ({
    locale: "en",
    on: (event: string, listener: Listener) => bridge.listeners.set(event, listener),
    request: async (name: string, value: { command?: string; input?: unknown }) => {
      bridge.requests.push([name === "command.run" ? value.command! : name, value]);
      if (name === "storage.get") return structuredClone(bridge.storage);
      if (name === "command.run" && value.command === "last") return structuredClone(bridge.last);
      if (name === "command.run" && value.command === "run") {
        await new Promise<void>((resolve) => (bridge.release = resolve));
        if (bridge.runError) throw new Error(bridge.runError);
        return structuredClone(bridge.ran);
      }
      return null;
    },
  }),
}));

async function show() {
  document.body.innerHTML = '<omg-page id="lab"></omg-page><div id="tooltip" hidden></div>';
  vi.resetModules();
  // @ts-expect-error The panel's page is plain JavaScript.
  await import("../../plugins/seed-lab/panel/main.js");
  const root = document.getElementById("lab")!;
  await vi.waitFor(() => expect(root.querySelector(".toolbar")).not.toBeNull());
  return root;
}
const button = (root: Element, label: string) => [...root.querySelectorAll("omg-button")].find((item) => item.textContent === label) as HTMLElement | undefined;
const type = (root: Element, field: string, value: string) => {
  const input = root.querySelector(`[data-field="${field}"]`) as HTMLElement & { value: string };
  input.value = value;
  input.dispatchEvent(new Event("input"));
};

beforeEach(() => {
  bridge.last = null;
  bridge.ran = sampleRun();
  bridge.runError = undefined;
  bridge.storage = undefined;
  bridge.requests = [];
  bridge.listeners.clear();
  bridge.release = undefined;
});

describe("the Seed lab panel page", () => {
  it("shows the form and an empty state before any run", async () => {
    const root = await show();
    expect(root.querySelector("omg-empty")?.getAttribute("heading")).toBe("No runs yet");
    expect((root.querySelector('[data-field="entry"]') as HTMLElement & { value: string }).getAttribute("value")).toBe("sim/index.ts");
  });

  it("runs with the form's input, shows progress, then the results", async () => {
    const root = await show();
    type(root, "count", "4");
    type(root, "params", '{"size": 5}');
    button(root, "Run seeds")!.click();
    await vi.waitFor(() => expect(bridge.release).toBeDefined());
    expect(bridge.requests.find(([name]) => name === "run")![1]).toMatchObject({ input: { count: 4, params: { size: 5 } } });
    bridge.listeners.get("progress")!({ command: "run", message: "2 of 4 seeds" });
    expect(root.querySelector("omg-status")?.textContent).toBe("2 of 4 seeds");
    bridge.release!();
    await vi.waitFor(() => expect(root.querySelector(".tiles")).not.toBeNull());
    const tiles = [...root.querySelectorAll(".tile")].map((tile) => [tile.querySelector(".tile-label")!.textContent, tile.querySelector(".tile-value")!.textContent]);
    expect(tiles).toEqual([["Solvable", "66.7%"], ["Seeds", "4"], ["Unsolvable", "1"], ["Errors", "1"], ["Timed out", "0"]]);
    // One chart per metric, one bar per bin, each named for screen readers.
    const bars = [...root.querySelectorAll('[data-metric="moves"] .slot')].map((slot) => slot.getAttribute("aria-label"));
    expect(bars).toEqual(["3: 1 seed", "4: 0 seeds", "5: 1 seed"]);
    // The form is remembered for next time.
    expect(bridge.requests.find(([name]) => name === "storage.set")![1]).toMatchObject({ key: "form", value: { count: "4" } });
  });

  it("refuses a bad form without running", async () => {
    const root = await show();
    type(root, "params", "[1]");
    button(root, "Run seeds")!.click();
    await vi.waitFor(() => expect(root.querySelector("omg-banner")?.textContent).toContain("Params must be a JSON object"));
    expect(bridge.requests.map(([name]) => name)).not.toContain("run");
  });

  it("offers to have the AI set up a module when there isn't one, and to look at a run's problems", async () => {
    bridge.runError = "There is no sim/index.ts in this project. The seed-lab skill explains how to split the level generator and solver into one.";
    const root = await show();
    button(root, "Run seeds")!.click();
    await vi.waitFor(() => expect(bridge.release).toBeDefined());
    bridge.release!();
    await vi.waitFor(() => expect(button(root, "Ask the AI to set it up")).toBeDefined());
    button(root, "Ask the AI to set it up")!.click();
    await vi.waitFor(() => expect(bridge.requests.at(-1)![0]).toBe("composer.fill"));
    expect((bridge.requests.at(-1)![1] as { text: string }).text).toContain("following the seed-lab skill");

    bridge.last = sampleRun();
    const again = await show();
    button(again, "Ask the AI to look at these seeds")!.click();
    await vi.waitFor(() => expect(bridge.requests.at(-1)![0]).toBe("composer.fill"));
    expect((bridge.requests.at(-1)![1] as { text: string }).text).toContain("Unsolvable (1): 2.");
  });

  it("shows the last run when it opens, and says when a run has no metrics", async () => {
    bridge.last = sampleRun([{ seed: 0, solvable: true, metrics: {} }]);
    const root = await show();
    expect(root.textContent).toContain("sim/index.ts, seeds 0–0");
    expect(root.textContent).toContain("The module reports no metrics");
    expect(root.textContent).toContain("Nothing unsolvable, failing, slow or far out.");
  });
});

describe("the Seed lab page's metrics", () => {
  it("charts measures with their numbers in words, and lists yes/no metrics as a share", async () => {
    bridge.last = sampleRun([
      { seed: 0, solvable: true, metrics: { moves: 3, rescued: 1 } },
      { seed: 1, solvable: true, metrics: { moves: 5, rescued: 0 } },
    ]);
    const root = await show();
    expect(root.querySelector('[data-metric="rescued"]')).toBeNull();
    expect(root.querySelector('[data-flag="rescued"]')?.textContent).toBe("50% of solvable seeds (1 of 2)");
    expect(root.querySelector('[data-metric="moves"] .spread')?.textContent).toBe("Median 3 · middle 80% 3–5 · all 3–5 · mean 4");
  });
});
