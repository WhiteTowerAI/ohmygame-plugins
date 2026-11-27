import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRewarded, rewarded, RETRY_DELAYS_MS, SHOW_TIMEOUT_MS, watched } from "../../plugins/wechat-minigame/skills/minigame-rewarded-ad/reference/rewarded.ts";

// A stand-in for wx/tt's RewardedVideoAd, behaving as the platforms' docs
// describe: one object, onError on a failed load and on errors while it shows.
function fakePlatform() {
  const ad = {
    created: [] as Record<string, unknown>[],
    closeListeners: [] as ((res?: unknown) => void)[],
    errorListeners: [] as ((error: unknown) => void)[],
    loads: 0,
    shows: 0,
    failLoads: 0,
    failShows: 0,
    error(error: unknown = { errCode: 1004 }) {
      for (const listener of ad.errorListeners) listener(error);
    },
    async load() {
      ad.loads += 1;
      if (ad.failLoads > 0) {
        ad.failLoads -= 1;
        ad.error();
        throw new Error("no fill");
      }
    },
    async show() {
      ad.shows += 1;
      if (ad.failShows > 0) {
        ad.failShows -= 1;
        throw new Error("not loaded");
      }
    },
    onClose(listener: (res?: unknown) => void) {
      ad.closeListeners.push(listener);
    },
    onError(listener: (error: unknown) => void) {
      ad.errorListeners.push(listener);
    },
    close(res?: unknown) {
      for (const listener of ad.closeListeners) listener(res);
    },
  };
  const api = { createRewardedVideoAd: vi.fn((options: Record<string, unknown>) => (ad.created.push(options), ad)) };
  return { ad, api };
}
const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};
function pauses() {
  const calls: string[] = [];
  return { calls, pause: () => calls.push("pause"), resume: () => calls.push("resume") };
}

beforeEach(() => resetRewarded());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("whether an ad was watched", () => {
  it("follows each platform's close result", () => {
    expect(watched("wx", { isEnded: true })).toBe(1);
    expect(watched("wx", { isEnded: false })).toBe(0);
    // WeChat before base library 2.1.0 passes nothing: it only closed at the end.
    expect(watched("wx", undefined)).toBe(1);
    expect(watched("tt", { isEnded: false, count: 2 })).toBe(2);
    expect(watched("tt", { isEnded: true, count: 0 })).toBe(0);
    expect(watched("tt", { isEnded: true })).toBe(1);
    expect(watched("tt", undefined)).toBe(0);
  });
});

describe("a rewarded ad on WeChat", () => {
  it("grants only when the ad was watched to the end, pausing and resuming once around each show", async () => {
    const { ad, api } = fakePlatform();
    vi.stubGlobal("wx", api);
    const game = pauses();
    const reward = rewarded("adunit-1");
    await flush();
    expect(reward.available).toBe(true);

    const early = reward.show(game);
    await flush();
    ad.close({ isEnded: false });
    expect(await early).toEqual({ result: "closed", count: 0 });
    await flush();
    const full = reward.show(game);
    await flush();
    ad.close({ isEnded: true });
    expect(await full).toEqual({ result: "granted", count: 1 });
    expect(game.calls).toEqual(["pause", "resume", "pause", "resume"]);
  });

  it("is one controller per game: the same id gives it back, another id is refused", () => {
    const { ad, api } = fakePlatform();
    vi.stubGlobal("wx", api);
    const first = rewarded("adunit-1", { platformOptions: { disableFallbackSharePage: true } });
    expect(rewarded("adunit-1")).toBe(first);
    expect(() => rewarded("adunit-2")).toThrow(/one object per game/);
    expect(api.createRewardedVideoAd).toHaveBeenCalledTimes(1);
    expect(ad.created[0]).toEqual({ disableFallbackSharePage: true, adUnitId: "adunit-1" });
    expect(ad.closeListeners).toHaveLength(1);
    expect(ad.errorListeners).toHaveLength(1);
    // WeChat's multiton allows one per id.
    rewarded("adunit-2", { platformOptions: { multiton: true } });
    expect(ad.created[1]).toEqual({ multiton: true, adUnitId: "adunit-2" });
  });

  it("tells each scene that watches, at once and on every change, until it stops", async () => {
    const { ad, api } = fakePlatform();
    vi.stubGlobal("wx", api);
    const reward = rewarded("adunit-1");
    await flush();
    const first: boolean[] = [];
    const stop = reward.watch((available) => first.push(available));
    // A reloaded scene watches again and hears the current state straight away.
    const second: boolean[] = [];
    reward.watch((available) => second.push(available));
    expect(first).toEqual([true]);
    expect(second).toEqual([true]);
    stop();
    const shown = reward.show();
    await flush();
    ad.close({ isEnded: true });
    await shown;
    expect(first).toEqual([true]);
    expect(second).toEqual([true, false, true]);
  });

  it("retries a failed first load with a growing wait, and says the ad is unavailable meanwhile", async () => {
    vi.useFakeTimers();
    const { ad, api } = fakePlatform();
    vi.stubGlobal("wx", api);
    ad.failLoads = 2;
    const reward = rewarded("adunit-1");
    const seen: boolean[] = [];
    reward.watch((available) => seen.push(available));
    await flush();
    expect(ad.loads).toBe(1);
    expect(seen).toEqual([false]);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]!);
    expect(ad.loads).toBe(2);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1]!);
    expect(ad.loads).toBe(3);
    expect(seen).toEqual([false, true]);
  });

  it("loads once more when a loaded ad fails to show, and resumes the game exactly once when it gives up", async () => {
    const { ad, api } = fakePlatform();
    vi.stubGlobal("wx", api);
    const reward = rewarded("adunit-1");
    await flush();
    const game = pauses();
    ad.failShows = 1;
    const retried = reward.show(game);
    await flush();
    expect(ad.shows).toBe(2);
    ad.close({ isEnded: true });
    expect((await retried).result).toBe("granted");
    // Let the reload after the close finish first.
    await flush();

    // The retry's load fails too, and the platform fires onError while the show is starting.
    ad.failShows = 1;
    ad.failLoads = 1;
    const failed = game.calls.length;
    expect(await reward.show(game)).toEqual({ result: "unavailable", count: 0 });
    expect(game.calls.slice(failed)).toEqual(["pause", "resume"]);
  });

  it("keeps the reward when an error while starting is followed by a successful retry", async () => {
    const { ad, api } = fakePlatform();
    vi.stubGlobal("wx", api);
    const reward = rewarded("adunit-1");
    await flush();
    const game = pauses();
    ad.show = async () => {
      ad.shows += 1;
      if (ad.shows === 1) {
        ad.error({ errCode: 1000 });
        throw new Error("show failed");
      }
    };
    const shown = reward.show(game);
    await flush();
    expect(game.calls).toEqual(["pause"]);
    ad.close({ isEnded: true });
    expect(await shown).toEqual({ result: "granted", count: 1 });
    expect(game.calls).toEqual(["pause", "resume"]);
  });

  it("ends a show without a reward on an error while the ad is up, or when it never closes", async () => {
    vi.useFakeTimers();
    const { ad, api } = fakePlatform();
    vi.stubGlobal("wx", api);
    const reward = rewarded("adunit-1");
    await flush();
    const game = pauses();
    const errored = reward.show(game);
    await flush();
    ad.error({ errCode: 1000 });
    expect(await errored).toEqual({ result: "unavailable", count: 0 });
    // A close arriving late grants nothing and doesn't resume again.
    ad.close({ isEnded: true });
    expect(game.calls).toEqual(["pause", "resume"]);

    await flush();
    const hung = reward.show(game);
    await flush();
    await vi.advanceTimersByTimeAsync(SHOW_TIMEOUT_MS);
    expect(await hung).toEqual({ result: "unavailable", count: 0 });
    expect(game.calls).toEqual(["pause", "resume", "pause", "resume"]);
  });

  it("doesn't show twice at once", async () => {
    const { ad, api } = fakePlatform();
    vi.stubGlobal("wx", api);
    const reward = rewarded("adunit-1");
    await flush();
    const first = reward.show();
    expect(await reward.show()).toEqual({ result: "unavailable", count: 0 });
    await flush();
    ad.close({ isEnded: true });
    expect((await first).result).toBe("granted");
  });

  it("never grants in a mini-game runtime without the ad API", async () => {
    vi.stubGlobal("wx", {});
    const reward = rewarded("adunit-1");
    expect(reward.available).toBe(false);
    expect(await reward.show()).toEqual({ result: "unavailable", count: 0 });
  });
});

describe("a rewarded ad on Douyin", () => {
  it("uses the number of ads watched when Douyin gives it", async () => {
    const { ad, api } = fakePlatform();
    vi.stubGlobal("tt", api);
    const reward = rewarded("adunit-2");
    await flush();
    const shown = reward.show();
    await flush();
    ad.close({ isEnded: false, count: 2 });
    expect(await shown).toEqual({ result: "granted", count: 2 });
  });
});

describe("outside a mini-game runtime", () => {
  it("stands in on a local preview, as the preview asks", async () => {
    vi.stubGlobal("location", { hostname: "127.0.0.1" });
    const reward = rewarded("adunit-3");
    const seen: boolean[] = [];
    reward.watch((available) => seen.push(available));
    expect(seen).toEqual([true]);
    expect(await reward.show()).toEqual({ result: "granted", count: 1 });
    vi.stubGlobal("__REWARDED_SIMULATE__", "closed");
    expect(await reward.show()).toEqual({ result: "closed", count: 0 });
  });

  it("never grants on a published web build", async () => {
    vi.stubGlobal("location", { hostname: "games.example.com" });
    const reward = rewarded("adunit-3");
    expect(reward.available).toBe(false);
    expect(await reward.show()).toEqual({ result: "unavailable", count: 0 });
  });
});

describe("the two plugins' copies", () => {
  it("are the same files", async () => {
    for (const file of ["reference/rewarded.ts", "reference/size-check.mjs", "SKILL.md"]) {
      const wechat = await readFile(`plugins/wechat-minigame/skills/minigame-rewarded-ad/${file}`, "utf8");
      const douyin = await readFile(`plugins/douyin-minigame/skills/minigame-rewarded-ad/${file}`, "utf8");
      expect(douyin, file).toBe(wechat);
    }
  });
});
