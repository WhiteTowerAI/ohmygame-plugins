// What the panel's buttons put in the composer for the agent. Text sent to
// the agent stays in English; the game-tests skill carries the file format
// and what to test, so a person who asks in their own words gets the same.

const DIRECTORY = "tests/game";

/** The panel's languages, named for the agent. */
const LANGUAGES = { en: "English", "zh-CN": "Simplified Chinese" };

/**
 * A test's name is what the panel lists, so it is written in the person's
 * language. This request is in English, so the agent goes by what the person
 * wrote in the conversation, then by the panel's language.
 */
const namesIn = (locale) =>
  `Write each test's name in the language the person uses in this conversation, not this request's; when they haven't written in it yet, in ${LANGUAGES[locale] ?? LANGUAGES.en}.`;

export const writePrompt = (locale) => `Write game tests for this game in ${DIRECTORY}/ as the game-tests skill says, then run them. ${namesIn(locale)}`;
export const addMorePrompt = (locale) =>
  `Add game tests for the rules and flows the tests in ${DIRECTORY}/ don't guard yet, as the game-tests skill says, then run them. ${namesIn(locale)}`;
export const WRITE_UNIT_PROMPT =
  'Add unit tests for this game\'s rules that need no screen, such as which moves are allowed, scoring and winning, with a "test" script in package.json that runs them once. Then run them. When the game is wrong, fix the game, not the test, and say what was wrong.';

export const fixFilePrompt = (file, error) =>
  `${DIRECTORY}/${file} can't be run: ${error} Fix the file as the game-tests skill says, then run game_test.`;

/** Where a step is, as the agent reads it: "step 3 (player 2)". */
export function stepName(step) {
  const who = step.player ? ` (player ${step.player})` : step.together ? ` (players ${step.together.join(" and ")} together)` : "";
  return `${step.setup ? "setup step" : "step"} ${step.index + 1}${who}`;
}

export function fixFailurePrompt(scenario, viewport) {
  const step = viewport.steps.find((item) => item.status === "failed");
  const where = step ? `${stepName(step)}: ${step.failures?.join("; ")}` : viewport.error;
  return `The game test ${DIRECTORY}/${scenario.file} ("${scenario.name}") failed at ${viewport.viewport.width}x${viewport.viewport.height}, ${where}. Find out whether the game or the test is wrong and fix that one. Change the test only when it no longer describes how the game should work, and say why. Then run game_test again.`;
}

const FAILURES_IN_PROMPT = 10;

export function fixUnitPrompt(run) {
  if (run.status === "error") return `The project's unit tests couldn't run (\`${run.command}\`): ${run.error} Fix that, then run them again.`;
  const names = run.failures?.slice(0, FAILURES_IN_PROMPT).map((failure) => failure.name) ?? [];
  const more = (run.failures?.length ?? 0) - names.length;
  const which = names.length ? `: ${names.join("; ")}${more > 0 ? ` and ${more} more` : ""}` : "";
  return `The project's unit tests failed (\`${run.command}\`)${which}. Find out whether the game or the test is wrong and fix that one. Change a test only when it no longer describes how the game should work, and say why. Then run the tests again.`;
}

/**
 * Where a file stands in the latest run. A run lists each file as it starts
 * it, so the last one listed is going and those after it wait.
 */
export function statusOf(file, run) {
  const result = run?.scenarios.find((item) => item.file === file.file);
  if (run?.status === "running" && run.files.includes(file.file)) {
    const index = run.files.indexOf(file.file);
    const current = run.scenarios.length - 1;
    if (index > current) return { status: "waiting" };
    if (index === current) return { status: "running", result };
  }
  return result ? { status: result.status, result } : { status: "none" };
}
