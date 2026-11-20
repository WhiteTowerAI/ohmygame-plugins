import { connect } from "/_ohmygame/plugin-ui.js";
import {
  WRITE_UNIT_PROMPT,
  addMorePrompt,
  fixFailurePrompt,
  fixFilePrompt,
  fixUnitPrompt,
  statusOf,
  writePrompt,
} from "./prompts.js";
import { describeStep, nothingToDo } from "./describe.js";

const TEXT = {
  en: {
    title: "Automated tests",
    games: "Playtests",
    unit: "Unit tests",
    emptyTitle: "No tests yet",
    empty: "Tests replay steps in the game and check what happens, so a change that breaks something shows up. They are kept as files in tests/game/.",
    write: "Ask the AI to write tests",
    addMore: "Ask the AI to add more tests",
    runAll: "Run all",
    runOne: (name) => `Run ${name}`,
    stop: "Stop",
    running: (current, total) => `Running ${current} of ${total}…`,
    stopped: "Stopped",
    summary: (passed, failed) => `${passed} passed, ${failed} failed`,
    notRun: (count) => `${count} tests, not run yet`,
    step: (step) => `${step.setup ? "setup step" : "step"} ${step.index + 1}`,
    failedStep: (size, step) => `At ${size}, ${step} failed`,
    failedPlayerStep: (size, step, player) => `At ${size}, ${step} failed for player ${player}`,
    failedOpen: (size) => `At ${size}, the game couldn't be tested`,
    frame: (size) => `The game at ${size} when the test stopped`,
    logs: (count) => `Console (${count})`,
    fix: "Ask the AI to fix it",
    invalid: (file) => `${file} can't be run`,
    fixFile: "Ask the AI to fix the file",
    status: { passed: "Passed", failed: "Failed", running: "Running", waiting: "Waiting", cancelled: "Stopped", none: "Not run" },
    unitEmpty: 'Unit tests check rules that need no screen, such as which moves are allowed, from a "test" script in package.json. This project has none yet.',
    unitWrite: "Ask the AI to write unit tests",
    unitRun: "Run unit tests",
    meta: (steps, players) => [`${steps} ${steps === 1 ? "step" : "steps"}`, players > 1 ? `${players} players` : null].filter(Boolean).join(" · "),
    took: (seconds) => `${seconds} s`,
    failedAt: (step, reason) => `${step.charAt(0).toUpperCase()}${step.slice(1)} failed: ${reason}`,
    unitNotRun: "Not run yet. Running them lists each test here.",
    showAll: (count) => `Show all ${count}`,
    showLess: "Show fewer",
    showTests: (summary) => `${summary}. Show each test`,
    hideTests: (summary) => `${summary}. Hide the tests`,
    showOutput: "Show output",
    hideOutput: "Hide output",
    skipped: "Skipped",
    duration: (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.max(1, Math.round(ms))} ms`),
    unitInstalling: "Installing dependencies…",
    unitRunning: "Running…",
    unitError: "The tests couldn't run",
    unitPassed: "Passed",
    unitFailed: (code) => `Failed (exit code ${code})`,
    output: "Output",
    showDetails: (name) => `Show the steps of ${name}`,
    file: "File",
    players: "Players",
    sizes: "Window sizes",
    setup: "Runs first",
    path: "Opens",
    seed: "Seed",
    steps: "Steps",
    setupSteps: (name) => `From setup ${name}`,
    loading: "Reading the test…",
    unreadable: "The test couldn't be read.",
  },
  "zh-CN": {
    title: "自动测试",
    games: "试玩测试",
    unit: "单元测试",
    emptyTitle: "还没有测试",
    empty: "测试会在游戏里重放一遍操作，并检查结果是否符合预期，改动弄坏了什么就能马上发现。测试以文件形式保存在 tests/game/。",
    write: "让 AI 写测试",
    addMore: "让 AI 补充测试",
    runAll: "全部运行",
    runOne: (name) => `运行${name}`,
    stop: "停止",
    running: (current, total) => `正在运行第 ${current} 个，共 ${total} 个…`,
    stopped: "已停止",
    summary: (passed, failed) => `${passed} 个通过，${failed} 个失败`,
    notRun: (count) => `共 ${count} 个测试，还没有运行`,
    step: (step) => `${step.setup ? "准备阶段" : ""}第 ${step.index + 1} 步`,
    failedStep: (size, step) => `在 ${size} 下，${step}失败`,
    failedPlayerStep: (size, step, player) => `在 ${size} 下，玩家 ${player} 的${step}失败`,
    failedOpen: (size) => `在 ${size} 下，游戏无法测试`,
    frame: (size) => `测试停止时 ${size} 下的游戏画面`,
    logs: (count) => `控制台（${count}）`,
    fix: "让 AI 修复",
    invalid: (file) => `${file} 无法运行`,
    fixFile: "让 AI 修复这个文件",
    status: { passed: "通过", failed: "失败", running: "运行中", waiting: "等待中", cancelled: "已停止", none: "未运行" },
    unitEmpty: "单元测试检查不需要画面的规则，比如哪些出法合法，由 package.json 里的 \"test\" 脚本运行。这个项目还没有单元测试。",
    unitWrite: "让 AI 写单元测试",
    unitRun: "运行单元测试",
    meta: (steps, players) => [`${steps} 步`, players > 1 ? `${players} 名玩家` : null].filter(Boolean).join(" · "),
    took: (seconds) => `${seconds} 秒`,
    failedAt: (step, reason) => `${step}失败：${reason}`,
    unitNotRun: "还没有运行，运行后会在这里列出每条测试。",
    showAll: (count) => `显示全部 ${count} 条`,
    showLess: "收起",
    showTests: (summary) => `${summary}，展开每条测试`,
    hideTests: (summary) => `${summary}，收起测试列表`,
    showOutput: "查看输出",
    hideOutput: "收起输出",
    skipped: "已跳过",
    duration: (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} 秒` : `${Math.max(1, Math.round(ms))} 毫秒`),
    unitInstalling: "正在安装依赖…",
    unitRunning: "正在运行…",
    unitError: "测试无法运行",
    unitPassed: "通过",
    unitFailed: (code) => `失败（退出码 ${code}）`,
    output: "输出",
    showDetails: (name) => `查看${name}的步骤`,
    file: "文件",
    players: "玩家数",
    sizes: "窗口尺寸",
    setup: "先运行",
    path: "打开路径",
    seed: "随机种子",
    steps: "步骤",
    setupSteps: (name) => `来自准备步骤 ${name}`,
    loading: "正在读取测试…",
    unreadable: "无法读取这个测试。",
  },
};

const host = await connect();
const t = TEXT[host.locale] ?? TEXT.en;
document.documentElement.lang = host.locale;
const root = document.getElementById("tests");
root.setAttribute("heading", t.title);

// `open` holds the tests whose details show; `details` their scenarios, fetched once each until files change.
const state = { game: undefined, unit: undefined, error: undefined, visible: true, frames: new Map(), open: new Set(), details: new Map(), allUnitTests: false, unitOpen: false, output: false };

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "on") for (const [event, listener] of Object.entries(value)) node.addEventListener(event, listener);
    else if (value !== undefined && value !== false) node.setAttribute(key, value === true ? "" : String(value));
  }
  return add(node, ...children);
}
/** Appends what's there: a condition that didn't hold gives null, undefined or false, which would show as text. */
function add(node, ...children) {
  node.append(...children.flat(Infinity).filter((value) => value !== undefined && value !== null && value !== false));
  return node;
}
const request = (command, input) => host.request("command.run", { command, ...(input ? { input } : {}) });
const ask = (text) => void host.request("composer.fill", { text }).catch(showError);
const button = (label, onClick, attrs = {}) => h("omg-button", { ...attrs, on: { click: onClick } }, label);
/** A button that shows only an icon, named for screen readers and in a tooltip. */
const iconButton = (icon, label, onClick, { slot, class: name, ...attrs } = {}) =>
  h(
    "omg-tooltip",
    { content: label, ...(slot ? { slot } : {}) },
    button(h("span", { "aria-hidden": "true" }, icon), onClick, { ...attrs, class: ["icon-button", name].filter(Boolean).join(" "), "aria-label": label }),
  );
/** A quiet action at the end of a section, aligned with its text. */
const link = (label, onClick) => h("button", { type: "button", class: "link", on: { click: onClick } }, label);
/** A section's line under its heading: how many passed and failed, or what is going on. */
const summary = (text, tone) => h("p", { class: `summary${tone ? ` is-${tone}` : ""}`, role: "status" }, text);
const RUN_ICON = "▶";
const STOP_ICON = "■";

function showError(error) {
  state.error = error?.message || String(error);
  render();
}

async function refresh() {
  try {
    const next = await request("state");
    // An answer that left before a run started must not hide that run.
    for (const key of ["game", "unit"]) {
      const current = state[key]?.run;
      if (current && (!next[key].run || next[key].run.startedAt < current.startedAt)) next[key].run = current;
    }
    state.game = next.game;
    state.unit = next.unit;
  } catch (error) {
    state.error = error?.message || String(error);
  }
  render();
}

/** Starts a command that waits for its run, and follows the run while it goes. */
function start(command, input) {
  state.error = undefined;
  if (command === "unit-run") state.unitOpen = state.allUnitTests = false;
  request(command, input).then(refresh, showError);
  setTimeout(refresh, 200);
}

const TONES = { passed: "good", failed: "bad", running: "busy", waiting: "neutral", cancelled: "neutral", none: "neutral" };

/** A frame the run kept, fetched once. */
function frame(runId, captureId, label) {
  const image = h("img", { class: "frame", alt: label });
  const key = `${runId}/${captureId}`;
  const show = (url) => {
    if (url) image.src = url;
  };
  if (state.frames.has(key)) show(state.frames.get(key));
  else {
    request("capture", { runId, captureId })
      .then((capture) => {
        if (!capture) return;
        const bytes = Uint8Array.from(atob(capture.data), (char) => char.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: capture.mediaType }));
        state.frames.set(key, url);
        show(url);
      })
      .catch(() => {});
  }
  return h("a", { class: "frame-link", href: "#", on: { click: (event) => event.preventDefault() } }, image);
}

function failure(run, scenario, viewport) {
  const step = viewport.steps.find((item) => item.status === "failed");
  const size = `${viewport.viewport.width}×${viewport.viewport.height}`;
  const captureId = step?.captureId ?? viewport.captureId;
  const title = step
    ? step.player
      ? t.failedPlayerStep(size, t.step(step), step.player)
      : t.failedStep(size, t.step(step))
    : t.failedOpen(size);
  return h(
    "div",
    { class: "failure" },
    h("p", { class: "failure-title" }, title),
    h("ul", { class: "reasons" }, (step?.failures ?? [viewport.error ?? ""]).map((reason) => h("li", {}, reason))),
    captureId ? frame(run.id, captureId, t.frame(size)) : null,
    viewport.logs?.length
      ? h("omg-disclosure", { heading: t.logs(viewport.logs.length) }, h("pre", { class: "log" }, viewport.logs.map((log) => `[${log.level}] ${log.message}`).join("\n")))
      : null,
    h("div", { class: "links" }, link(t.fix, () => ask(fixFailurePrompt(scenario, viewport)))),
  );
}

function toggle(file) {
  if (state.open.has(file)) state.open.delete(file);
  else {
    state.open.add(file);
    fetchDetail(file);
  }
  render();
}

function fetchDetail(file) {
  if (state.details.has(file)) return;
  state.details.set(file, "loading");
  request("detail", { file })
    .then((detail) => state.details.set(file, detail ?? null), () => state.details.set(file, null))
    .finally(render);
}

/** Each step's outcome in the latest run: the first failed size's, else the first size's. */
function stepOutcomes(result) {
  const viewport = result?.viewports.find((item) => item.status === "failed") ?? result?.viewports[0];
  return new Map((viewport?.steps ?? []).map((step) => [`${step.setup ? "setup" : "test"}:${step.index}`, step.status]));
}

function stepItem(step, key, players, outcomes) {
  const { who, does, checks } = describeStep(step, players, host.locale);
  const outcome = outcomes.get(key);
  return h(
    "li",
    { class: `step${outcome ? ` is-${outcome}` : ""}` },
    h("p", {}, who ? h("strong", {}, `${who}: `) : null, does ?? (checks.length ? null : nothingToDo(host.locale))),
    checks.length ? h("ul", { class: "checks" }, checks.map((line) => h("li", {}, line))) : null,
  );
}

function details(file, result, run) {
  const failures = result && run ? result.viewports.filter((viewport) => viewport.status === "failed").map((viewport) => failure(run, result, viewport)) : [];
  const detail = state.details.get(file.file);
  if (detail === "loading" || detail === undefined) return h("div", { class: "details" }, failures, h("p", { class: "muted" }, t.loading));
  if (!detail) return h("div", { class: "details" }, failures, h("p", { class: "muted" }, t.unreadable));
  const players = detail.players ?? 1;
  const outcomes = stepOutcomes(result);
  const facts = [
    [t.file, h("code", {}, `tests/game/${file.file}`)],
    players > 1 ? [t.players, String(players)] : null,
    [t.sizes, (file.viewports ?? []).map((size) => `${size.width}×${size.height}`).join(", ")],
    detail.setup ? [t.setup, h("code", {}, `tests/game/setup/${detail.setup}.json`)] : null,
    detail.path ? [t.path, h("code", {}, detail.path)] : null,
    detail.seed !== undefined ? [t.seed, String(detail.seed)] : null,
  ].filter(Boolean);
  return h(
    "div",
    { class: "details" },
    failures,
    h("p", { class: "full-name" }, detail.name),
    h("dl", { class: "facts" }, facts.map(([term, value]) => [h("dt", {}, term), h("dd", {}, value)])),
    detail.setupSteps?.length
      ? [h("p", { class: "steps-title" }, t.setupSteps(detail.setup)), h("ol", { class: "steps" }, detail.setupSteps.map((step, index) => stepItem(step, `setup:${index}`, players, outcomes)))]
      : null,
    h("p", { class: "steps-title" }, t.steps),
    h("ol", { class: "steps" }, detail.steps.map((step, index) => stepItem(step, `test:${index}`, players, outcomes))),
  );
}

/**
 * What a row says beside its name, kept short so a long list stays one line
 * a test: how long it took, or what it is. A failure gets a line of its own.
 */
function testNote(file, status, result) {
  if (file.error) return { problem: file.error };
  if (status === "running" || status === "waiting" || status === "cancelled") return { aside: t.status[status] };
  const viewport = result?.viewports.find((item) => item.status === "failed");
  if (viewport) {
    const step = viewport.steps.find((item) => item.status === "failed");
    return { problem: step ? t.failedAt(t.step(step), step.failures?.[0] ?? "") : (viewport.error ?? t.status.failed) };
  }
  if (status === "passed" && result) {
    const ms = result.viewports.flatMap((item) => item.steps).reduce((total, step) => total + (step.durationMs ?? 0), 0);
    return { aside: t.took((ms / 1000).toFixed(1)) };
  }
  return { aside: t.meta(file.steps ?? 0, file.players ?? 1) };
}

function testRow(file, run, running) {
  const { status: runStatus, result } = statusOf(file, run);
  const status = file.error ? "failed" : runStatus;
  const name = file.name ?? file.file;
  const open = state.open.has(file.file);
  const note = testNote(file, status, result);
  return h(
    "li",
    { class: `test is-${status}` },
    h(
      "div",
      { class: "test-row" },
      h(
        "button",
        { type: "button", class: "test-toggle", title: name, "aria-expanded": String(open), "aria-label": t.showDetails(name), on: { click: () => toggle(file.file) } },
        h("omg-status", { class: "test-status", tone: TONES[status] ?? "neutral", title: t.status[status] ?? t.status.none }, t.status[status] ?? t.status.none),
        h("span", { class: "titles" }, h("span", { class: "test-name" }, name), note.problem ? h("span", { class: "test-problem" }, note.problem) : null),
        note.aside ? h("span", { class: "test-aside" }, note.aside) : null,
      ),
      file.error ? null : iconButton(RUN_ICON, t.runOne(name), () => start("run", { files: [file.file] }), { variant: "ghost", class: "run-one", disabled: running }),
    ),
    open ? (file.error ? invalidDetails(file) : details(file, result, run)) : null,
  );
}

function invalidDetails(file) {
  return h(
    "div",
    { class: "details failure" },
    h("p", { class: "failure-title" }, t.invalid(file.file)),
    h("ul", { class: "reasons" }, h("li", {}, file.error)),
    h("div", { class: "links" }, link(t.fixFile, () => ask(fixFilePrompt(file.file, file.error)))),
  );
}

function gameSection() {
  const game = state.game;
  const section = h("omg-section", { heading: t.games });
  if (!game) return section;
  if (!game.files.length) {
    add(section, h("omg-empty", { heading: t.emptyTitle, description: t.empty }, button(t.write, () => ask(writePrompt(host.locale)), { variant: "primary" })));
    return section;
  }
  const run = game.run;
  const running = run?.status === "running";
  const finished = run && !running ? run.scenarios : [];
  const passed = finished.filter((item) => item.status === "passed").length;
  const failed = finished.filter((item) => item.status === "failed").length;
  add(
    section,
    // Running all, or stopping, sits beside the section's heading.
    running
      ? iconButton(STOP_ICON, t.stop, () => void request("cancel").then(refresh, showError), { slot: "actions", variant: "ghost" })
      : iconButton(RUN_ICON, t.runAll, () => start("run"), { slot: "actions", variant: "ghost" }),
    summary(
      running ? t.running(Math.max(1, run.scenarios.length), run.files.length) : run?.status === "cancelled" ? t.stopped : run ? t.summary(passed, failed) : t.notRun(game.files.length),
      !running && failed ? "bad" : undefined,
    ),
    h(
      "ul",
      { class: "tests" },
      game.files.map((file) => testRow(file, run, running)),
    ),
    h("div", { class: "links" }, link(t.addMore, () => ask(addMorePrompt(host.locale)))),
  );
  return section;
}

function unitSummary(run) {
  if (!run) return t.unitNotRun;
  if (run.status === "running") return run.phase === "installing" ? t.unitInstalling : t.unitRunning;
  if (run.status === "cancelled") return t.stopped;
  if (run.status === "error") return t.unitError;
  if (run.passed !== undefined && run.failed !== undefined) return t.summary(run.passed, run.failed);
  return run.status === "passed" ? t.unitPassed : t.unitFailed(run.exitCode ?? "?");
}

/** One unit test: its result, its groups before its name, and why it failed. */
function caseRow(test) {
  const status = test.status === "skipped" ? "cancelled" : test.status;
  const label = test.status === "skipped" ? t.skipped : t.status[status];
  const full = [...(test.groups ?? []), test.name].join(" › ");
  return h(
    "li",
    { class: `test is-${status}` },
    h(
      "div",
      { class: "test-line", title: full },
      h("omg-status", { class: "test-status", tone: TONES[status] ?? "neutral", title: label }, label),
      h(
        "span",
        { class: "titles" },
        h("span", { class: "test-name" }, test.groups?.length ? h("span", { class: "muted-inline" }, `${test.groups.join(" › ")} › `) : null, test.name),
        test.status === "failed" && test.message ? h("span", { class: "test-problem" }, test.message) : null,
      ),
      test.durationMs !== undefined ? h("span", { class: "test-aside" }, t.duration(test.durationMs)) : null,
    ),
  );
}

/** How many of a run's tests show before "Show all". */
const UNIT_TESTS_SHOWN = 20;

/**
 * The run's tests by file, failures first, then in the runner's order; a
 * runner that names no files gives one list. A long list shows its start.
 */
function unitTests(run) {
  const tests = run.tests ?? [];
  if (!tests.length) return null;
  const failed = tests.filter((test) => test.status === "failed");
  // Folded, the list keeps only what needs looking at: its failures.
  if (!state.unitOpen) return failed.length ? h("ul", { class: "tests" }, failed.map(caseRow)) : null;
  const ordered = [...failed, ...tests.filter((test) => test.status !== "failed")];
  const shown = state.allUnitTests ? ordered : ordered.slice(0, UNIT_TESTS_SHOWN);
  const files = new Map();
  for (const test of shown) {
    const key = test.file ?? "";
    if (!files.has(key)) files.set(key, []);
    files.get(key).push(test);
  }
  return [...files].map(([file, items]) => [file ? h("p", { class: "file-heading" }, file) : null, h("ul", { class: "tests" }, items.map(caseRow))]);
}

function unitSection() {
  const unit = state.unit;
  const section = h("omg-section", { heading: t.unit, class: "unit" });
  if (!unit) return section;
  if (!unit.script) {
    add(section, summary(t.unitEmpty), h("div", { class: "links" }, link(t.unitWrite, () => ask(WRITE_UNIT_PROMPT))));
    return section;
  }
  const run = unit.run;
  const running = run?.status === "running";
  const finished = run && !running;
  const status = !run ? "none" : run.status === "error" ? "failed" : run.status;
  add(
    section,
    running
      ? iconButton(STOP_ICON, t.stop, () => void request("unit-cancel").then(refresh, showError), { slot: "actions", variant: "ghost" })
      : iconButton(RUN_ICON, t.unitRun, () => start("unit-run"), { slot: "actions", variant: "ghost" }),
    // With its tests listed, the summary opens and folds the list, folded at first.
    finished && run.tests?.length
      ? h(
          "button",
          {
            type: "button",
            class: `summary summary-toggle${status === "failed" ? " is-bad" : ""}`,
            "aria-expanded": String(state.unitOpen),
            "aria-label": (state.unitOpen ? t.hideTests : t.showTests)(unitSummary(run)),
            on: {
              click: () => {
                state.unitOpen = !state.unitOpen;
                render();
              },
            },
          },
          h("span", { role: "status" }, unitSummary(run)),
          h("span", { class: "chevron", "aria-hidden": "true" }, "›"),
        )
      : summary(unitSummary(run), status === "failed" ? "bad" : undefined),
    finished && run.error ? h("ul", { class: "reasons" }, h("li", {}, run.error)) : null,
    finished ? unitTests(run) : null,
    // A runner whose tests this plugin can't list still names its failures.
    finished && !run.tests?.length && run.failures?.length
      ? h("ul", { class: "reasons" }, run.failures.map((item) => h("li", {}, h("strong", {}, item.name), item.message ? h("span", { class: "muted" }, ` ${item.message}`) : null)))
      : null,
    finished && state.output && run.output ? h("pre", { class: "log" }, run.output) : null,
    finished
      ? h(
          "div",
          { class: "links" },
          run.status === "failed" || run.status === "error" ? link(t.fix, () => ask(fixUnitPrompt(run))) : null,
          state.unitOpen && (run.tests?.length ?? 0) > UNIT_TESTS_SHOWN
            ? link(state.allUnitTests ? t.showLess : t.showAll(run.tests.length), () => {
                state.allUnitTests = !state.allUnitTests;
                render();
              })
            : null,
          run.output
            ? link(state.output ? t.hideOutput : t.showOutput, () => {
                state.output = !state.output;
                render();
              })
            : null,
        )
      : null,
  );
  return section;
}

function render() {
  root.replaceChildren();
  add(root, state.error ? h("omg-banner", { tone: "bad" }, state.error) : null, gameSection(), unitSection());
}

host.on("visibility", ({ visible }) => {
  state.visible = visible;
  if (visible) void refresh();
});
// After an agent's turn, or a file changes: the tests may be new.
host.on("files", () => {
  state.details.clear();
  for (const file of state.open) fetchDetail(file);
  void refresh();
});
// The agent's runs show here too, so a run going is followed wherever it started.
setInterval(() => {
  if (state.visible && (state.game?.run?.status === "running" || state.unit?.run?.status === "running")) void refresh();
}, 1000);
await refresh();
