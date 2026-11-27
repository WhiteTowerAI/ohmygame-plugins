// What the Launch check panel shows and asks for, apart from the page itself,
// so it can be tested without a browser.

/** Sizes as a person reads them: decimal units, as the platforms' pages mostly write them. */
export function formatBytes(bytes) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(bytes < 10 * 1000 ? 1 : 0)} KB`;
  if (bytes < 1000 * 1000 * 1000) return `${(bytes / 1000 / 1000).toFixed(bytes < 10 * 1000 * 1000 ? 2 : 1)} MB`;
  return `${(bytes / 1000 / 1000 / 1000).toFixed(2)} GB`;
}

const BYTE_METRICS = new Set(["archive", "total", "largestFile", "initial"]);

/** A check's value against its limit, such as "12.3 MB – 15.0 MB of 50 MB". */
export function describeValue(check) {
  if (check.value === undefined) return check.count !== undefined ? String(check.count) : "";
  const show = BYTE_METRICS.has(check.check) ? formatBytes : (value) => value.toLocaleString("en");
  const value = check.upper !== undefined && check.upper !== check.value ? `${show(check.value)} – ${show(check.upper)}` : show(check.value);
  return check.as ? `${value} / ${check.as}` : value;
}

export const STATUS_ORDER = { fail: 0, warn: 1, pass: 2 };

/** Findings grouped by kind, in the order a person should look at them. */
export const FINDING_ORDER = [
  "missing-file",
  "case-mismatch",
  "bare-import",
  "absolute-path",
  "insecure-request",
  "external-request",
  "unreferenced",
  "source-map",
];

export function findingGroups(scan) {
  return FINDING_ORDER.map((kind) => ({
    kind,
    items: scan.findings.filter((finding) => finding.kind === kind),
    omitted: scan.omitted?.[kind] ?? 0,
  })).filter((group) => group.items.length);
}

const FIX = {
  "missing-file": "References to files the build doesn't have",
  "case-mismatch": "References whose capitals differ from the file's (hosts such as itch.io are case-sensitive)",
  "bare-import": "Imports of package names that a browser can't load from the build",
  "absolute-path": 'Paths that start with "/", which break when the game is served from a subfolder; make them relative (for Vite, set base: "./")',
  "insecure-request": "Requests over http://",
  "external-request": "Files, fonts or libraries fetched from other sites; bundle them with the game",
  unreferenced: "Files nothing names; remove them only once you've confirmed the game never loads them by a name it builds at run time",
  "source-map": "Source maps shipped with the game; leave them out of the production build",
};

const CHECK = {
  archive: "published archive",
  total: "total size",
  files: "number of files",
  largestFile: "largest file",
  initial: "first download (before the game starts)",
  longestPath: "longest file path",
  index: "index.html at the top of the build",
  relativePaths: "relative paths only",
  externalRequests: "requests to other sites",
  references: "references to files the build has",
};

/**
 * The request the panel puts in the composer: what failed for the platforms
 * the person picked, and what the scan found. In English, as text to the agent is.
 */
export function fixPrompt(report, targets, titles) {
  const lines = [];
  const chosen = report.profiles.filter((profile) => targets.includes(profile.id));
  for (const profile of chosen) {
    const problems = profile.checks.filter((check) => check.status !== "pass" && check.check !== "references");
    if (!problems.length) continue;
    const parts = problems.map((check) => {
      const what = CHECK[check.check] ?? check.check;
      const value = describeValue(check);
      return `${what}${value ? ` ${value}` : ""}${check.level === "recommended" ? " (recommended)" : ""}`;
    });
    lines.push(`- ${titles[profile.id] ?? profile.id}: ${parts.join("; ")}`);
  }
  const groups = findingGroups(report.scan);
  const found = groups.map((group) => {
    const examples = group.items.slice(0, 5).map((item) => (item.target === item.file ? item.file : `${item.file}: ${item.target}`));
    const more = group.items.length + group.omitted - examples.length;
    return `- ${FIX[group.kind]}: ${examples.join(", ")}${more > 0 ? `, and ${more} more` : ""}`;
  });
  if (!lines.length && !found.length) return undefined;
  const names = chosen.map((profile) => titles[profile.id] ?? profile.id).join(", ");
  return [
    `The Launch check scanned this game's web build${names ? ` for ${names}` : ""}. Fix what it found, keeping the game working in OhMyGame's preview, then rebuild and say what changed.`,
    lines.length ? `\nLimits not met:\n${lines.join("\n")}` : "",
    found.length ? `\nFound in the build:\n${found.join("\n")}` : "",
    "\nSizes are measured on the built files; the first download counts what the page loads at once and, as the upper figure, every file its code names.",
  ]
    .filter(Boolean)
    .join("\n");
}
