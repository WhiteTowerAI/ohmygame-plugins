// @vitest-environment happy-dom
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error The panel's helpers are plain JavaScript.
import { deviceName, deviceProblems, phonePrompt } from "../../plugins/launch-check/panel/format.js";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

describe("what phones report", () => {
  it("names a phone from its user agent", () => {
    expect(deviceName(IPHONE)).toBe("iPhone, iOS 17.5");
    expect(deviceName(PIXEL)).toBe("Pixel 8, Android 14");
    expect(deviceName("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36")).toBe("Android 10");
    expect(deviceName("")).toBe("Unknown device");
  });

  it("finds errors, a low frame rate, locked sound and a slow start, and asks the AI about them in English", () => {
    const quiet = { id: "a", userAgent: PIXEL, fps: { current: 60, low: 55 }, audio: ["running"], firstFrameMs: 900, errors: [] };
    expect(deviceProblems(quiet)).toEqual([]);
    expect(phonePrompt([quiet])).toBeUndefined();
    const rough = { id: "b", userAgent: IPHONE, viewport: { width: 390, height: 844, dpr: 3 }, fps: { current: 22, low: 18 }, audio: ["suspended"], firstFrameMs: 12_500, errors: ["TypeError: x is undefined (main.js:10)"] };
    expect(deviceProblems(rough).map((problem: { key: string }) => problem.key)).toEqual(["errors", "lowFps", "audioSuspended", "slowStart"]);
    const prompt = phonePrompt([quiet, rough]);
    expect(prompt).toContain("- iPhone, iOS 17.5 at 390×844 (×3): errors: TypeError: x is undefined (main.js:10); frame rate dropped to 18 fps;");
    expect(prompt).toContain("resume it in a touchend or click handler");
    expect(prompt).not.toContain("Pixel 8");
  });
});

describe("the script phones run", () => {
  it("reports errors, the viewport and its frame rate to the computer, and shows a line on screen", async () => {
    const posts: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      posts.push(JSON.parse(init.body));
      return new Response(null, { status: 204 });
    }));
    vi.useFakeTimers();
    const source = await readFile(path.resolve("plugins/launch-check/overlay/overlay.js"), "utf8");
    // eslint-disable-next-line no-new-func
    new Function(source)();
    window.dispatchEvent(new ErrorEvent("error", { message: "Boom", filename: "http://phone/assets/main.js", lineno: 12 }));
    console.error("Failed to decode", new Error("bad audio"));
    await vi.advanceTimersByTimeAsync(2100);
    const last = posts.at(-1);
    expect(last.id).toMatch(/^\w+$/);
    expect(last.errors).toEqual(["Boom (main.js:12)", "Failed to decode bad audio"]);
    expect(last.viewport).toMatchObject({ width: window.innerWidth, height: window.innerHeight });
    expect(last).toHaveProperty("safeArea");
    // Running it twice adds nothing.
    new Function(source)();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
