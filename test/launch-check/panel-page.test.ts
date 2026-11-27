// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { report } from "../../plugins/launch-check/src/profiles.ts";
import { scanBuild } from "../../plugins/launch-check/src/scan.ts";
import { build, viteDefault } from "./fixtures.ts";

// The panel's page against a stand-in for the app's bridge: what it shows for
// the report its native side gives, and what it asks the app for.

type Listener = (value: unknown) => void;
const bridge = vi.hoisted(() => ({
  opened: undefined as unknown,
  last: null as unknown,
  scanned: null as unknown,
  scanError: undefined as string | undefined,
  storage: undefined as unknown,
  requests: [] as [string, unknown][],
  listeners: new Map<string, Listener>(),
}));
vi.mock("../plugin-ui.ts", () => ({
  connect: async () => ({
    locale: "en",
    opened: bridge.opened,
    on: (event: string, listener: Listener) => bridge.listeners.set(event, listener),
    request: async (name: string, value: { command?: string; key?: string }) => {
      bridge.requests.push([name === "command.run" ? value.command! : name, value]);
      if (name === "storage.get") return structuredClone(bridge.storage);
      if (name === "command.run" && value.command === "last") return structuredClone(bridge.last);
      if (name === "command.run" && value.command === "scan") {
        if (bridge.scanError) throw new Error(bridge.scanError);
        return structuredClone(bridge.scanned);
      }
      return null;
    },
  }),
}));

async function show() {
  document.body.innerHTML = '<omg-page id="launch"></omg-page>';
  vi.resetModules();
  // @ts-expect-error The panel's page is plain JavaScript.
  await import("../../plugins/launch-check/panel/main.js");
  const root = document.getElementById("launch")!;
  // The page draws once it has read the last report.
  await vi.waitFor(() => expect(root.querySelector(".toolbar")).not.toBeNull());
  return root;
}
const buttons = (root: Element) => [...root.querySelectorAll("omg-button")].map((button) => button.textContent);
const click = (root: Element, label: string) => ([...root.querySelectorAll("omg-button")].find((button) => button.textContent === label) as HTMLElement).click();
let viteReport: unknown;

beforeEach(async () => {
  bridge.opened = undefined;
  bridge.last = null;
  bridge.storage = undefined;
  bridge.scanError = undefined;
  bridge.requests = [];
  bridge.listeners.clear();
  viteReport ??= report(await scanBuild(await build(viteDefault)), new Date("2026-11-27T00:00:00Z"));
  bridge.scanned = viteReport;
});

describe("the Launch check panel page", () => {
  it("offers a scan before there is one, and scans when asked", async () => {
    const root = await show();
    expect(root.querySelector("omg-empty")?.getAttribute("heading")).toBe("Not scanned yet");
    expect(bridge.requests.map(([name]) => name)).not.toContain("scan");
    click(root, "Scan the web build");
    await vi.waitFor(() => expect(root.querySelectorAll("[data-profile]")).toHaveLength(5));
    expect(bridge.requests.filter(([name]) => name === "scan")).toHaveLength(1);
  });

  it("scans at once when opened from the Publish menu, and again when opened again", async () => {
    bridge.opened = { scan: true };
    const root = await show();
    await vi.waitFor(() => expect(root.querySelectorAll("[data-profile]")).toHaveLength(5));
    bridge.listeners.get("open")!({ state: { scan: true } });
    await vi.waitFor(() => expect(bridge.requests.filter(([name]) => name === "scan")).toHaveLength(2));
  });

  it("shows the last report: platforms, what a player downloads and what it found", async () => {
    bridge.last = viteReport;
    const root = await show();
    const badges = Object.fromEntries([...root.querySelectorAll("[data-profile]")].map((item) => [item.getAttribute("data-profile"), item.querySelector("omg-badge")!.textContent]));
    expect(badges).toEqual({
      itch: "Doesn't meet",
      crazygames: "Doesn't meet",
      "youtube-playables": "Doesn't meet",
      ohmygame: "Meets the limits",
      poki: "Meets the limits",
    });
    expect(root.textContent).toContain("Poki's pages disagree");
    expect([...root.querySelectorAll("[data-kind]")].map((item) => item.getAttribute("data-kind"))).toEqual(["absolute-path", "unreferenced", "source-map"]);
    expect(root.textContent).toContain('A game can build a file\'s name at run time');
    expect(buttons(root)).toEqual(["Scan again", "Ask the AI to fix these"]);
  });

  it("asks the AI to fix what fails where the person plans to publish, which it remembers", async () => {
    bridge.last = viteReport;
    bridge.storage = ["crazygames"];
    const root = await show();
    click(root, "Ask the AI to fix these");
    const [, fill] = bridge.requests.find(([name]) => name === "composer.fill")!;
    expect((fill as { text: string }).text).toContain("for CrazyGames.");
    expect((fill as { text: string }).text).not.toContain("itch.io:");

    const itch = root.querySelector('[data-profile="itch"] omg-checkbox') as HTMLElement & { checked?: boolean };
    itch.checked = true;
    itch.dispatchEvent(new Event("change"));
    expect(bridge.requests.find(([name]) => name === "storage.set")).toEqual(["storage.set", { key: "targets", value: ["crazygames", "itch"] }]);
  });

  it("says why a scan couldn't run", async () => {
    bridge.scanError = "OhMyGame couldn't build the game for the scan.";
    const root = await show();
    click(root, "Scan the web build");
    await vi.waitFor(() => expect(root.querySelector("omg-banner")?.textContent).toBe("OhMyGame couldn't build the game for the scan."));
  });
});
