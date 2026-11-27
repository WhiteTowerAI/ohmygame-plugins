import { describe, expect, it } from "vitest";
import { buckets, histogram, quantile, report, summarize, type SeedResult } from "../../plugins/seed-lab/src/stats.ts";

const solved = (seed: number, metrics: Record<string, number>): SeedResult => ({ seed, solvable: true, metrics });

describe("seed statistics", () => {
  it("takes quantiles by nearest rank", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(values, 0.1)).toBe(1);
    expect(quantile(values, 0.5)).toBe(5);
    expect(quantile(values, 0.9)).toBe(9);
    expect(quantile(values, 1)).toBe(10);
    expect(quantile([], 0.5)).toBeNaN();
  });

  it("bins small whole numbers one value each, and the rest in equal widths that end at the max", () => {
    expect(histogram([2, 2, 4])).toEqual([
      { from: 2, to: 2, count: 2 },
      { from: 3, to: 3, count: 0 },
      { from: 4, to: 4, count: 1 },
    ]);
    const wide = histogram([0, 0.5, 1.2, 99.9, 100]);
    expect(wide).toHaveLength(12);
    expect(wide.at(-1)!.to).toBe(100);
    expect(wide.reduce((sum, bin) => sum + bin.count, 0)).toBe(5);
    expect(histogram([3.5, 3.5])).toEqual([{ from: 3.5, to: 3.5, count: 2 }]);
  });

  it("buckets solvable seeds by difficulty, each value its own bucket when there are few, with the first seeds", () => {
    const results = [solved(5, { moves: 3 }), solved(1, { moves: 3 }), solved(2, { moves: 7 }), { seed: 3, solvable: false, metrics: { moves: 3 } }];
    expect(buckets(results, "moves")).toEqual([
      { from: 3, to: 3, count: 2, seeds: [1, 5] },
      { from: 7, to: 7, count: 1, seeds: [2] },
    ]);
    // Many values: five equal ranges, and every seed lands in exactly one.
    const many = Array.from({ length: 100 }, (_, seed) => solved(seed, { moves: seed * 1.5 }));
    const five = buckets(many, "moves");
    expect(five).toHaveLength(5);
    expect(five.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(100);
  });

  it("counts failures apart from unsolvable seeds, and finds seeds far outside the rest", () => {
    const results: SeedResult[] = [
      ...Array.from({ length: 40 }, (_, seed) => solved(seed, { moves: 10 + (seed % 5), easy: seed % 2 === 0 ? 1 : 0 })),
      solved(40, { moves: 200, easy: 0 }),
      { seed: 41, solvable: false, metrics: { moves: 0 } },
      { seed: 42, error: "boom" },
      { seed: 43, timeout: true },
    ];
    const summary = summarize(results, { difficulty: "moves" });
    expect(summary).toMatchObject({ total: 44, solvable: 41, unsolvable: 1, errors: 1, timeouts: 1, difficulty: "moves" });
    expect(summary.solvableRate).toBeCloseTo(41 / 42);
    expect(summary.anomalies.unsolvable).toEqual([41]);
    expect(summary.anomalies.errors).toEqual([{ seed: 42, message: "boom" }]);
    expect(summary.anomalies.timeouts).toEqual([43]);
    expect(summary.anomalies.outliers).toEqual([{ seed: 40, metric: "moves", value: 200, side: "high" }]);
    // Metrics are over solvable seeds only: the unsolvable seed's 0 moves isn't the min.
    expect(summary.metrics.find((metric) => metric.name === "moves")!.min).toBe(10);
  });

  it("picks the difficulty metric: the one asked for, else one named difficulty, else the first", () => {
    const results = [solved(1, { b: 1, difficulty: 2 }), solved(2, { b: 2, difficulty: 3 })];
    expect(summarize(results).difficulty).toBe("difficulty");
    expect(summarize(results, { difficulty: "b" }).difficulty).toBe("b");
    expect(summarize(results, { difficulty: "nope" }).difficulty).toBe("difficulty");
    expect(summarize([solved(1, { z: 1, a: 1 })]).difficulty).toBe("a");
    expect(summarize([solved(1, {})]).buckets).toEqual([]);
  });

  it("reports the run for the agent with the seeds to look at", () => {
    const summary = summarize([solved(0, { moves: 4 }), { seed: 1, solvable: false }, { seed: 2, error: "TypeError: x is undefined" }], {});
    const text = report(summary, { entry: "sim/index.ts", from: 0, count: 3, seconds: 0.4, threads: 2, file: "/data/run.jsonl" });
    expect(text).toContain("seeds 0–2 (3)");
    expect(text).toContain("Solvable 1 (50.0% of the seeds the module answered for), unsolvable 1, errors 1, timeouts 0.");
    expect(text).toContain("Unsolvable seeds: 1");
    expect(text).toContain("- seed 2: TypeError: x is undefined");
    expect(text).toContain("| moves | 4 | 4 | 4 | 4 | 4 | 4 |");
    expect(text).toContain("/data/run.jsonl");
  });
});
