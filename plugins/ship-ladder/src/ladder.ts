// The ladder: three rungs a game climbs on the way to shipping, each judged
// from something observable, never from what the agent says about itself.
//
// - starts: the game opens and runs. A Game Tests run where every test passed,
//   or the plugin's own check: no console errors, no failed requests from the
//   game's own site, and something drawn on screen.
// - core: the core loop does something. The plan's coreProbe changes the
//   game's state, or the person ticks it.
// - loop: you can lose and play again. The person ticks it.

export type Rung = "starts" | "core" | "loop";
export const RUNGS: Rung[] = ["starts", "core", "loop"];

/** passed and failed come from a check; unknown means a check couldn't tell. */
export type Verdict = "passed" | "failed" | "unknown";

export interface Judgement {
  verdict: Verdict;
  /** Where it came from: Game Tests, the plugin's own check, the core probe, or the person. */
  source: "game-tests" | "check" | "probe" | "person";
  at: string;
  /** Why, in a line: the first failure, or what couldn't be told. */
  detail?: string;
}

export interface LadderState {
  version: 1;
  rungs: Partial<Record<Rung, Judgement>>;
  /** When each rung first passed, for the plugin's own record of how a project went. */
  firstPassed: Partial<Record<Rung, string>>;
  /** Jam deadlines already reminded about, so each is reminded once. */
  reminded: string[];
}

export const emptyState = (): LadderState => ({ version: 1, rungs: {}, firstPassed: {}, reminded: [] });

export function judge(state: LadderState, rung: Rung, judgement: Judgement): LadderState {
  const next: LadderState = { ...state, rungs: { ...state.rungs, [rung]: judgement }, firstPassed: { ...state.firstPassed } };
  if (judgement.verdict === "passed" && !next.firstPassed[rung]) next.firstPassed[rung] = judgement.at;
  return next;
}

/**
 * A rung's standing: a check's verdict, or for a rung the person ticks, their
 * tick. A rung is only "next" once the one before it passed.
 */
export function standing(state: LadderState): { rung: Rung; verdict: Verdict | "open"; judgement?: Judgement }[] {
  return RUNGS.map((rung) => {
    const judgement = state.rungs[rung];
    return { rung, verdict: judgement?.verdict ?? "open", judgement };
  });
}

/**
 * What a game_test call's text says about whether the game starts. Game Tests
 * puts a summary first: "N of M game tests passed." with "Cancelled: " before
 * it when stopped. Anything else, or a cut-off answer, can't be judged.
 */
export function gameTestVerdict(result: { status: string; text: string; truncated?: boolean }): { verdict: Verdict; detail?: string } {
  if (result.status !== "succeeded") return { verdict: "unknown", detail: "The game_test call failed" };
  // A long report is cut at its end; the verdict is its first line, so only a
  // failure's detail may be missing. A first line cut off can't be read.
  const [first = "", ...rest] = result.text.split("\n");
  if (result.truncated && !rest.length) return { verdict: "unknown", detail: "The game_test answer was cut off" };
  if (/^This project has no game tests yet\./.test(first)) return { verdict: "unknown", detail: "There are no game tests yet" };
  if (first.startsWith("Cancelled: ")) return { verdict: "unknown", detail: "The game tests were stopped" };
  const match = /^(\d+) of (\d+) game tests passed\.$/.exec(first.trim());
  if (!match) return { verdict: "unknown", detail: "The game_test answer wasn't in a form this plugin reads" };
  const passed = Number(match[1]);
  const total = Number(match[2]);
  if (total === 0) return { verdict: "unknown", detail: "No game tests ran" };
  if (passed === total) return { verdict: "passed", detail: `${passed} of ${total} game tests passed` };
  const failure = rest.find((line) => line.startsWith("FAILED "));
  return { verdict: "failed", detail: failure?.slice("FAILED ".length) ?? `${total - passed} of ${total} game tests failed` };
}

/** Whether a hooked tool call is Game Tests' tool, however an agent names it. */
export const isGameTestTool = (tool: string) => /(^|__|[.:/])game_test$/.test(tool);
