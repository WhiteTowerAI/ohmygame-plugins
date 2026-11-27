import { describe, expect, it, vi } from "vitest";
import { at, coreProbe, startCheck } from "../../plugins/ship-ladder/src/check.ts";

// The game as the plugin's context.game gives it, played by a fake.

function page(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "s",
    runtime: "web",
    capabilities: {},
    url: "http://127.0.0.1:5173/",
    title: "Game",
    readyState: "complete",
    elements: [],
    canvases: [{ index: 0, width: 640, height: 360, box: { x: 0, y: 0, width: 640, height: 360 }, visible: true }],
    logs: [],
    failedRequests: [],
    ...overrides,
  };
}

function fakeGame(snapshot: unknown, { blank = false, after }: { blank?: boolean; after?: unknown } = {}) {
  const session = {
    id: "s",
    capabilities: {},
    snapshot,
    inspect: vi.fn(async () => snapshot),
    act: vi.fn(async () => after ?? snapshot),
    capture: vi.fn(async () => ({ analysis: { likelyBlank: blank } })),
    close: vi.fn(async () => {}),
  };
  return { game: { open: vi.fn(async () => session), actTogether: vi.fn() }, session };
}
const signal = new AbortController().signal;

describe("checking that the game starts", () => {
  it("passes a game that loads without errors and draws on a canvas", async () => {
    const { game, session } = fakeGame(page());
    expect(await startCheck(game as never, signal, 10)).toEqual({ verdict: "passed", detail: "The game opened without errors and draws on a canvas" });
    expect(session.act).toHaveBeenCalledWith([{ type: "wait", milliseconds: 10 }], { signal });
    expect(session.close).toHaveBeenCalled();
  });

  it("fails on a console error, or a request to its own site that failed", async () => {
    const error = fakeGame(page({ logs: [{ level: "warning", message: "slow" }, { level: "error", message: "Uncaught TypeError: x is undefined" }] }));
    expect(await startCheck(error.game as never, signal, 0)).toMatchObject({ verdict: "failed", detail: "Console error: Uncaught TypeError: x is undefined" });
    const own = fakeGame(page({ failedRequests: [{ url: "http://127.0.0.1:5173/assets/hero.png", error: "404" }] }));
    expect((await startCheck(own.game as never, signal, 0)).verdict).toBe("failed");
    const other = fakeGame(page({ failedRequests: [{ url: "https://analytics.example.com/x", error: "blocked" }] }));
    expect((await startCheck(other.game as never, signal, 0)).verdict).toBe("passed");
  });

  it("fails a page still loading, or a blank screen, and can't judge a runtime without a page", async () => {
    expect((await startCheck(fakeGame(page({ readyState: "loading" })).game as never, signal, 0)).verdict).toBe("failed");
    const blank = fakeGame(page({ canvases: [] }), { blank: true });
    expect(await startCheck(blank.game as never, signal, 0)).toEqual({ verdict: "failed", detail: "The game opened without errors, but the screen is blank" });
    const drawn = fakeGame(page({ canvases: [] }));
    expect((await startCheck(drawn.game as never, signal, 0)).verdict).toBe("passed");
    const native = fakeGame({ sessionId: "s", runtime: "native", capabilities: {} });
    expect((await startCheck(native.game as never, signal, 0)).verdict).toBe("unknown");
    expect(native.session.close).toHaveBeenCalled();
  });
});

describe("the core probe", () => {
  const probe = { actions: [{ type: "press", key: "Space" }], state: "player.score" };
  it("passes when the state it names changes", async () => {
    const { game, session } = fakeGame(page({ gameState: { player: { score: 0 } } }), { after: page({ gameState: { player: { score: 10 } } }) });
    expect(await coreProbe(game as never, probe, signal)).toEqual({ verdict: "passed", detail: "player.score went from 0 to 10" });
    expect(session.act).toHaveBeenCalledWith(probe.actions, { signal });
  });

  it("fails when it doesn't, and can't tell without a snapshot or the path", async () => {
    const same = fakeGame(page({ gameState: { player: { score: 0 } } }));
    expect((await coreProbe(same.game as never, probe, signal)).verdict).toBe("failed");
    expect((await coreProbe(fakeGame(page()).game as never, probe, signal)).detail).toMatch(/no playtest snapshot/);
    const missing = fakeGame(page({ gameState: { level: 1 } }), { after: page({ gameState: { level: 1 } }) });
    expect(await coreProbe(missing.game as never, probe, signal)).toEqual({ verdict: "unknown", detail: "The snapshot has no player.score" });
    const broken = fakeGame(page({ gameState: {} }));
    broken.session.act.mockRejectedValueOnce(new Error("The game window closed"));
    expect(await coreProbe(broken.game as never, probe, signal)).toEqual({ verdict: "unknown", detail: "The probe couldn't run: The game window closed" });
  });

  it("reads dotted paths", () => {
    expect(at({ a: { b: [1, 2] } }, "a.b.1")).toBe(2);
    expect(at({ a: 1 }, "a.b")).toBeUndefined();
  });
});
