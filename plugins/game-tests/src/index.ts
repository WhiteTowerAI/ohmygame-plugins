import type { PluginContext, ToolCall } from "../../../app/src/shared/extension-host-protocol.js";
import { GameTestError } from "./parse.ts";
import { filesSummary, runSummary } from "./summary.ts";
import { GameTests } from "./tests.ts";
import { UnitTestError, UnitTests } from "./unit.ts";

// The Automated tests panel's native side and the agent's game_test tool. Both use one
// GameTests per project host, so the panel shows the agent's runs too.

const files = (input: unknown): string[] | undefined => {
  const value = (input as { files?: unknown } | undefined)?.files;
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
};

/** A run's progress, as the app shows a command's. */
const progress = (call: ToolCall) => (run: { files: string[]; scenarios: unknown[] }) =>
  call.progress(`Running ${Math.max(1, run.scenarios.length)} of ${run.files.length}`);

export function activate(context: PluginContext): void {
  const folder = context.project?.folder;
  if (!folder) return;
  let report: ((run: { files: string[]; scenarios: unknown[] }) => void) | undefined;
  const game = new GameTests(folder, context.game, { onChange: (run) => report?.(run) });
  const unit = new UnitTests(folder);
  context.onDispose(() => {
    game.dispose();
    unit.dispose();
  });
  // A run that can't start says why, as a plain error.
  const plainly = async <T>(work: () => Promise<T>) => {
    try {
      return await work();
    } catch (cause) {
      if (cause instanceof GameTestError || cause instanceof UnitTestError) throw new Error(cause.message);
      throw cause;
    }
  };

  context.registerTool("game_test", (input, call) =>
    plainly(async () => {
      const operation = (input as { operation?: unknown } | undefined)?.operation;
      if (operation === "list") return filesSummary((await game.state()).files);
      report = progress(call);
      return runSummary(await game.run({ files: files(input), source: "agent" }, call.signal));
    }),
  );

  context.registerCommand("state", async () => ({ game: await game.state(), unit: await unit.state() }));
  context.registerCommand("run", (input, call) =>
    plainly(async () => {
      report = progress(call);
      return game.run({ files: files(input), source: "person" }, call.signal);
    }),
  );
  context.registerCommand("cancel", async () => {
    await game.cancel();
    return null;
  });
  context.registerCommand("detail", async (input) => {
    const file = (input as { file?: unknown } | undefined)?.file;
    return typeof file === "string" ? ((await game.detail(file)) ?? null) : null;
  });
  context.registerCommand("capture", async (input) => {
    const { runId, captureId } = (input ?? {}) as { runId?: string; captureId?: string };
    const capture = typeof runId === "string" && typeof captureId === "string" ? game.capture(runId, captureId) : undefined;
    return capture ? { mediaType: capture.mediaType, data: capture.data } : null;
  });
  context.registerCommand("unitRun", (_input, call) => plainly(() => unit.run(call.signal)));
  context.registerCommand("unitCancel", async () => {
    await unit.cancel();
    return null;
  });
}
