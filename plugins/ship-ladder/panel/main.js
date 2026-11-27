import { connect } from "/_ohmygame/plugin-ui.js";
import { FALLBACK_PROMPT, SHIP_FILE, STARTER_PROMPT, countdown, daysUntil, dueForFallback, formOf, mergePlan } from "./format.js";

const TEXT = {
  en: {
    title: "Ship ladder",
    description: "A plan every agent reads, and three rungs judged from what the game does.",
    plan: "Plan",
    planHint: `Kept in ${SHIP_FILE}. The AI reads it before it works and says when a request is on the not-doing list.`,
    noPlan: "No plan yet",
    noPlanHint: "Write one here, or ask the AI to plan the game with you.",
    askPlan: "Ask the AI to plan it with me",
    shipDate: "Ship date",
    shipDateHint: "YYYY-MM-DD",
    platforms: "Where it goes out",
    platformsHint: "Separate with commas, such as itch.io, OhMyGame Community",
    core: "The game in one sentence",
    coreHint: "What the player does, again and again",
    notDoing: "Not doing in this version",
    notDoingHint: "One per line",
    jamDeadline: "Jam deadline",
    jamDeadlineHint: "YYYY-MM-DD HH:MM, your time; leave empty when not in a jam",
    jamName: "Jam name",
    save: "Save plan",
    saved: "Saved",
    errors: {
      shipDate: "Write the ship date as YYYY-MM-DD.",
      jamDeadline: "Write the jam deadline as YYYY-MM-DD HH:MM.",
      unreadable: `${SHIP_FILE} isn't valid JSON, so the form can't save over it. Ask the AI to fix it, or fix it in the Code panel.`,
    },
    problems: "The plan has problems",
    ladder: "Ladder",
    rungs: {
      starts: { title: "The game starts", hint: "Every game test passed, or the check found no errors and something on screen." },
      core: { title: "The core loop does something", hint: "The plan's probe changes the game's state, or you tick it." },
      loop: { title: "You can lose and play again", hint: "Tick it once you've lost and started over." },
    },
    verdict: { passed: "Reached", failed: "Not yet", unknown: "Can't tell", open: "Not checked" },
    sources: { "game-tests": "game tests", check: "the plugin's check", probe: "the core probe", person: "you" },
    from: (source, when) => `From ${source}, ${when}`,
    check: "Check now",
    checking: "Opening the game…",
    tick: "Done",
    jam: "Jam",
    left: ({ days, hours, minutes }) => (days ? `${days} d ${hours} h left` : `${hours} h ${minutes} min left`),
    over: "The deadline has passed",
    fallback: "Ship the fallback build",
    fallbackTitle: "Ship the fallback build now?",
    fallbackMessage: "The jam ends within a day. This puts a request in the composer to freeze features, fix only what blocks play, and export the build. You send it.",
    fallbackConfirm: "Put it in the composer",
    shipIn: (days) => (days > 1 ? `Ships in ${days} days` : days === 1 ? "Ships tomorrow" : days === 0 ? "Ships today" : `${-days} days past the ship date`),
  },
  "zh-CN": {
    title: "发布阶梯",
    description: "一份所有 Agent 都会读的计划，加上三级按游戏实际表现判断的台阶。",
    plan: "计划",
    planHint: `保存在 ${SHIP_FILE}。AI 开工前会读它，请求在不做清单上时会说明。`,
    noPlan: "还没有计划",
    noPlanHint: "在这里写，或者让 AI 和你一起规划。",
    askPlan: "让 AI 和我一起规划",
    shipDate: "发布日",
    shipDateHint: "YYYY-MM-DD",
    platforms: "发布到哪里",
    platformsHint: "用逗号分隔，比如 itch.io, OhMyGame 社区",
    core: "一句话说清这个游戏",
    coreHint: "玩家反复在做的那件事",
    notDoing: "这个版本不做",
    notDoingHint: "每行一项",
    jamDeadline: "Jam 截止时间",
    jamDeadlineHint: "YYYY-MM-DD HH:MM，你所在的时区；不参加 Jam 就留空",
    jamName: "Jam 名称",
    save: "保存计划",
    saved: "已保存",
    errors: {
      shipDate: "发布日请写成 YYYY-MM-DD。",
      jamDeadline: "Jam 截止时间请写成 YYYY-MM-DD HH:MM。",
      unreadable: `${SHIP_FILE} 不是有效的 JSON，表单无法覆盖保存。请让 AI 修好，或在代码面板里修改。`,
    },
    problems: "计划里有问题",
    ladder: "阶梯",
    rungs: {
      starts: { title: "游戏能启动", hint: "游戏测试全部通过，或检查时没有报错、画面不是空白。" },
      core: { title: "核心循环有反应", hint: "计划里的探针改变了游戏状态，或由你勾选。" },
      loop: { title: "可以失败并重开", hint: "你输过一次并重新开始后勾选。" },
    },
    verdict: { passed: "已达成", failed: "还没有", unknown: "无法判断", open: "未检查" },
    sources: { "game-tests": "游戏测试", check: "插件的检查", probe: "核心探针", person: "你" },
    from: (source, when) => `来自${source}，${when}`,
    check: "立即检查",
    checking: "正在打开游戏…",
    tick: "已完成",
    jam: "Jam",
    left: ({ days, hours, minutes }) => (days ? `还剩 ${days} 天 ${hours} 小时` : `还剩 ${hours} 小时 ${minutes} 分`),
    over: "已经过了截止时间",
    fallback: "出保底版本",
    fallbackTitle: "现在出保底版本吗？",
    fallbackMessage: "Jam 不到一天就截止了。这会在输入框里放一条请求：冻结功能，只修影响游玩的问题，再导出构建。由你发送。",
    fallbackConfirm: "放进输入框",
    shipIn: (days) => (days > 1 ? `还有 ${days} 天发布` : days === 1 ? "明天发布" : days === 0 ? "今天发布" : `已超过发布日 ${-days} 天`),
  },
};
const TONE = { passed: "good", failed: "bad", unknown: "warning", open: "neutral" };

const host = await connect();
const locale = TEXT[host.locale] ? host.locale : "en";
const t = TEXT[locale];
document.documentElement.lang = locale;
const root = document.getElementById("ladder");
root.setAttribute("heading", t.title);
root.setAttribute("description", t.description);

const state = { view: undefined, form: formOf(undefined), dirty: false, busy: false, error: undefined, saved: false, asked: [] };

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "on") for (const [event, listener] of Object.entries(value)) node.addEventListener(event, listener);
    else if (key === "value") node.value = value;
    else if (value !== undefined && value !== false) node.setAttribute(key, value === true ? "" : String(value));
  }
  node.append(...children.flat(Infinity).filter((value) => value !== undefined && value !== null && value !== false));
  return node;
}
const run = (command, input) => host.request("command.run", { command, ...(input ? { input } : {}) });
const fail = (error) => {
  state.error = error?.message || String(error);
  render();
};
const when = (iso) => new Date(iso).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

async function refresh() {
  try {
    state.view = await run("state");
    if (!state.dirty) state.form = formOf(state.view.plan ?? undefined);
  } catch (error) {
    state.error = error?.message || String(error);
  }
  render();
  void offerFallback();
}

async function save() {
  state.error = undefined;
  let original;
  try {
    original = await host.files.text(SHIP_FILE);
  } catch {
    original = undefined;
  }
  const merged = mergePlan(original, state.form);
  if (merged.error) return fail(new Error(t.errors[merged.error]));
  try {
    await host.files.write(SHIP_FILE, merged.text);
    state.dirty = false;
    state.saved = true;
    await refresh();
  } catch (error) {
    fail(error);
  }
}

async function check() {
  state.busy = true;
  state.error = undefined;
  render();
  try {
    state.view = await run("check");
  } catch (error) {
    state.error = error?.message || String(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function mark(rung, done) {
  try {
    state.view = await run("mark", { rung, done });
    render();
  } catch (error) {
    fail(error);
  }
}

/** Offers the fallback build once per deadline, when asked to or when the last day starts. */
async function offerFallback(force = false) {
  const jam = state.view?.jam;
  if (!jam || (!force && !dueForFallback(jam, state.asked))) return;
  state.asked = [...new Set([...state.asked, jam.deadline])];
  host.request("storage.set", { key: "asked", value: state.asked }).catch(() => {});
  let agreed = false;
  try {
    agreed = await host.request("ui.confirm", { title: t.fallbackTitle, message: t.fallbackMessage, confirmLabel: t.fallbackConfirm });
  } catch {
    agreed = false;
  }
  if (agreed) await host.request("composer.fill", { text: FALLBACK_PROMPT }).catch(fail);
}

const field = (key, label, hint, multiline = false) =>
  h(multiline ? "omg-textarea" : "omg-input", {
    label,
    hint,
    rows: multiline ? 3 : undefined,
    value: state.form[key],
    "data-field": key,
    on: {
      input: (event) => {
        state.form = { ...state.form, [key]: event.target.value ?? event.detail?.value ?? "" };
        state.dirty = true;
        state.saved = false;
      },
    },
  });

function planSection() {
  const view = state.view;
  return h(
    "omg-section",
    { heading: t.plan, description: t.planHint },
    view && !view.plan
      ? h("div", { class: "row" }, h("span", { class: "muted" }, `${t.noPlan}. ${t.noPlanHint}`), h("omg-button", { variant: "ghost", on: { click: () => host.request("composer.fill", { text: STARTER_PROMPT }).catch(fail) } }, t.askPlan))
      : null,
    view?.problems?.length ? h("omg-banner", { tone: "warning", heading: t.problems }, h("ul", {}, view.problems.map((problem) => h("li", {}, problem)))) : null,
    h(
      "div",
      { class: "form" },
      field("shipDate", t.shipDate, t.shipDateHint),
      field("platforms", t.platforms, t.platformsHint),
      field("core", t.core, t.coreHint, true),
      field("notDoing", t.notDoing, t.notDoingHint, true),
      field("jamDeadline", t.jamDeadline, t.jamDeadlineHint),
      state.form.jamDeadline ? field("jamName", t.jamName) : null,
    ),
    h("div", { class: "row" }, h("omg-button", { variant: "primary", on: { click: save } }, t.save), state.saved ? h("span", { class: "muted", role: "status" }, t.saved) : null),
  );
}

function ladderSection() {
  const rows = state.view?.ladder ?? [];
  return h(
    "omg-section",
    { heading: t.ladder },
    h(
      "ol",
      { class: "rungs" },
      rows.map(({ rung, verdict, judgement }) =>
        h(
          "li",
          { class: "rung", "data-rung": rung },
          h("omg-status", { tone: TONE[verdict] }, t.verdict[verdict]),
          h(
            "div",
            {},
            h("p", { class: "rung-title" }, t.rungs[rung].title),
            h("p", { class: "muted" }, judgement?.detail ?? t.rungs[rung].hint),
            judgement ? h("p", { class: "muted small" }, t.from(t.sources[judgement.source], when(judgement.at))) : null,
          ),
          rung === "starts"
            ? h("omg-button", { busy: state.busy, on: { click: check } }, state.busy ? t.checking : t.check)
            : h("omg-checkbox", {
                label: t.tick,
                checked: judgement?.verdict === "passed",
                on: { change: (event) => mark(rung, Boolean(event.target.checked ?? event.detail?.checked)) },
              }),
        ),
      ),
    ),
  );
}

function headline() {
  const plan = state.view?.plan;
  const jam = state.view?.jam;
  const parts = [];
  if (plan?.shipDate) {
    const days = daysUntil(plan.shipDate);
    if (days !== undefined) parts.push(h("omg-badge", { tone: days < 0 ? "bad" : days <= 2 ? "warning" : "neutral" }, t.shipIn(days)));
  }
  if (jam) {
    const left = countdown(jam.deadline);
    parts.push(
      h("omg-badge", { tone: left.over ? "bad" : left.days ? "neutral" : "warning", "data-jam": "" }, `${jam.name ?? t.jam}: ${left.over ? t.over : t.left(left)}`),
      !left.over && !left.days ? h("omg-button", { variant: "secondary", on: { click: () => offerFallback(true) } }, t.fallback) : null,
    );
  }
  return parts.length ? h("div", { class: "row" }, parts) : null;
}

function render() {
  root.replaceChildren(
    ...[headline(), state.error ? h("omg-banner", { tone: "bad" }, state.error) : null, ladderSection(), planSection()].filter(Boolean),
  );
}

// Opened by the plugin at the jam's last day: offer the fallback build.
const jamAlert = (opened) => Boolean(opened && typeof opened === "object" && opened.jamAlert);
host.on?.("open", ({ state: opened }) => {
  if (jamAlert(opened)) void offerFallback();
});
// The plan can change under the panel, from the agent or the Code panel.
host.on?.("files", ({ paths } = {}) => {
  if (!paths || paths.includes(SHIP_FILE)) void refresh();
});
// The countdown moves on its own while the panel is open.
setInterval(() => {
  if (state.view?.jam) {
    render();
    void offerFallback();
  }
}, 60_000);

try {
  const asked = await host.request("storage.get", { key: "asked" });
  if (Array.isArray(asked)) state.asked = asked.filter((item) => typeof item === "string");
} catch {
  // Nothing asked yet.
}
await refresh();
// Asked at most once per deadline, whether the plugin opened the panel or the last day started.
if (jamAlert(host.opened)) void offerFallback();
