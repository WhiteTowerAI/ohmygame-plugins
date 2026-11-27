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
  lanStatus: { running: false, devices: [] } as unknown,
  lanDone: undefined as undefined | (() => void),
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
      if (name === "command.run" && value.command === "lan-status") return structuredClone(bridge.lanStatus);
      if (name === "command.run" && value.command === "lan") return new Promise((resolve) => (bridge.lanDone = () => resolve({ devices: [] })));
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
  bridge.lanStatus = { running: false, devices: [] };
  bridge.lanDone = undefined;
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
    expect(buttons(root)).toEqual(["Scan again", "Start", "Ask the AI to fix these"]);
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

  it("serves the game to phones: a QR code, the address, and what each phone reports", async () => {
    bridge.last = viteReport;
    const root = await show();
    click(root, "Start");
    await vi.waitFor(() => expect(bridge.requests.map(([name]) => name)).toContain("lan"));
    bridge.lanStatus = {
      running: true,
      url: "http://192.168.1.20:52311/?t=abc",
      devices: [{ id: "p1", seenAt: "2026-11-27T01:00:00Z", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", viewport: { width: 390, height: 844, dpr: 3 }, fps: { current: 24, low: 18 }, audio: ["suspended"], errors: [] }],
    };
    const platforms = root.querySelector('[data-profile]');
    expect(platforms).not.toBeNull();
    await vi.waitFor(() => expect(root.querySelector(".qr svg")).not.toBeNull(), { timeout: 3000 });
    // Polls redraw only the phone section; what the person opened elsewhere stays.
    expect(root.querySelector('[data-profile]')).toBe(platforms);
    expect(root.querySelector(".address")!.textContent).toBe("http://192.168.1.20:52311/?t=abc");
    expect(root.querySelector('[data-device="p1"]')!.textContent).toContain("iPhone, iOS 17.5");
    expect(root.querySelector('[data-device="p1"] omg-badge')!.textContent).toBe("2 to check");
    expect([...root.querySelectorAll('[data-device="p1"] .problems li')].map((item) => item.textContent)).toEqual(["Frame rate dropped to 18 fps", "Sound is off: the game's audio was never unlocked by a tap"]);
    ([...root.querySelectorAll("omg-button")].find((button) => button.textContent === "Ask the AI to fix what phones reported") as HTMLElement).click();
    expect(bridge.requests.filter(([name]) => name === "composer.fill").at(-1)![1]).toMatchObject({ text: expect.stringContaining("frame rate dropped to 18 fps") });
    click(root, "Stop");
    expect(bridge.requests.map(([name]) => name)).toContain("lan-stop");
    bridge.lanStatus = { running: false, devices: [] };
    bridge.lanDone!();
    await vi.waitFor(() => expect(buttons(root)).toContain("Start"));
  });

  it("serves at once when opened from Test on a phone", async () => {
    bridge.opened = { phone: true };
    await show();
    await vi.waitFor(() => expect(bridge.requests.map(([name]) => name)).toContain("lan"));
    bridge.lanDone!();
  });
});
