// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The panel's helpers are plain JavaScript.
import { FALLBACK_PROMPT, countdown, daysUntil, dueForFallback, formOf, isoToLocal, localToIso, mergePlan } from "../../plugins/ship-ladder/panel/format.js";

describe("the panel's helpers", () => {
  it("saves the form into the plan, keeping what the form doesn't show", () => {
    const original = JSON.stringify({ shipDate: "2026-12-01", core: "old", coreProbe: { actions: [{ type: "press", key: "Space" }], state: "score" }, custom: 1 });
    const { text } = mergePlan(original, {
      shipDate: "2026-12-11",
      platforms: "itch.io，OhMyGame Community",
      core: " Draw one wall per wave ",
      notDoing: "online play\n\n  level editor ",
      jamDeadline: "",
      jamName: "",
    });
    expect(JSON.parse(text)).toEqual({
      shipDate: "2026-12-11",
      core: "Draw one wall per wave",
      coreProbe: { actions: [{ type: "press", key: "Space" }], state: "score" },
      custom: 1,
      platforms: ["itch.io", "OhMyGame Community"],
      notDoing: ["online play", "level editor"],
    });
  });

  it("refuses a date it can't read, and a file it can't parse", () => {
    expect(mergePlan(undefined, { shipDate: "Friday" })).toEqual({ error: "shipDate" });
    expect(mergePlan(undefined, { jamDeadline: "Sunday night" })).toEqual({ error: "jamDeadline" });
    expect(mergePlan("{", {})).toEqual({ error: "unreadable" });
  });

  it("round-trips a jam deadline in the person's time", () => {
    const iso = localToIso("2026-12-07 23:00");
    expect(isoToLocal(iso)).toBe("2026-12-07 23:00");
    expect(JSON.parse(mergePlan(undefined, { jamDeadline: "2026-12-07 23:00", jamName: "Mini Jam" }).text).jam).toEqual({ deadline: iso, name: "Mini Jam" });
    expect(formOf({ jam: { deadline: iso } }).jamDeadline).toBe("2026-12-07 23:00");
  });

  it("offers the fallback within the last day, once per deadline", () => {
    const jam = { deadline: "2026-12-07T15:00:00.000Z" };
    expect(dueForFallback(jam, [], Date.parse("2026-12-06T14:00:00Z"))).toBe(false);
    expect(dueForFallback(jam, [], Date.parse("2026-12-07T01:00:00Z"))).toBe(true);
    expect(dueForFallback(jam, [jam.deadline], Date.parse("2026-12-07T01:00:00Z"))).toBe(false);
    expect(countdown(jam.deadline, Date.parse("2026-12-07T13:15:00Z"))).toEqual({ over: false, days: 0, hours: 1, minutes: 45 });
    expect(daysUntil("2026-12-11", new Date(2026, 11, 8, 23, 0))).toBe(3);
  });
});

type Listener = (value: unknown) => void;
const bridge = vi.hoisted(() => ({
  opened: undefined as unknown,
  view: undefined as any,
  file: undefined as string | undefined,
  confirm: true,
  asked: undefined as unknown,
  requests: [] as [string, any][],
  listeners: new Map<string, Listener>(),
}));
vi.mock("../plugin-ui.ts", () => ({
  connect: async () => ({
    locale: "en",
    opened: bridge.opened,
    on: (event: string, listener: Listener) => bridge.listeners.set(event, listener),
    files: {
      text: async () => {
        if (bridge.file === undefined) throw new Error("not found");
        return bridge.file;
      },
      write: async (file: string, text: string) => {
        bridge.requests.push(["files.write", { file, text }]);
        bridge.file = text;
      },
    },
    request: async (name: string, value: any) => {
      bridge.requests.push([name === "command.run" ? value.command : name, value]);
      if (name === "storage.get") return bridge.asked;
      if (name === "ui.confirm") return bridge.confirm;
      if (name === "command.run") return structuredClone(bridge.view);
      return null;
    },
  }),
}));

const ladder = (starts = "open") => [
  { rung: "starts", verdict: starts, judgement: starts === "open" ? undefined : { verdict: starts, source: "game-tests", at: "2026-11-27T01:00:00Z", detail: "2 of 2 game tests passed" } },
  { rung: "core", verdict: "open" },
  { rung: "loop", verdict: "open" },
];
async function show() {
  document.body.innerHTML = '<omg-page id="ladder"></omg-page>';
  vi.resetModules();
  // @ts-expect-error The panel's page is plain JavaScript.
  await import("../../plugins/ship-ladder/panel/main.js");
  const root = document.getElementById("ladder")!;
  await vi.waitFor(() => expect(root.querySelector("[data-rung]")).not.toBeNull());
  return root;
}
const names = () => bridge.requests.map(([name]) => name);

beforeEach(() => {
  bridge.opened = undefined;
  bridge.file = undefined;
  bridge.confirm = true;
  bridge.asked = undefined;
  bridge.requests = [];
  bridge.listeners.clear();
  bridge.view = { file: "design/ship.json", plan: null, problems: [], ladder: ladder(), firstPassed: {}, jam: null, canProbe: false };
});

describe("the Ship ladder panel page", () => {
  it("shows the rungs as the native side judged them", async () => {
    bridge.view.ladder = ladder("passed");
    const root = await show();
    const rungs = [...root.querySelectorAll("[data-rung]")].map((item) => [item.getAttribute("data-rung"), item.querySelector("omg-status")!.textContent]);
    expect(rungs).toEqual([["starts", "Reached"], ["core", "Not checked"], ["loop", "Not checked"]]);
    expect(root.textContent).toContain("2 of 2 game tests passed");
    expect(root.textContent).toContain("From game tests");
  });

  it("writes the form into design/ship.json", async () => {
    bridge.file = JSON.stringify({ coreProbe: { actions: [{ type: "wait", milliseconds: 1 }], state: "x" } });
    const root = await show();
    const set = (key: string, value: string) => {
      const input = root.querySelector(`[data-field="${key}"]`) as HTMLElement & { value: string };
      input.value = value;
      input.dispatchEvent(new Event("input"));
    };
    set("shipDate", "2026-12-11");
    set("core", "Sort the water");
    ([...root.querySelectorAll("omg-button")].find((button) => button.textContent === "Save plan") as HTMLElement).click();
    await vi.waitFor(() => expect(names()).toContain("files.write"));
    const [, { file, text }] = bridge.requests.find(([name]) => name === "files.write")!;
    expect(file).toBe("design/ship.json");
    expect(JSON.parse(text)).toEqual({ coreProbe: { actions: [{ type: "wait", milliseconds: 1 }], state: "x" }, shipDate: "2026-12-11", core: "Sort the water" });
  });

  it("offers the fallback build once when the plugin opens it in a jam's last day", async () => {
    bridge.opened = { jamAlert: true };
    bridge.view.jam = { deadline: new Date(Date.now() + 3 * 3600_000).toISOString(), name: "Mini Jam", left: {} };
    const root = await show();
    await vi.waitFor(() => expect(names()).toContain("composer.fill"));
    expect(names().filter((name) => name === "ui.confirm")).toHaveLength(1);
    expect(bridge.requests.find(([name]) => name === "composer.fill")![1]).toEqual({ text: FALLBACK_PROMPT });
    expect(bridge.requests.find(([name]) => name === "storage.set")![1]).toEqual({ key: "asked", value: [bridge.view.jam.deadline] });
    expect(root.querySelector("[data-jam]")!.textContent).toMatch(/^Mini Jam: [23] h \d+ min left$/);
  });

  it("doesn't ask again for a deadline it asked about", async () => {
    bridge.view.jam = { deadline: new Date(Date.now() + 3 * 3600_000).toISOString(), left: {} };
    bridge.asked = [bridge.view.jam.deadline];
    bridge.opened = { jamAlert: true };
    await show();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(names()).not.toContain("ui.confirm");
  });

  it("runs the start check and ticks a rung", async () => {
    const root = await show();
    ([...root.querySelectorAll("omg-button")].find((button) => button.textContent === "Check now") as HTMLElement).click();
    await vi.waitFor(() => expect(names()).toContain("check"));
    const loop = root.querySelector('[data-rung="loop"] omg-checkbox') as HTMLElement & { checked?: boolean };
    loop.checked = true;
    loop.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(bridge.requests.find(([name]) => name === "mark")?.[1]).toEqual({ command: "mark", input: { rung: "loop", done: true } }));
  });
});
