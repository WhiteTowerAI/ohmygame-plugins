import { describe, expect, it } from "vitest";
import { PROFILES, evaluate, report, type CheckResult } from "../../plugins/launch-check/src/profiles.ts";
import { scanBuild, type ScanResult } from "../../plugins/launch-check/src/scan.ts";
import { build, viteDefault } from "./fixtures.ts";

const part = (transfer: number) => ({ files: [], bytes: transfer, transfer });
const scanOf = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  version: 1,
  files: 10,
  bytes: 1000,
  transfer: 800,
  hasIndex: true,
  longestPath: { path: "index.html", length: 10 },
  largest: [{ path: "a.png", bytes: 500 }],
  entry: part(300),
  named: part(200),
  lazy: part(0),
  unreferenced: part(0),
  findings: [],
  omitted: {},
  externalHosts: [],
  ...overrides,
});
const check = (profileId: string, scan: ScanResult, name: string, max?: number): CheckResult => {
  const result = evaluate(scan, PROFILES.find((profile) => profile.id === profileId)!);
  return result.checks.find((item) => item.check === name && (max === undefined || item.max === max))!;
};
const MB = 1000 * 1000;

describe("platform profiles", () => {
  it("say where every number comes from and when it was read", () => {
    expect(PROFILES.map((profile) => profile.id)).toEqual(["ohmygame", "itch", "crazygames", "youtube-playables", "poki"]);
    for (const profile of PROFILES) {
      expect(profile.checkedAt).toMatch(/^2026-\d\d-\d\d$/);
      expect(profile.title.en && profile.title["zh-CN"]).toBeTruthy();
      expect(profile.limits.length).toBeGreaterThan(0);
      for (const limit of profile.limits) {
        expect(limit.source).toMatch(/^https:\/\//);
        expect(limit.rule.length).toBeGreaterThan(5);
        expect(limit.max).toBeGreaterThan(0);
      }
      for (const rule of [profile.relativePaths, profile.externalRequests]) if (rule.rule) expect(rule.source).toMatch(/^https:\/\//);
    }
  });

  it("fails a required limit that's exceeded, and only warns for a recommended one", () => {
    const big = scanOf({ entry: part(51 * MB), named: part(0) });
    expect(check("crazygames", big, "initial", 50 * MB)).toMatchObject({ status: "fail", level: "required" });
    const medium = scanOf({ entry: part(21 * MB), named: part(0) });
    expect(check("crazygames", medium, "initial", 50 * MB).status).toBe("pass");
    expect(check("crazygames", medium, "initial", 20 * MB)).toMatchObject({ status: "warn", level: "recommended" });
  });

  it("warns when the first download may be over, by what the code names, or is close", () => {
    const range = scanOf({ entry: part(30 * MB), named: part(25 * MB) });
    expect(check("crazygames", range, "initial", 50 * MB)).toMatchObject({ status: "warn", value: 30 * MB, upper: 55 * MB });
    const close = scanOf({ entry: part(46 * MB), named: part(0) });
    expect(check("crazygames", close, "initial", 50 * MB).status).toBe("warn");
  });

  it("applies each platform's rules on paths and requests", () => {
    const absolute = scanOf({ findings: [{ kind: "absolute-path", file: "index.html", target: "/a.js" }] });
    expect(check("itch", absolute, "relativePaths")).toMatchObject({ status: "fail", count: 1 });
    expect(check("ohmygame", absolute, "relativePaths")).toBeUndefined();

    const fonts = scanOf({ findings: [{ kind: "external-request", file: "index.html", target: "https://fonts.googleapis.com/css" }] });
    expect(check("poki", fonts, "externalRequests").status).toBe("fail");
    expect(check("itch", fonts, "externalRequests").status).toBe("pass");

    const insecure = scanOf({ findings: [{ kind: "insecure-request", file: "index.html", target: "http://x.com/a.js" }], omitted: { "insecure-request": 2 } });
    expect(check("itch", insecure, "externalRequests")).toMatchObject({ status: "fail", count: 3 });

    const broken = scanOf({ findings: [{ kind: "missing-file", file: "index.html", target: "a.png" }] });
    expect(check("ohmygame", broken, "references")).toMatchObject({ status: "warn", count: 1 });
  });

  it("fails every platform for a build without index.html", () => {
    for (const profile of PROFILES) expect(evaluate(scanOf({ hasIndex: false }), profile).status).toBe("fail");
  });

  it("judges Vite's default build: fine for OhMyGame, not for itch.io", async () => {
    const result = report(await scanBuild(await build(viteDefault)), new Date("2026-11-27T00:00:00Z"));
    expect(result.scannedAt).toBe("2026-11-27T00:00:00.000Z");
    const status = Object.fromEntries(result.profiles.map((profile) => [profile.id, profile.status]));
    expect(status).toEqual({ ohmygame: "pass", itch: "fail", crazygames: "fail", "youtube-playables": "fail", poki: "pass" });
  });
});
