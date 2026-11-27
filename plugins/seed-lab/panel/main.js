import { connect } from "/_ohmygame/plugin-ui.js";
import { barHeights, DEFAULTS, fixPrompt, flagCount, formatNumber, formatPercent, hasProblems, rangeLabel, readForm, setupPrompt } from "./format.js";

const TEXT = {
  en: {
    title: "Seed lab",
    description: "Runs many seeds through the game's level generator and solver, the simulation module, and shows how many levels can be solved and how hard they are. It only reads the project.",
    setup: "Run",
    entry: "Simulation module",
    entryHint: "Exports generate(seed, params) and evaluate(level, params). The seed-lab Skill explains it.",
    from: "First seed",
    count: "Seeds",
    difficulty: "Difficulty metric",
    difficultyHint: "Buckets use it. Empty: a metric named difficulty, or the first one.",
    timeout: "Time limit per seed (ms)",
    params: "Params (JSON object)",
    run: "Run seeds",
    running: "Running…",
    invalid: { from: "The first seed must be a whole number, 0 or more.", count: "Seeds must be a whole number from 1 to 100,000.", timeoutMs: "The time limit must be a whole number from 100 to 600,000 ms.", params: "Params must be a JSON object, like {\"size\": 7}." },
    failed: "The run didn't finish",
    noModule: "There's no simulation module yet. The AI can split the generator and solver out of the game into one.",
    askSetup: "Ask the AI to set it up",
    emptyTitle: "No runs yet",
    empty: "Run a few thousand seeds after each change to the generator. The AI can run it too, with the seedlab_run tool.",
    lastRun: (entry, from, to, when) => `${entry}, seeds ${from}–${to}, ${when}`,
    took: (seconds, threads) => `${seconds.toFixed(1)} s on ${threads} ${threads === 1 ? "thread" : "threads"}`,
    solvable: "Solvable",
    solvableOf: (count) => `${count} of the seeds that answered`,
    seeds: "Seeds",
    unsolvable: "Unsolvable",
    errors: "Errors",
    timeouts: "Timed out",
    askFix: "Ask the AI to look at these seeds",
    metrics: "Metrics",
    metricsHint: "Over the solvable seeds. Each chart counts seeds by value.",
    spread: (m) => `Median ${m.p50} · middle 80% ${m.p10}–${m.p90} · all ${m.min}–${m.max} · mean ${m.mean}`,
    flags: "Yes or no",
    flag: (share, count, total) => `${share} of solvable seeds (${count} of ${total})`,
    bar: (range, count) => `${range}: ${count} ${count === "1" ? "seed" : "seeds"}`,
    tallest: (count) => `Tallest bar: ${count} seeds`,
    buckets: (metric) => `Difficulty by ${metric}`,
    bucketsHint: "Solvable seeds by difficulty, with the first few of each: pick levels from easy to hard.",
    range: "Value",
    seedsColumn: "First seeds",
    noMetrics: "The module reports no metrics, so there's nothing to chart. Add some to evaluate(), such as moves or deadEnds.",
    look: "Seeds worth a look",
    outliers: "Far outside the rest",
    outlierHint: "Three interquartile ranges past the quartiles.",
    nothing: "Nothing unsolvable, failing, slow or far out.",
    more: (shown, total) => `First ${shown} of ${total}`,
    file: "Every seed's result",
  },
  "zh-CN": {
    title: "种子实验台",
    description: "把游戏的关卡生成器和求解器（模拟模块）跑上很多个种子，看多少关能解、难度怎么分布。只读项目。",
    setup: "运行",
    entry: "模拟模块",
    entryHint: "导出 generate(seed, params) 和 evaluate(level, params)。seed-lab Skill 有说明。",
    from: "起始种子",
    count: "种子数",
    difficulty: "难度指标",
    difficultyHint: "按它分桶。留空：用名为 difficulty 的指标，否则用第一个。",
    timeout: "单个种子时限（毫秒）",
    params: "参数（JSON 对象）",
    run: "跑种子",
    running: "正在运行…",
    invalid: { from: "起始种子要是 0 或更大的整数。", count: "种子数要是 1 到 100,000 的整数。", timeoutMs: "时限要是 100 到 600,000 毫秒的整数。", params: "参数要是 JSON 对象，比如 {\"size\": 7}。" },
    failed: "运行没有完成",
    noModule: "还没有模拟模块。AI 可以把生成器和求解器从游戏里拆出来。",
    askSetup: "让 AI 来拆",
    emptyTitle: "还没跑过",
    empty: "每次改完生成器跑几千个种子。AI 也能用 seedlab_run 工具自己跑。",
    lastRun: (entry, from, to, when) => `${entry}，种子 ${from}–${to}，${when}`,
    took: (seconds, threads) => `${seconds.toFixed(1)} 秒，${threads} 个线程`,
    solvable: "可解",
    solvableOf: (count) => `${count} 个，按有结果的种子算`,
    seeds: "种子",
    unsolvable: "不可解",
    errors: "报错",
    timeouts: "超时",
    askFix: "让 AI 看看这些种子",
    metrics: "指标",
    metricsHint: "只统计可解的种子。每张图按取值数种子。",
    spread: (m) => `中位数 ${m.p50} · 中间 80% ${m.p10}–${m.p90} · 全部 ${m.min}–${m.max} · 平均 ${m.mean}`,
    flags: "是或否",
    flag: (share, count, total) => `占可解种子的 ${share}（${total} 个中 ${count} 个）`,
    bar: (range, count) => `${range}：${count} 个种子`,
    tallest: (count) => `最高的柱：${count} 个种子`,
    buckets: (metric) => `按 ${metric} 分难度`,
    bucketsHint: "可解种子按难度分组，每组列出前几个：从易到难挑关。",
    range: "取值",
    seedsColumn: "前几个种子",
    noMetrics: "模块没有报告指标，没有可画的。在 evaluate() 里加一些，比如 moves 或 deadEnds。",
    look: "值得看一眼的种子",
    outliers: "远离其他种子",
    outlierHint: "超出四分位数三个四分位距。",
    nothing: "没有不可解、报错、太慢或离群的种子。",
    more: (shown, total) => `共 ${total} 个，列出前 ${shown} 个`,
    file: "每个种子的结果",
  },
};

const host = await connect();
const locale = TEXT[host.locale] ? host.locale : "en";
const t = TEXT[locale];
document.documentElement.lang = locale;
const root = document.getElementById("lab");
root.setAttribute("heading", t.title);
root.setAttribute("description", t.description);
const tooltip = document.getElementById("tooltip");

const state = { run: undefined, busy: false, progress: "", error: undefined, invalid: undefined, form: { ...DEFAULTS } };

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "on") for (const [event, listener] of Object.entries(value)) node.addEventListener(event, listener);
    else if (value !== undefined && value !== false) node.setAttribute(key, value === true ? "" : String(value));
  }
  node.append(...children.flat(Infinity).filter((value) => value !== undefined && value !== null && value !== false));
  return node;
}
const n = (value) => formatNumber(value, locale);
const ask = (text) => host.request("composer.fill", { text }).catch(() => {});

// The chart's colour follows the app's light or dark surface.
function scheme() {
  const surface = getComputedStyle(document.documentElement).getPropertyValue("--color-surface").trim();
  const match = /^#([0-9a-f]{6})$/i.exec(surface);
  const dark = match ? parseInt(match[1].slice(0, 2), 16) + parseInt(match[1].slice(2, 4), 16) + parseInt(match[1].slice(4, 6), 16) < 384 : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.scheme = dark ? "dark" : "light";
}
scheme();
new MutationObserver(scheme).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-appearance"] });

function field(name, label, hint, type = "text") {
  const input = h(type === "textarea" ? "omg-textarea" : "omg-input", {
    label,
    "data-field": name,
    value: String(state.form[name] ?? ""),
    ...(type === "number" ? { type: "number", min: name === "count" ? 1 : 0 } : {}),
    ...(type === "textarea" ? { rows: 2, placeholder: '{"size": 7}' } : {}),
    on: { input: (event) => (state.form[name] = event.target.value ?? "") },
  });
  return h("div", { class: "field" }, input, hint ? h("p", { class: "muted" }, hint) : null);
}

async function runSeeds() {
  if (state.busy) return;
  const { input, error } = readForm(state.form);
  state.invalid = error;
  if (error) return render();
  state.busy = true;
  state.error = undefined;
  state.progress = "";
  host.request("storage.set", { key: "form", value: state.form }).catch(() => {});
  render();
  try {
    state.run = await host.request("command.run", { command: "run", input });
  } catch (cause) {
    state.error = cause?.message || String(cause);
  } finally {
    state.busy = false;
    render();
  }
}

function form() {
  return h(
    "omg-section",
    { heading: t.setup },
    h(
      "omg-grid",
      { min: 160, gap: 3 },
      field("entry", t.entry, t.entryHint),
      field("from", t.from, undefined, "number"),
      field("count", t.count, undefined, "number"),
      field("difficulty", t.difficulty, t.difficultyHint),
      field("timeoutMs", t.timeout, undefined, "number"),
    ),
    field("params", t.params, undefined, "textarea"),
    state.invalid ? h("omg-banner", { tone: "bad" }, t.invalid[state.invalid]) : null,
    h(
      "div",
      { class: "toolbar" },
      h("omg-button", { variant: "primary", busy: state.busy, disabled: state.busy, on: { click: runSeeds } }, state.busy ? t.running : t.run),
      state.busy ? h("omg-status", { tone: "busy" }, state.progress || t.running) : null,
    ),
  );
}

function errorBanner() {
  const missing = /There is no .* in this project/.test(state.error);
  return h(
    "omg-banner",
    { tone: missing ? "warning" : "bad", heading: t.failed },
    missing ? h("p", {}, t.noModule) : h("p", { class: "message" }, state.error),
    missing ? h("omg-button", { slot: "actions", variant: "primary", on: { click: () => ask(setupPrompt(readForm(state.form).input?.entry)) } }, t.askSetup) : null,
  );
}

function tile(label, value, note, tone) {
  return h("div", { class: "tile", "data-tone": tone }, h("p", { class: "tile-label" }, label), h("p", { class: "tile-value" }, value), note ? h("p", { class: "muted" }, note) : null);
}

function summaryTiles(run) {
  const { summary } = run;
  return h(
    "div",
    { class: "tiles" },
    tile(t.solvable, formatPercent(summary.solvableRate, locale), t.solvableOf(n(summary.solvable))),
    tile(t.seeds, n(summary.total)),
    tile(t.unsolvable, n(summary.unsolvable), undefined, summary.unsolvable ? "warning" : undefined),
    tile(t.errors, n(summary.errors), undefined, summary.errors ? "bad" : undefined),
    tile(t.timeouts, n(summary.timeouts), undefined, summary.timeouts ? "bad" : undefined),
  );
}

function showTip(target, text) {
  tooltip.textContent = text;
  tooltip.hidden = false;
  const box = target.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  tooltip.style.left = `${Math.max(4, Math.min(window.innerWidth - width - 4, box.left + box.width / 2 - width / 2))}px`;
  tooltip.style.top = `${Math.max(4, box.top - tooltip.offsetHeight - 6)}px`;
}
const hideTip = () => (tooltip.hidden = true);

/** One metric's histogram: columns from one baseline, a tooltip on hover and focus, the range under it. */
function histogram(metric) {
  const heights = barHeights(metric.bins);
  const tallest = Math.max(...metric.bins.map((bin) => bin.count));
  return h(
    "figure",
    { class: "chart", "data-metric": metric.name },
    h("figcaption", {}, h("span", { class: "chart-title" }, metric.name), h("span", { class: "muted" }, t.tallest(n(tallest)))),
    h(
      "div",
      { class: "bars", role: "list", style: `--bins: ${metric.bins.length}` },
      metric.bins.map((bin, index) => {
        const label = t.bar(rangeLabel(bin, locale), n(bin.count));
        const show = (event) => showTip(event.currentTarget, label);
        return h(
          "div",
          { class: "slot", role: "listitem", tabindex: 0, "aria-label": label, on: { pointerenter: show, focus: show, pointerleave: hideTip, blur: hideTip } },
          h("div", { class: "bar", style: `height: ${(heights[index] * 100).toFixed(1)}%` }),
        );
      }),
    ),
    h("div", { class: "axis" }, h("span", {}, n(metric.bins[0].from)), h("span", {}, n(metric.bins[metric.bins.length - 1].to))),
    // The chart's numbers as text: what a table would say, readable at panel width.
    h("p", { class: "muted spread" }, t.spread(Object.fromEntries(["min", "p10", "p50", "p90", "max", "mean"].map((key) => [key, n(metric[key])])))),
  );
}

function table(label, columns, rows) {
  const element = h("omg-table", { label });
  element.columns = columns;
  element.rows = rows;
  return element;
}

function metricsSection(run) {
  const { metrics } = run.summary;
  if (!metrics.length) return h("omg-section", { heading: t.metrics }, h("p", { class: "muted" }, t.noMetrics));
  const flags = metrics.filter((metric) => flagCount(metric) !== undefined);
  const measures = metrics.filter((metric) => flagCount(metric) === undefined);
  return h(
    "omg-section",
    { heading: t.metrics, description: t.metricsHint },
    measures.length ? h("div", { class: "charts" }, measures.map(histogram)) : null,
    flags.length
      ? h(
          "div",
          { class: "flags" },
          h("p", { class: "chart-title" }, t.flags),
          h(
            "dl",
            {},
            flags.flatMap((metric) => {
              const count = flagCount(metric);
              return [h("dt", {}, metric.name), h("dd", { "data-flag": metric.name }, t.flag(formatPercent(count / metric.count, locale), n(count), n(metric.count)))];
            }),
          ),
        )
      : null,
  );
}

function bucketsSection(run) {
  const { summary } = run;
  if (!summary.buckets.length) return null;
  return h(
    "omg-section",
    { heading: t.buckets(summary.difficulty), description: t.bucketsHint },
    table(
      t.buckets(summary.difficulty),
      [
        { key: "range", heading: t.range },
        { key: "count", heading: t.seeds, align: "end" },
        { key: "seeds", heading: t.seedsColumn },
      ],
      summary.buckets.map((bucket, index) => ({ key: String(index), cells: { range: rangeLabel(bucket, locale), count: n(bucket.count), seeds: bucket.seeds.join(", ") } })),
    ),
  );
}

function seedList(heading, seeds, total, hint) {
  if (!total) return null;
  return h(
    "omg-disclosure",
    { heading: `${heading} (${n(total)})` },
    hint ? h("p", { class: "muted" }, hint) : null,
    h("p", { class: "seeds" }, seeds.join(", ")),
    total > seeds.length ? h("p", { class: "muted" }, t.more(n(seeds.length), n(total))) : null,
  );
}

function lookSection(run) {
  const { summary } = run;
  const { anomalies } = summary;
  if (!hasProblems(summary)) return h("omg-section", { heading: t.look }, h("p", { class: "muted" }, t.nothing));
  return h(
    "omg-section",
    { heading: t.look },
    seedList(t.unsolvable, anomalies.unsolvable, summary.unsolvable),
    summary.errors
      ? h(
          "omg-disclosure",
          { heading: `${t.errors} (${n(summary.errors)})`, open: true },
          h("ul", { class: "items" }, anomalies.errors.map((item) => h("li", {}, `${item.seed}: ${item.message}`))),
          summary.errors > anomalies.errors.length ? h("p", { class: "muted" }, t.more(n(anomalies.errors.length), n(summary.errors))) : null,
        )
      : null,
    seedList(t.timeouts, anomalies.timeouts, summary.timeouts),
    anomalies.outliers.length
      ? h(
          "omg-disclosure",
          { heading: `${t.outliers} (${n(anomalies.outliers.length)})` },
          h("p", { class: "muted" }, t.outlierHint),
          h("ul", { class: "items" }, anomalies.outliers.map((item) => h("li", {}, `${item.seed}: ${item.metric} = ${n(item.value)}`))),
        )
      : null,
    h("div", { class: "toolbar" }, h("omg-button", { variant: "primary", on: { click: () => ask(fixPrompt(run)) } }, t.askFix)),
  );
}

function results(run) {
  return [
    h(
      "div",
      { class: "run-meta" },
      h("p", {}, t.lastRun(run.entry, n(run.from), n(run.from + run.count - 1), new Date(run.at).toLocaleString(locale))),
      h("p", { class: "muted" }, t.took(run.seconds, run.threads)),
    ),
    summaryTiles(run),
    lookSection(run),
    metricsSection(run),
    bucketsSection(run),
    run.file ? h("div", { class: "file" }, h("p", { class: "muted" }, t.file), h("omg-path", { path: run.file })) : null,
  ];
}

function render() {
  hideTip();
  const children = [form(), state.error ? errorBanner() : null, ...(state.run ? results(state.run) : state.busy || state.error ? [] : [h("omg-empty", { heading: t.emptyTitle, description: t.empty })])];
  root.replaceChildren(...children.flat().filter(Boolean));
}

host.on?.("progress", (event) => {
  if (event?.command && event.command !== "run") return;
  state.progress = event?.message ?? "";
  const status = root.querySelector("omg-status");
  if (status) status.textContent = state.progress;
});

try {
  const saved = await host.request("storage.get", { key: "form" });
  if (saved && typeof saved === "object") for (const key of Object.keys(DEFAULTS)) if (typeof saved[key] === "string" || typeof saved[key] === "number") state.form[key] = saved[key];
} catch {
  // Keep the defaults.
}
try {
  state.run = (await host.request("command.run", { command: "last" })) ?? undefined;
} catch (cause) {
  state.error = cause?.message || String(cause);
}
render();
