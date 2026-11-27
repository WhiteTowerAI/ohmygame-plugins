import type { FindingKind, ScanResult } from "./scan.ts";

// Where a web game can be published and what each place asks of its files.
// Every number is the platform's own, with the page it is from and when that
// page was read, so a person can check it and the list can be kept current.

export type Metric = "archive" | "total" | "files" | "largestFile" | "initial" | "longestPath";
export type Level = "required" | "recommended";
export type Status = "pass" | "warn" | "fail";

export interface Limit {
  metric: Metric;
  /** The limit in bytes, files or characters. */
  max: number;
  /** How the source writes it, such as "50 MB". */
  as: string;
  level: Level;
  /** The rule as the source states it (shortened where the page is long), so a reader sees what the number means. */
  rule: string;
  source: string;
}

export interface Profile {
  id: string;
  title: { en: string; "zh-CN": string };
  /** When the sources were read, as YYYY-MM-DD. */
  checkedAt: string;
  /** Whether references must be relative, because the game is served from a subfolder. */
  relativePaths: { required: boolean; rule?: string; source?: string };
  /** What happens to requests to other sites. */
  externalRequests: { policy: "allowed" | "https-only" | "blocked"; rule?: string; source?: string };
  limits: Limit[];
  /** Where sources disagree, said plainly. */
  note?: { en: string; "zh-CN": string };
}

const MB = 1000 * 1000;
const MIB = 1024 * 1024;

const ITCH = "https://itch.io/docs/creators/html5";
const CRAZY = "https://docs.crazygames.com/requirements/technical/";
const PLAYABLES = "https://developers.google.com/youtube/gaming/playables/certification/requirements_stability";
const POKI_REQUIREMENTS = "https://developers.poki.com/guide/requirements-quality";
const POKI_ENGINES = "https://developers.poki.com/guide/web-game-engines";
const POKI_BLOG = "https://poki.com/blog/building-web-browser-games-2026";
const OHMYGAME = "https://github.com/WhiteTowerAI/ohmygame/blob/dev/docs/runtime.md#publishing";

export const PROFILES: Profile[] = [
  {
    id: "ohmygame",
    title: { en: "OhMyGame Community", "zh-CN": "OhMyGame 社区" },
    checkedAt: "2026-11-27",
    relativePaths: { required: false },
    externalRequests: { policy: "allowed" },
    limits: [
      { metric: "archive", max: 100 * MIB, as: "100 MiB", level: "required", rule: "Published ZIPs may be up to 100 MiB.", source: OHMYGAME },
      { metric: "largestFile", max: 200 * MIB, as: "200 MiB", level: "required", rule: "The matching Cloud API accepts up to 200 MiB per file", source: OHMYGAME },
      { metric: "total", max: 1024 * MIB, as: "1 GiB", level: "required", rule: "1 GiB after extraction", source: OHMYGAME },
      { metric: "files", max: 2000, as: "2,000", level: "required", rule: "and 2,000 entries", source: OHMYGAME },
    ],
  },
  {
    id: "itch",
    title: { en: "itch.io", "zh-CN": "itch.io" },
    checkedAt: "2026-11-27",
    relativePaths: {
      required: true,
      rule: "Your project is hosted on a subdirectory on our HTML CDN.",
      source: ITCH,
    },
    externalRequests: {
      policy: "https-only",
      rule: "If your project tries to load files or talk to an API on another domain, then that domain must be requested with HTTPS.",
      source: ITCH,
    },
    limits: [
      { metric: "files", max: 1000, as: "1,000", level: "required", rule: "The ZIP file should not contain more than 1,000 individual files after extraction.", source: ITCH },
      { metric: "total", max: 500 * MB, as: "500 MB", level: "required", rule: "The size of all the extracted content should not be greater than 500MB.", source: ITCH },
      { metric: "largestFile", max: 200 * MB, as: "200 MB", level: "required", rule: "The size any single extracted file should not be greater than 200MB.", source: ITCH },
      { metric: "longestPath", max: 240, as: "240", level: "required", rule: "The maximum length of a file name including path should not be greater than 240 characters long.", source: ITCH },
    ],
  },
  {
    id: "crazygames",
    title: { en: "CrazyGames", "zh-CN": "CrazyGames" },
    checkedAt: "2026-11-24",
    relativePaths: { required: true, rule: "Use relative paths only.", source: CRAZY },
    externalRequests: { policy: "allowed" },
    limits: [
      { metric: "initial", max: 50 * MB, as: "50 MB", level: "required", rule: "Initial download ≤ 50 MB", source: CRAZY },
      { metric: "initial", max: 20 * MB, as: "20 MB", level: "recommended", rule: "≤ 20 MB to appear on the mobile homepage", source: CRAZY },
      { metric: "total", max: 250 * MB, as: "250 MB", level: "required", rule: "Total size ≤ 250 MB", source: CRAZY },
      { metric: "files", max: 1500, as: "1,500", level: "required", rule: "≤ 1,500 files", source: CRAZY },
    ],
  },
  {
    id: "youtube-playables",
    title: { en: "YouTube Playables", "zh-CN": "YouTube Playables" },
    checkedAt: "2026-11-24",
    relativePaths: { required: true, rule: "Use relative paths only.", source: PLAYABLES },
    externalRequests: { policy: "allowed" },
    limits: [
      { metric: "initial", max: 30 * MIB, as: "30 MiB", level: "required", rule: "Initial bundle < 30 MiB, counted until gameReady", source: PLAYABLES },
      { metric: "initial", max: 15 * MIB, as: "15 MiB", level: "recommended", rule: "Recommended initial bundle < 15 MiB", source: PLAYABLES },
      { metric: "total", max: 250 * MIB, as: "250 MiB", level: "required", rule: "Total size < 250 MiB", source: PLAYABLES },
      { metric: "largestFile", max: 30 * MIB, as: "30 MiB", level: "required", rule: "Each file < 30 MiB (hard limit, no exceptions)", source: PLAYABLES },
      { metric: "files", max: 8000, as: "8,000", level: "required", rule: "≤ 8,000 files", source: PLAYABLES },
    ],
  },
  {
    id: "poki",
    title: { en: "Poki", "zh-CN": "Poki" },
    checkedAt: "2026-11-24",
    relativePaths: { required: false },
    externalRequests: {
      policy: "blocked",
      rule: "External requests are blocked by default, so fonts, assets and libraries must be bundled.",
      source: POKI_REQUIREMENTS,
    },
    limits: [
      { metric: "initial", max: 8 * MB, as: "8 MB", level: "recommended", rule: "Target an initial download size under 8 MB", source: POKI_BLOG },
      { metric: "initial", max: 5 * MB, as: "5 MB", level: "recommended", rule: "Initial download should not exceed 5MB and 8MB in total", source: POKI_ENGINES },
      { metric: "total", max: 8 * MB, as: "8 MB", level: "recommended", rule: "Initial download should not exceed 5MB and 8MB in total", source: POKI_ENGINES },
    ],
    note: {
      en: "Poki's pages disagree: one targets an initial download under 8 MB, its engine guide says 5 MB first and 8 MB in total. Both are shown; Poki's review decides.",
      "zh-CN": "Poki 的两处说法不一致：一处说首包目标 8 MB 以内，引擎指南说首包 5 MB、总共 8 MB。两种都列出，以 Poki 审核为准。",
    },
  },
];

export interface CheckResult {
  /** A limit's metric, or a rule: "index", "relativePaths" or "externalRequests". */
  check: Metric | "index" | "relativePaths" | "externalRequests" | "references";
  status: Status;
  level: Level;
  /** The measured value; for "initial", the least a player downloads first. */
  value?: number;
  /** For "initial", the most a player may download first: the entry and every file it names. */
  upper?: number;
  max?: number;
  as?: string;
  /** How many findings break a rule. */
  count?: number;
  rule?: string;
  source?: string;
}

export interface ProfileResult {
  id: string;
  status: Status;
  checks: CheckResult[];
}

const WORST: Record<Status, number> = { pass: 0, warn: 1, fail: 2 };
const worst = (statuses: Status[]): Status => statuses.reduce<Status>((a, b) => (WORST[b] > WORST[a] ? b : a), "pass");

/** The value a metric has for a build, and for "initial" the most it could be. */
export function measure(scan: ScanResult, metric: Metric): { value: number; upper?: number } {
  switch (metric) {
    case "archive":
      // A ZIP compresses about as well as gzip does; media doesn't compress either way.
      return { value: scan.transfer };
    case "total":
      return { value: scan.bytes };
    case "files":
      return { value: scan.files };
    case "largestFile":
      return { value: scan.largest[0]?.bytes ?? 0 };
    case "longestPath":
      return { value: scan.longestPath.length };
    case "initial":
      return { value: scan.entry.transfer, upper: scan.entry.transfer + scan.named.transfer };
  }
}

const count = (scan: ScanResult, kinds: FindingKind[]) =>
  scan.findings.filter((finding) => kinds.includes(finding.kind)).length + kinds.reduce((sum, kind) => sum + (scan.omitted[kind] ?? 0), 0);

export function evaluate(scan: ScanResult, profile: Profile): ProfileResult {
  const checks: CheckResult[] = [];
  checks.push({ check: "index", level: "required", status: scan.hasIndex ? "pass" : "fail" });
  for (const limit of profile.limits) {
    const { value, upper } = measure(scan, limit.metric);
    let status: Status = "pass";
    if (value > limit.max) status = limit.level === "required" ? "fail" : "warn";
    else if ((upper !== undefined && upper > limit.max) || value > limit.max * 0.9) status = "warn";
    checks.push({ check: limit.metric, status, level: limit.level, value, upper, max: limit.max, as: limit.as, rule: limit.rule, source: limit.source });
  }
  if (profile.relativePaths.required) {
    const absolute = count(scan, ["absolute-path"]);
    checks.push({
      check: "relativePaths",
      level: "required",
      status: absolute ? "fail" : "pass",
      count: absolute,
      rule: profile.relativePaths.rule,
      source: profile.relativePaths.source,
    });
  }
  // A reference to a file the build doesn't have breaks on every host; a
  // static reading can be wrong, so it warns rather than fails.
  const broken = count(scan, ["missing-file", "case-mismatch", "bare-import"]);
  checks.push({ check: "references", level: "required", status: broken ? "warn" : "pass", count: broken });
  const { policy } = profile.externalRequests;
  if (policy !== "allowed") {
    const external = count(scan, policy === "blocked" ? ["external-request", "insecure-request"] : ["insecure-request"]);
    checks.push({
      check: "externalRequests",
      level: "required",
      status: external ? "fail" : "pass",
      count: external,
      rule: profile.externalRequests.rule,
      source: profile.externalRequests.source,
    });
  }
  return { id: profile.id, status: worst(checks.map((check) => check.status)), checks };
}

export interface Report {
  version: 1;
  scannedAt: string;
  scan: ScanResult;
  profiles: ProfileResult[];
}

export function report(scan: ScanResult, now = new Date()): Report {
  return { version: 1, scannedAt: now.toISOString(), scan, profiles: PROFILES.map((profile) => evaluate(scan, profile)) };
}
