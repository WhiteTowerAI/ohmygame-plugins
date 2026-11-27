// What the Seed lab page shows, as pure functions the tests can check.

export const DEFAULTS = { entry: "sim/index.ts", from: 0, count: 1000, difficulty: "", timeoutMs: 5000, params: "" };

/**
 * The run's input from the form's text, or `{ error }` naming the field that's
 * wrong. Empty fields fall back to the defaults the native side uses.
 */
export function readForm(form) {
  const input = {};
  const entry = String(form.entry ?? "").trim();
  if (entry) input.entry = entry;
  for (const [name, min, max] of [["from", 0, Number.MAX_SAFE_INTEGER], ["count", 1, 100_000], ["timeoutMs", 100, 600_000]]) {
    const text = String(form[name] ?? "").trim();
    if (!text) continue;
    const value = Number(text);
    if (!Number.isInteger(value) || value < min || value > max) return { error: name };
    input[name] = value;
  }
  const difficulty = String(form.difficulty ?? "").trim();
  if (difficulty) input.difficulty = difficulty;
  const params = String(form.params ?? "").trim();
  if (params) {
    try {
      const value = JSON.parse(params);
      if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "params" };
      input.params = value;
    } catch {
      return { error: "params" };
    }
  }
  return { input };
}

export function formatNumber(value, locale) {
  return Number.isInteger(value) ? value.toLocaleString(locale) : value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

export function formatPercent(value, locale) {
  return value.toLocaleString(locale, { style: "percent", maximumFractionDigits: 1 });
}

/** A bin or bucket's range as text: one value, or from–to. */
export function rangeLabel({ from, to }, locale) {
  return from === to ? formatNumber(from, locale) : `${formatNumber(from, locale)}–${formatNumber(to, locale)}`;
}

/** Bar heights as fractions of the tallest, with a sliver for any non-zero bin so it never looks empty. */
export function barHeights(bins) {
  const max = Math.max(0, ...bins.map((bin) => bin.count));
  return bins.map((bin) => (bin.count === 0 || max === 0 ? 0 : Math.max(0.02, bin.count / max)));
}

/**
 * A metric that only ever took 0 and 1 (a yes/no, such as "needs the overflow"):
 * the number of seeds where it was 1, or undefined for a measure.
 */
export function flagCount(metric) {
  if (metric.min < 0 || metric.max > 1 || !metric.bins.every((bin) => bin.from === bin.to && (bin.from === 0 || bin.from === 1))) return undefined;
  return metric.bins.find((bin) => bin.from === 1)?.count ?? 0;
}

/** Whether the run found anything worth asking the AI about. */
export function hasProblems(summary) {
  return summary.unsolvable + summary.errors + summary.timeouts + summary.anomalies.outliers.length > 0;
}

/** The message for the AI about a run's problems. English, as instructions to the agent are. */
export function fixPrompt(run) {
  const { summary } = run;
  const lines = [`The seed lab ran ${run.entry} on seeds ${run.from}–${run.from + run.count - 1}: ${summary.solvable} of ${summary.total} solvable (${(summary.solvableRate * 100).toFixed(1)}% of those that answered).`];
  if (summary.unsolvable) lines.push(`Unsolvable (${summary.unsolvable}): ${summary.anomalies.unsolvable.slice(0, 20).join(", ")}${summary.unsolvable > 20 ? ", …" : ""}.`);
  if (summary.errors) lines.push(`Errors (${summary.errors}): ${summary.anomalies.errors.slice(0, 5).map((item) => `seed ${item.seed}: ${item.message}`).join("; ")}.`);
  if (summary.timeouts) lines.push(`Timed out (${summary.timeouts}): ${summary.anomalies.timeouts.slice(0, 20).join(", ")}.`);
  if (summary.anomalies.outliers.length) lines.push(`Far outside the rest: ${summary.anomalies.outliers.slice(0, 10).map((item) => `seed ${item.seed} ${item.metric}=${item.value}`).join(", ")}.`);
  lines.push(
    "Look at a few of these seeds and find out why: a generator bug, a solver bug, or levels the game shouldn't offer. Fix the cause, not the seeds, then run seedlab_run again on the same range and say how the numbers changed.",
  );
  return lines.join("\n");
}

/** The message for the AI when the project has no simulation module yet. */
export function setupPrompt(entry = DEFAULTS.entry) {
  return `Set this game up for the seed lab, following the seed-lab skill: move the level generator and solver, unchanged, into ${entry} exporting generate(seed, params) and evaluate(level, params) → { solvable, metrics }, make the game import them from there, then run seedlab_run on 2,000 seeds and tell me what it found.`;
}
