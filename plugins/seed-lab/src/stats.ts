// What a run of many seeds says: how many can be solved, how each metric is
// spread over the solvable ones, the difficulty buckets to pick levels from,
// and the seeds worth a look (unsolvable, failed, too slow, or far outside
// the rest). Pure functions, so the panel and the agent see the same numbers.

/** One seed's outcome, as a worker reports it. */
export interface SeedResult {
  seed: number;
  /** Set when the module answered. */
  solvable?: boolean;
  metrics?: Record<string, number>;
  /** The module threw, or answered in a shape it shouldn't. */
  error?: string;
  /** It took longer than the run's limit for one seed. */
  timeout?: boolean;
  /** Milliseconds for generate and evaluate together. */
  ms?: number;
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

export interface MetricSummary {
  name: string;
  /** Solvable seeds that reported this metric. */
  count: number;
  min: number;
  p10: number;
  p50: number;
  p90: number;
  max: number;
  mean: number;
  bins: Bin[];
}

export interface Bucket {
  from: number;
  to: number;
  count: number;
  /** A few seeds from the bucket, lowest first: candidates for a level curve. */
  seeds: number[];
}

export interface Outlier {
  seed: number;
  metric: string;
  value: number;
  side: "low" | "high";
}

export interface Summary {
  total: number;
  solvable: number;
  unsolvable: number;
  errors: number;
  timeouts: number;
  /** Solvable ÷ seeds the module answered for, so failures don't count as unsolvable. */
  solvableRate: number;
  metrics: MetricSummary[];
  /** The metric buckets are made from; undefined when there are no metrics. */
  difficulty?: string;
  buckets: Bucket[];
  anomalies: {
    unsolvable: number[];
    errors: { seed: number; message: string }[];
    timeouts: number[];
    outliers: Outlier[];
  };
}

export const LIST_MAX = 50;
const BUCKET_SEEDS = 5;
const BINS = 12;
/** Tukey's "far out" fences: three interquartile ranges past the quartiles. */
const FENCE = 3;

/** The value at fraction `q` of sorted `values`, by nearest rank. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return Number.NaN;
  const rank = Math.ceil(q * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

const isInteger = (values: number[]) => values.every((value) => Number.isInteger(value));

/**
 * Bins for a histogram: one per value for whole numbers with a small range,
 * otherwise `BINS` of equal width. The last bin includes its upper end.
 */
export function histogram(values: number[], bins = BINS): Bin[] {
  if (!values.length) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (isInteger(values) && max - min < 20) {
    const counts = new Map<number, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    const out: Bin[] = [];
    for (let value = min; value <= max; value += 1) out.push({ from: value, to: value, count: counts.get(value) ?? 0 });
    return out;
  }
  if (min === max) return [{ from: min, to: max, count: values.length }];
  const width = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ from: min + i * width, to: i === bins - 1 ? max : min + (i + 1) * width, count: 0 }));
  for (const value of values) out[Math.min(bins - 1, Math.floor((value - min) / width))].count += 1;
  return out;
}

/**
 * Difficulty buckets over the solvable seeds: one per value when the metric
 * takes few whole values, otherwise five of equal width. Each keeps a few
 * seeds, so picking a level curve is picking from each bucket.
 */
export function buckets(results: SeedResult[], metric: string): Bucket[] {
  const scored = results
    .filter((result) => result.solvable && Number.isFinite(result.metrics?.[metric]))
    .map((result) => ({ seed: result.seed, value: result.metrics![metric] }))
    .sort((a, b) => a.seed - b.seed);
  if (!scored.length) return [];
  const values = scored.map((item) => item.value);
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  const ranges =
    isInteger(values) && distinct.length <= 12
      ? distinct.map((value) => ({ from: value, to: value }))
      : histogram(values, 5).map(({ from, to }) => ({ from, to }));
  return ranges.map((range, index) => {
    const last = index === ranges.length - 1;
    const inside = scored.filter((item) => item.value >= range.from && (last ? item.value <= range.to : range.from === range.to ? item.value === range.to : item.value < range.to));
    return { ...range, count: inside.length, seeds: inside.slice(0, BUCKET_SEEDS).map((item) => item.seed) };
  });
}

export function summarize(results: SeedResult[], options: { difficulty?: string } = {}): Summary {
  const answered = results.filter((result) => typeof result.solvable === "boolean" && !result.error && !result.timeout);
  const solvable = answered.filter((result) => result.solvable);
  const names = [...new Set(solvable.flatMap((result) => Object.keys(result.metrics ?? {})))].sort();
  const metrics: MetricSummary[] = [];
  const outliers: Outlier[] = [];
  for (const name of names) {
    const scored = solvable.filter((result) => Number.isFinite(result.metrics?.[name]));
    const sorted = scored.map((result) => result.metrics![name]).sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const spread = q3 - q1;
    // With no spread at all, every value off the common one would be "far out"; skip.
    if (spread > 0) {
      for (const result of scored) {
        const value = result.metrics![name];
        if (value < q1 - FENCE * spread) outliers.push({ seed: result.seed, metric: name, value, side: "low" });
        else if (value > q3 + FENCE * spread) outliers.push({ seed: result.seed, metric: name, value, side: "high" });
      }
    }
    metrics.push({
      name,
      count: sorted.length,
      min: sorted[0],
      p10: quantile(sorted, 0.1),
      p50: quantile(sorted, 0.5),
      p90: quantile(sorted, 0.9),
      max: sorted[sorted.length - 1],
      mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
      bins: histogram(sorted),
    });
  }
  const difficulty = options.difficulty && names.includes(options.difficulty) ? options.difficulty : names.includes("difficulty") ? "difficulty" : names[0];
  const bySeed = (a: { seed: number }, b: { seed: number }) => a.seed - b.seed;
  return {
    total: results.length,
    solvable: solvable.length,
    unsolvable: answered.length - solvable.length,
    errors: results.filter((result) => result.error).length,
    timeouts: results.filter((result) => result.timeout).length,
    solvableRate: answered.length ? solvable.length / answered.length : 0,
    metrics,
    difficulty,
    buckets: difficulty ? buckets(results, difficulty) : [],
    anomalies: {
      unsolvable: answered.filter((result) => !result.solvable).map((result) => result.seed).sort((a, b) => a - b).slice(0, LIST_MAX),
      errors: results.filter((result) => result.error).sort(bySeed).slice(0, LIST_MAX).map((result) => ({ seed: result.seed, message: result.error! })),
      timeouts: results.filter((result) => result.timeout).map((result) => result.seed).sort((a, b) => a - b).slice(0, LIST_MAX),
      outliers: outliers.sort(bySeed).slice(0, LIST_MAX),
    },
  };
}

const number = (value: number) => (Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const list = (seeds: number[], total: number, shown = 20) => `${seeds.slice(0, shown).join(", ")}${total > shown ? ` … (${total} in all)` : ""}`;

export interface RunInfo {
  entry: string;
  from: number;
  count: number;
  seconds: number;
  threads: number;
  file?: string;
}

/** The run as the agent reads it: short, with the seeds to look at. */
export function report(summary: Summary, run: RunInfo): string {
  const lines = [
    `Seed lab: ${run.entry}, seeds ${run.from}–${run.from + run.count - 1} (${number(run.count)}) in ${run.seconds.toFixed(1)} s on ${run.threads} ${run.threads === 1 ? "thread" : "threads"}.`,
    `Solvable ${number(summary.solvable)} (${percent(summary.solvableRate)} of the seeds the module answered for), unsolvable ${number(summary.unsolvable)}, errors ${number(summary.errors)}, timeouts ${number(summary.timeouts)}.`,
  ];
  if (summary.metrics.length) {
    lines.push("", "Metrics over the solvable seeds:", "", "| Metric | Min | p10 | Median | p90 | Max | Mean |", "|---|---|---|---|---|---|---|");
    for (const metric of summary.metrics) lines.push(`| ${metric.name} | ${[metric.min, metric.p10, metric.p50, metric.p90, metric.max, metric.mean].map(number).join(" | ")} |`);
  }
  if (summary.buckets.length) {
    lines.push("", `Difficulty buckets by ${summary.difficulty} (count, first seeds):`);
    for (const bucket of summary.buckets) lines.push(`- ${bucket.from === bucket.to ? number(bucket.from) : `${number(bucket.from)}–${number(bucket.to)}`}: ${number(bucket.count)}${bucket.seeds.length ? ` (${bucket.seeds.join(", ")})` : ""}`);
  }
  const { anomalies } = summary;
  if (summary.unsolvable) lines.push("", `Unsolvable seeds: ${list(anomalies.unsolvable, summary.unsolvable)}`);
  if (summary.errors) {
    lines.push("", "Errors:");
    for (const item of anomalies.errors.slice(0, 5)) lines.push(`- seed ${item.seed}: ${item.message}`);
    if (summary.errors > 5) lines.push(`- … ${summary.errors} in all`);
  }
  if (summary.timeouts) lines.push("", `Timed out: ${list(anomalies.timeouts, summary.timeouts)}`);
  if (anomalies.outliers.length) {
    lines.push("", "Far outside the rest (3 interquartile ranges past the quartiles):");
    for (const item of anomalies.outliers.slice(0, 10)) lines.push(`- seed ${item.seed}: ${item.metric} = ${number(item.value)} (${item.side})`);
    if (anomalies.outliers.length > 10) lines.push(`- … ${anomalies.outliers.length}${anomalies.outliers.length === LIST_MAX ? "+" : ""} in all`);
  }
  if (run.file) lines.push("", `Every seed's result, one JSON line each: ${run.file}`);
  return lines.join("\n");
}
