import type { PluginGame, PluginGameSession } from "../../../app/src/shared/extension-host-protocol.js";
import type { PlaytestAction, PlaytestSnapshot } from "../../../app/src/shared/playtest.js";
import type { Verdict } from "./ladder.ts";
import type { CoreProbe } from "./ship.ts";

// The plugin's own checks, through the game as the agent's game_use plays it.

/** How long the game gets to settle after its page has loaded. */
export const SETTLE_MS = 5000;

const isPage = (snapshot: unknown): snapshot is PlaytestSnapshot =>
  Boolean(snapshot && typeof snapshot === "object" && Array.isArray((snapshot as PlaytestSnapshot).logs));

/**
 * Does the game start? Opens it, lets it settle, and passes when nothing went
 * wrong and something is on screen: no console errors, no failed requests to
 * its own site, and a visible canvas or a frame that isn't blank.
 */
export async function startCheck(game: PluginGame, signal: AbortSignal, settle = SETTLE_MS): Promise<{ verdict: Verdict; detail: string }> {
  const session = await game.open({ signal });
  try {
    await session.act([{ type: "wait", milliseconds: settle }], { signal });
    const snapshot = await session.inspect({ signal });
    if (!isPage(snapshot)) return { verdict: "unknown", detail: "This game's runtime doesn't report console errors or requests" };
    if (snapshot.readyState !== "complete") return { verdict: "failed", detail: `The page was still loading after ${settle / 1000} seconds` };
    const error = snapshot.logs.find((log) => log.level === "error");
    if (error) return { verdict: "failed", detail: `Console error: ${error.message.slice(0, 200)}` };
    const origin = safeOrigin(snapshot.url);
    const failed = snapshot.failedRequests.find((request) => origin && safeOrigin(request.url) === origin);
    if (failed) return { verdict: "failed", detail: `A request failed: ${failed.url} (${failed.error})` };
    if (snapshot.canvases.some((canvas) => canvas.visible)) return { verdict: "passed", detail: "The game opened without errors and draws on a canvas" };
    const capture = await session.capture({ signal });
    if (capture.analysis.likelyBlank) return { verdict: "failed", detail: "The game opened without errors, but the screen is blank" };
    return { verdict: "passed", detail: "The game opened without errors and shows something" };
  } finally {
    await session.close().catch(() => {});
  }
}

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** A value at a dotted path, such as "player.score". */
export function at(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), value);
}

/** Does the core loop do something? Plays the plan's probe and checks the state it names changed. */
export async function coreProbe(game: PluginGame, probe: CoreProbe, signal: AbortSignal): Promise<{ verdict: Verdict; detail: string }> {
  let session: PluginGameSession | undefined;
  try {
    session = await game.open({ signal });
    const before = await session.inspect({ signal });
    if (before.gameState === undefined)
      return { verdict: "unknown", detail: "The game has no playtest snapshot, so the probe can't see its state; add window.__OHMYGAME_PLAYTEST__.snapshot()" };
    const after = await session.act(probe.actions as PlaytestAction[], { signal });
    const from = at(before.gameState, probe.state);
    const to = at(after.gameState, probe.state);
    if (to === undefined) return { verdict: "unknown", detail: `The snapshot has no ${probe.state}` };
    return JSON.stringify(from) === JSON.stringify(to)
      ? { verdict: "failed", detail: `${probe.state} stayed ${JSON.stringify(to)}` }
      : { verdict: "passed", detail: `${probe.state} went from ${JSON.stringify(from)} to ${JSON.stringify(to)}` };
  } catch (cause) {
    if (signal.aborted) throw cause;
    return { verdict: "unknown", detail: `The probe couldn't run: ${cause instanceof Error ? cause.message : String(cause)}` };
  } finally {
    await session?.close().catch(() => {});
  }
}
