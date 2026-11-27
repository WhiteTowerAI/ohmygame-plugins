// Rewarded video ads for WeChat (wx) and Douyin (tt) mini games, and a stand-in
// for local previews. Copy this file into the game; it imports nothing.
//
// What it follows, from the platforms' rewarded-video docs:
// - The ad object is a global singleton on both platforms: one per game, not
//   one per ad unit. So this file keeps one controller, with one set of
//   listeners and one show at a time, and refuses a second ad unit id unless
//   WeChat's `multiton` is used.
// - Grant only when the ad was watched to the end (WeChat `res.isEnded`, from
//   base library 2.1.0; Douyin `res.count` when given, else `isEnded`).
// - A show after a failed load is rejected: load again first.
// - Ads are limited per person per day: when none can be loaded, the game is
//   told, so it hides the button.
// And, as practice rather than platform rule: pause and mute the game around
// the ad, and never leave it paused.

export type RewardResult = "granted" | "closed" | "unavailable";

export interface ShowOptions {
  /** Called once before the ad shows: pause the game loop and mute it. */
  pause?: () => void;
  /** Called once when the show ends, however it ends: resume and unmute. */
  resume?: () => void;
}

export interface RewardedOptions {
  /** Options passed to `createRewardedVideoAd` as they are, such as WeChat's `multiton` or `disableFallbackSharePage`. */
  platformOptions?: Record<string, unknown>;
  /** In a local preview: what the stand-in does. On any other address it is "unavailable". */
  simulate?: RewardResult;
}

export interface Rewarded {
  /** Whether an ad is loaded and the button can show. */
  readonly available: boolean;
  /** Calls `listener` now and whenever availability changes; returns a function that stops it. */
  watch(listener: (available: boolean) => void): () => void;
  /** Shows the ad; `count` is how many were watched (Douyin may offer more than one). */
  show(options?: ShowOptions): Promise<{ result: RewardResult; count: number }>;
  /** Loads again now, for example when the game comes back to the foreground. */
  refresh(): void;
}

interface PlatformAd {
  load(): Promise<unknown>;
  show(): Promise<unknown>;
  onClose(listener: (res?: { isEnded?: boolean; count?: number }) => void): void;
  onError(listener: (error: { errCode?: number; errMsg?: string }) => void): void;
}
interface Platform {
  createRewardedVideoAd?: (options: Record<string, unknown>) => PlatformAd;
}
type PlatformName = "wx" | "tt" | "browser";

declare const wx: Platform | undefined;
declare const tt: Platform | undefined;

/** How long a show may play before it is given up on, without a reward. */
export const SHOW_TIMEOUT_MS = 5 * 60 * 1000;
/** Waits between load attempts after failures. */
export const RETRY_DELAYS_MS = [1000, 4000, 15000, 60000];

/**
 * Whether a close event means the ad was watched to the end, and how many
 * times. WeChat before base library 2.1.0 passes no result: it only closed
 * after the end. Douyin passes `count` (ads watched) on versions that offer
 * another ad after the first; use it when it is there, `isEnded` otherwise.
 */
export function watched(platform: PlatformName, res: { isEnded?: boolean; count?: number } | undefined): number {
  if (platform === "wx" && res === undefined) return 1;
  if (platform === "tt" && typeof res?.count === "number") return Math.max(0, Math.floor(res.count));
  return res?.isEnded === true ? 1 : 0;
}

/** The controllers made so far, by ad unit id; more than one only with WeChat's `multiton`. */
const controllers = new Map<string, Rewarded>();

function detect(): { name: PlatformName; api?: Platform } {
  // Mini-game runtimes define wx or tt as globals, not always on globalThis.
  if (typeof tt !== "undefined" && tt) return { name: "tt", api: tt };
  if (typeof wx !== "undefined" && wx) return { name: "wx", api: wx };
  return { name: "browser" };
}

/**
 * The game's rewarded ad. Call it with the same ad unit id anywhere; it
 * returns the same controller. A different id is refused: the platform has
 * one ad object per game. On WeChat (base library 2.8.0+), pass
 * `platformOptions: { multiton: true }` with each id to have one per id.
 */
export function rewarded(adUnitId: string, options: RewardedOptions = {}): Rewarded {
  const existing = controllers.get(adUnitId);
  if (existing) return existing;
  if (controllers.size && !options.platformOptions?.multiton)
    throw new Error(`The rewarded ad is one object per game, already made for ${[...controllers.keys()][0]}; use that id, or WeChat's multiton.`);
  const { name, api } = detect();
  let instance: Rewarded;
  if (name === "browser") instance = standIn(options);
  else if (!api?.createRewardedVideoAd) instance = unavailable();
  else instance = platformAd(name, api.createRewardedVideoAd({ ...options.platformOptions, adUnitId }));
  controllers.set(adUnitId, instance);
  return instance;
}

/** For tests: forget the controllers made so far. */
export function resetRewarded(): void {
  controllers.clear();
}

function availability() {
  const listeners = new Set<(available: boolean) => void>();
  let value = false;
  return {
    get value() {
      return value;
    },
    set(next: boolean) {
      if (value === next) return;
      value = next;
      for (const listener of [...listeners]) listener(next);
    },
    watch(listener: (available: boolean) => void) {
      listeners.add(listener);
      listener(value);
      return () => void listeners.delete(listener);
    },
  };
}

function platformAd(name: PlatformName, ad: PlatformAd, timeout = SHOW_TIMEOUT_MS): Rewarded {
  const state = availability();
  /** The show in progress: "starting" while show() runs, "playing" once the ad is up. */
  let current: { phase: "starting" | "playing"; done: (result: RewardResult, count?: number) => void } | undefined;
  let loading: Promise<boolean> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  const load = (): Promise<boolean> => {
    loading ??= ad
      .load()
      .then(() => {
        failures = 0;
        state.set(true);
        return true;
      })
      .catch(() => {
        state.set(false);
        // Try again later; a person who never presses the button still gets one when an ad comes.
        const delay = RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)]!;
        failures += 1;
        clearTimeout(retry);
        retry = setTimeout(() => void load(), delay);
        return false;
      })
      .finally(() => {
        loading = undefined;
      });
    return loading;
  };

  ad.onClose((res) => {
    const count = watched(name, res);
    current?.done(count > 0 ? "granted" : "closed", count);
    state.set(false);
    void load();
  });
  ad.onError(() => {
    state.set(false);
    // An error while the ad is up ends the show without a reward. One while it
    // is still starting is the show() call's to handle.
    if (current?.phase === "playing") current.done("unavailable");
  });
  void load();

  return {
    get available() {
      return state.value;
    },
    watch: (listener) => state.watch(listener),
    refresh() {
      clearTimeout(retry);
      void load();
    },
    async show(options = {}) {
      if (current) return { result: "unavailable", count: 0 };
      if (!state.value && !(await load())) return { result: "unavailable", count: 0 };
      return new Promise((resolve) => {
        let finished = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const show = { phase: "starting" as "starting" | "playing", done: (result: RewardResult, count = 0) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          current = undefined;
          options.resume?.();
          resolve({ result, count: result === "granted" ? count : 0 });
        } };
        current = show;
        options.pause?.();
        const start = async () => {
          try {
            await ad.show();
          } catch {
            // A loaded ad can still fail to show: load once more and try again.
            if (!(await load())) return show.done("unavailable");
            try {
              await ad.show();
            } catch {
              state.set(false);
              return show.done("unavailable");
            }
          }
          if (finished) return;
          show.phase = "playing";
          // Neither a close nor an error: don't leave the game paused for good.
          timer = setTimeout(() => show.done("unavailable"), timeout);
        };
        void start();
      });
    },
  };
}

/** A runtime with no ad API: never grants. */
function unavailable(): Rewarded {
  const state = availability();
  return { available: false, watch: (listener) => state.watch(listener), refresh() {}, show: async () => ({ result: "unavailable", count: 0 }) };
}

/** Whether the page is a local preview, such as OhMyGame's, where the stand-in may pretend. */
function isLocal(): boolean {
  const host = (globalThis as { location?: { hostname?: string } }).location?.hostname ?? "";
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local") || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host);
}

/**
 * Outside a mini-game runtime there are no ads. On a local preview the stand-in
 * does what `simulate` or `window.__REWARDED_SIMULATE__` says ("granted" when
 * neither does); on any other address, such as a web build on a portal, it is
 * unavailable, so a web build never hands out rewards for nothing.
 */
function standIn(options: RewardedOptions): Rewarded {
  const state = availability();
  const simulate = (): RewardResult => {
    if (!isLocal()) return "unavailable";
    return options.simulate ?? (globalThis as { __REWARDED_SIMULATE__?: RewardResult }).__REWARDED_SIMULATE__ ?? "granted";
  };
  state.set(simulate() !== "unavailable");
  return {
    get available() {
      return simulate() !== "unavailable";
    },
    watch: (listener) => state.watch(listener),
    refresh: () => state.set(simulate() !== "unavailable"),
    async show(show = {}) {
      const result = simulate();
      if (result === "unavailable") return { result, count: 0 };
      show.pause?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      show.resume?.();
      return { result, count: result === "granted" ? 1 : 0 };
    },
  };
}
