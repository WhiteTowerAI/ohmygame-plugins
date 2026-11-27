import { connect } from "/_ohmygame/plugin-ui.js";
import { STATUS_ORDER, describeValue, findingGroups, fixPrompt, formatBytes } from "./format.js";

const TEXT = {
  en: {
    title: "Launch check",
    description: "Before publishing the web build somewhere else, check it against each platform's limits. The scan builds the game and reads its files; it changes nothing.",
    scan: "Scan the web build",
    rescan: "Scan again",
    scanning: "Building and reading the game…",
    scannedAt: (date) => `Last scanned ${date}`,
    emptyTitle: "Not scanned yet",
    empty: "A scan takes as long as Export web build, then a few seconds.",
    platforms: "Platforms",
    platformsHint: "Tick where you plan to publish; the request to the AI covers those.",
    status: { pass: "Meets the limits", warn: "Check", fail: "Doesn't meet" },
    checkStatus: { pass: "OK", warn: "Check", fail: "Fails" },
    recommended: "recommended",
    source: "Source",
    checkedAt: (date) => `Limits read ${date}`,
    checks: {
      archive: "Published archive (estimated)",
      total: "Total size",
      files: "Files",
      largestFile: "Largest file",
      initial: "First download",
      longestPath: "Longest file path (characters)",
      index: "index.html at the top",
      relativePaths: 'Paths starting with "/"',
      externalRequests: "Requests to other sites",
      references: "Broken references",
    },
    download: "What a player downloads",
    downloadHint: "The first download is what the page loads at once; the higher figure adds every file its code names, which most games load before play starts. Text is counted compressed, as hosts send it.",
    entry: "First download",
    later: "Loaded later (split-off code)",
    unused: "Not named anywhere",
    total: "Whole build",
    files: (count) => `${count.toLocaleString("en")} files`,
    largest: "Largest files",
    findings: "Found in the build",
    noFindings: "Nothing that breaks on other hosts.",
    kinds: {
      "missing-file": "Files that aren't in the build",
      "case-mismatch": "Capitals differ from the file's",
      "bare-import": "Package imports a browser can't load",
      "absolute-path": 'Paths starting with "/"',
      "insecure-request": "Requests over http://",
      "external-request": "Requests to other sites",
      unreferenced: "Files nothing names",
      "source-map": "Source maps",
    },
    unusedNote: "A game can build a file's name at run time, such as \"enemy\" + n + \".png\"; check before removing.",
    more: (count) => `and ${count} more`,
    fix: "Ask the AI to fix these",
    nothingToFix: "Nothing to fix for the platforms you ticked.",
    note: "Note",
    details: "Limits and results",
  },
  "zh-CN": {
    title: "发布前检查",
    description: "把网页构建发到别处之前，对照各平台的限制检查一遍。扫描会构建游戏并读取文件，不改任何东西。",
    scan: "扫描网页构建",
    rescan: "重新扫描",
    scanning: "正在构建并读取游戏…",
    scannedAt: (date) => `上次扫描：${date}`,
    emptyTitle: "还没有扫描",
    empty: "扫描所需时间和“导出网页构建”差不多，之后再读几秒。",
    platforms: "平台",
    platformsHint: "勾选你打算发布的地方，让 AI 修复时只针对这些平台。",
    status: { pass: "符合限制", warn: "需要留意", fail: "不符合" },
    checkStatus: { pass: "通过", warn: "留意", fail: "不通过" },
    recommended: "建议",
    source: "出处",
    checkedAt: (date) => `限制读取于 ${date}`,
    checks: {
      archive: "发布压缩包（估算）",
      total: "总大小",
      files: "文件数",
      largestFile: "最大的文件",
      initial: "首包",
      longestPath: "最长文件路径（字符）",
      index: "顶层有 index.html",
      relativePaths: "以“/”开头的路径",
      externalRequests: "对其他网站的请求",
      references: "失效的引用",
    },
    download: "玩家要下载什么",
    downloadHint: "首包是页面一打开就加载的内容；较大的数字再加上代码里点名的全部文件，大多数游戏在开始前就会加载它们。文本按主机压缩后的大小计算。",
    entry: "首包",
    later: "之后加载（拆分出去的代码）",
    unused: "没有任何地方点名",
    total: "整个构建",
    files: (count) => `${count.toLocaleString("zh-CN")} 个文件`,
    largest: "最大的文件",
    findings: "构建里发现的问题",
    noFindings: "没有发现放到别的主机上会出错的地方。",
    kinds: {
      "missing-file": "构建里没有的文件",
      "case-mismatch": "大小写和文件不一致",
      "bare-import": "浏览器无法加载的包名导入",
      "absolute-path": "以“/”开头的路径",
      "insecure-request": "通过 http:// 的请求",
      "external-request": "对其他网站的请求",
      unreferenced: "没有任何地方点名的文件",
      "source-map": "Source map",
    },
    unusedNote: "游戏可能在运行时拼出文件名，比如 \"enemy\" + n + \".png\"，删除前请确认。",
    more: (count) => `还有 ${count} 个`,
    fix: "让 AI 修复这些问题",
    nothingToFix: "你勾选的平台没有需要修复的地方。",
    note: "说明",
    details: "限制和结果",
  },
};

const PROFILE_TITLES = {
  ohmygame: { en: "OhMyGame Community", "zh-CN": "OhMyGame 社区" },
  itch: { en: "itch.io", "zh-CN": "itch.io" },
  crazygames: { en: "CrazyGames", "zh-CN": "CrazyGames" },
  "youtube-playables": { en: "YouTube Playables", "zh-CN": "YouTube Playables" },
  poki: { en: "Poki", "zh-CN": "Poki" },
};
const PROFILE_NOTES = {
  poki: {
    en: "Poki's pages disagree: one targets an initial download under 8 MB, its engine guide says 5 MB first and 8 MB in total. Both are shown; Poki's review decides.",
    "zh-CN": "Poki 的两处说法不一致：一处说首包目标 8 MB 以内，引擎指南说首包 5 MB、总共 8 MB。两种都列出，以 Poki 审核为准。",
  },
};
const DEFAULT_TARGETS = ["ohmygame", "itch"];
const TONE = { pass: "good", warn: "warning", fail: "bad" };

const host = await connect();
const locale = TEXT[host.locale] ? host.locale : "en";
const t = TEXT[locale];
document.documentElement.lang = locale;
const root = document.getElementById("launch");
root.setAttribute("heading", t.title);
root.setAttribute("description", t.description);

const state = { report: undefined, busy: false, error: undefined, targets: DEFAULT_TARGETS };

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "on") for (const [event, listener] of Object.entries(value)) node.addEventListener(event, listener);
    else if (value !== undefined && value !== false) node.setAttribute(key, value === true ? "" : String(value));
  }
  node.append(...children.flat(Infinity).filter((value) => value !== undefined && value !== null && value !== false));
  return node;
}
const run = (command) => host.request("command.run", { command });
const titleOf = (id) => PROFILE_TITLES[id]?.[locale] ?? id;
const dateOf = (iso) => new Date(iso).toLocaleString(locale);
const source = (url) =>
  h("a", { class: "source", href: url, on: { click: (event) => {
    event.preventDefault();
    host.request("browser.open", { url }).catch(() => {});
  } } }, t.source);

async function scan() {
  if (state.busy) return;
  state.busy = true;
  state.error = undefined;
  render();
  try {
    state.report = await run("scan");
  } catch (error) {
    state.error = error?.message || String(error);
  } finally {
    state.busy = false;
    render();
  }
}

function toggleTarget(id, on) {
  state.targets = on ? [...new Set([...state.targets, id])] : state.targets.filter((item) => item !== id);
  host.request("storage.set", { key: "targets", value: state.targets }).catch(() => {});
  render();
}

function platformSection(report) {
  const profiles = [...report.profiles].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return h(
    "omg-section",
    { heading: t.platforms, description: t.platformsHint },
    profiles.map((profile) => {
      const checks = [...profile.checks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
      const note = PROFILE_NOTES[profile.id]?.[locale];
      return h(
        "div",
        { class: "profile", "data-profile": profile.id },
        h(
          "div",
          { class: "platform" },
          h("omg-checkbox", {
            label: titleOf(profile.id),
            checked: state.targets.includes(profile.id),
            on: { change: (event) => toggleTarget(profile.id, event.target.checked ?? event.detail?.checked) },
          }),
          h("omg-badge", { tone: TONE[profile.status] }, t.status[profile.status]),
        ),
        h(
          "omg-disclosure",
          { heading: t.details },
          h(
            "ul",
            { class: "checks" },
            checks.map((check) =>
              h(
                "li",
                { class: "check", "data-check": check.check },
                h("omg-status", { tone: TONE[check.status] }, t.checkStatus[check.status]),
                h(
                  "span",
                  {},
                  `${t.checks[check.check] ?? check.check}${check.level === "recommended" ? ` (${t.recommended})` : ""}`,
                  " ",
                  h("span", { class: "value" }, describeValue(check)),
                ),
                check.rule ? h("span", { class: "rule" }, `“${check.rule}” `, check.source ? source(check.source) : null) : null,
              ),
            ),
          ),
          note ? h("p", { class: "muted" }, `${t.note}: ${note}`) : null,
        ),
      );
    }),
  );
}

function downloadSection(scan) {
  const range = scan.named.transfer ? `${formatBytes(scan.entry.transfer)} – ${formatBytes(scan.entry.transfer + scan.named.transfer)}` : formatBytes(scan.entry.transfer);
  const row = (label, value) => [h("span", {}, label), h("span", {}, value)];
  return h(
    "omg-section",
    { heading: t.download, description: t.downloadHint },
    h(
      "div",
      { class: "figures" },
      row(t.entry, range),
      row(t.later, formatBytes(scan.lazy.transfer)),
      row(t.unused, formatBytes(scan.unreferenced.bytes)),
      row(t.total, `${formatBytes(scan.bytes)} · ${t.files(scan.files)}`),
    ),
    h(
      "omg-disclosure",
      { heading: t.largest },
      h("ul", { class: "items" }, scan.largest.map((file) => h("li", {}, `${formatBytes(file.bytes)}  ${file.path}`))),
    ),
  );
}

function findingsSection(scan) {
  const groups = findingGroups(scan);
  return h(
    "omg-section",
    { heading: t.findings },
    groups.length
      ? groups.map((group) =>
          h(
            "omg-disclosure",
            { heading: `${t.kinds[group.kind]} (${group.items.length + group.omitted})`, "data-kind": group.kind },
            group.kind === "unreferenced" ? h("p", { class: "muted" }, t.unusedNote) : null,
            h(
              "ul",
              { class: "items" },
              group.items.map((item) => h("li", {}, item.target === item.file ? item.file : `${item.file} → ${item.target}`)),
              group.omitted ? h("li", {}, t.more(group.omitted)) : null,
            ),
          ),
        )
      : h("p", { class: "muted" }, t.noFindings),
  );
}

function render() {
  const report = state.report;
  const titles = Object.fromEntries(Object.keys(PROFILE_TITLES).map((id) => [id, PROFILE_TITLES[id].en]));
  const prompt = report ? fixPrompt(report, state.targets, titles) : undefined;
  const children = [
    h(
      "div",
      { class: "toolbar" },
      h("omg-button", { variant: report ? "secondary" : "primary", busy: state.busy, on: { click: scan } }, report ? t.rescan : t.scan),
      report && !state.busy ? h("span", { class: "muted" }, t.scannedAt(dateOf(report.scannedAt))) : null,
      state.busy ? h("span", { class: "muted", role: "status" }, t.scanning) : null,
    ),
    state.error ? h("omg-banner", { tone: "bad" }, state.error) : null,
    report
      ? [
          platformSection(report),
          downloadSection(report.scan),
          findingsSection(report.scan),
          h(
            "div",
            { class: "toolbar" },
            prompt
              ? h("omg-button", { variant: "primary", on: { click: () => host.request("composer.fill", { text: prompt }).catch((error) => {
                  state.error = error?.message || String(error);
                  render();
                }) } }, t.fix)
              : h("span", { class: "muted" }, t.nothingToFix),
          ),
        ]
      : state.busy
        ? null
        : h("omg-empty", { heading: t.emptyTitle, description: t.empty }),
  ];
  root.replaceChildren(...children.flat().filter(Boolean));
}

// A panel opened from the Publish menu or the Game panel scans at once.
const wantsScan = (opened) => Boolean(opened && typeof opened === "object" && opened.scan);
host.on?.("open", ({ state: opened }) => {
  if (wantsScan(opened)) void scan();
});

try {
  const saved = await host.request("storage.get", { key: "targets" });
  if (Array.isArray(saved)) state.targets = saved.filter((id) => typeof id === "string");
} catch {
  // Keep the defaults.
}
try {
  state.report = (await run("last")) ?? undefined;
} catch (error) {
  state.error = error?.message || String(error);
}
render();
if (wantsScan(host.opened)) void scan();

