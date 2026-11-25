import type { GameTestFile, GameTestRun } from "./types.ts";

/** The test files as the agent reads them. */
export function filesSummary(files: GameTestFile[]): string {
  if (!files.length) return "This project has no game tests yet. The game-tests skill says what to test and how to write them in tests/game/.";
  return files.map((file) => (file.error ? `${file.file}: can't be run: ${file.error}` : `${file.file}: "${file.name}", ${file.steps} steps`)).join("\n");
}

/** A run as the agent reads it: one line per scenario and size, and the first failure's details. */
export function runSummary(run: GameTestRun): string {
  const passed = run.scenarios.filter((scenario) => scenario.status === "passed").length;
  const lines = [`${run.status === "cancelled" ? "Cancelled: " : ""}${passed} of ${run.scenarios.length} game tests passed.`];
  let detailed = false;
  for (const scenario of run.scenarios) {
    if (scenario.error) {
      lines.push(`FAILED ${scenario.file} can't be run: ${scenario.error}`);
      continue;
    }
    for (const viewport of scenario.viewports) {
      const size = `${viewport.viewport.width}x${viewport.viewport.height}`;
      const step = viewport.steps.find((item) => item.status === "failed");
      const label = `${scenario.file} "${scenario.name}" at ${size}`;
      if (viewport.status === "passed") lines.push(`passed ${label}`);
      else if (viewport.status === "cancelled") lines.push(`cancelled ${label}`);
      else lines.push(`FAILED ${label}: ${step ? `${stepLabel(step)}: ${step.failures?.join("; ")}` : viewport.error}`);
      if (viewport.status === "failed" && !detailed) {
        detailed = true;
        const logs = viewport.logs?.slice(-10).map((log) => `  [${log.level}] ${log.message.slice(0, 300)}`) ?? [];
        if (logs.length) lines.push("  Recent console messages:", ...logs);
      }
    }
  }
  if (detailed) lines.push("The Automated tests panel shows the frame where each test failed; game_use can open the game to look at it.");
  return lines.join("\n");
}

export function stepLabel(step: { index: number; setup?: boolean; player?: number; together?: number[] }): string {
  const who = step.player ? ` (player ${step.player})` : step.together ? ` (players ${step.together.join(" and ")} together)` : "";
  return `${step.setup ? "setup step" : "step"} ${step.index + 1}${who}`;
}
