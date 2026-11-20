// A test's steps in words, for the panel's details: what each player does
// and what is checked, in the panel's language. The file stays the source;
// values come through as the test wrote them, {{names}} included.

const quote = (value) => `“${value}”`;
const shown = (value) => (typeof value === "string" ? quote(value) : JSON.stringify(value));

const WORDS = {
  en: {
    player: (n) => `Player ${n}`,
    together: (players) => `Players ${players.join(", ")} together`,
    then: "; then ",
    target: {
      testId: (v) => `testId ${quote(v)}`,
      text: (v) => `text ${quote(v)}`,
      role: (role, name) => (name ? `${role} ${quote(name)}` : role),
      selector: (v) => `selector ${quote(v)}`,
      point: (x, y) => `point (${x}, ${y})`,
    },
    action: {
      click: (target) => `Click ${target}`,
      type: (target, text) => `Type ${quote(text)} into ${target}`,
      press: (key, ms) => (ms ? `Hold ${key} for ${ms} ms` : `Press ${key}`),
      touch: (x, y) => `Touch (${x}, ${y})`,
      wait: (ms) => `Wait ${ms} ms`,
      resize: (w, h) => `Resize the window to ${w}×${h}`,
      bridge: (method, value) => `Call the game's ${method}(${value ?? ""})`,
      reload: () => "Reload the page",
      offline: () => "Go off line",
      online: () => "Come back on line",
    },
    expect: {
      visible: "Shown",
      hidden: "Hidden",
      enabled: "Usable",
      disabled: "Shown, not usable",
      screenChanged: "The screen changes",
      notBlank: "The screen isn't blank",
      within: (ms) => `within ${ms} ms`,
    },
    op: { eq: "is", ne: "isn't", gt: "is more than", gte: "is at least", lt: "is less than", lte: "is at most", contains: "contains", excludes: "doesn't contain", exists: (yes) => (yes ? "exists" : "doesn't exist") },
    state: "State",
    remember: (name, path) => `Remember ${path} as {{${name}}}`,
    nothing: "Only opens the game",
  },
  "zh-CN": {
    player: (n) => `玩家 ${n}`,
    together: (players) => `玩家 ${players.join("、")} 同时`,
    then: "；接着",
    target: {
      testId: (v) => `testId ${quote(v)}`,
      text: (v) => `文字 ${quote(v)}`,
      role: (role, name) => (name ? `${role} ${quote(name)}` : role),
      selector: (v) => `选择器 ${quote(v)}`,
      point: (x, y) => `坐标 (${x}, ${y})`,
    },
    action: {
      click: (target) => `点击 ${target}`,
      type: (target, text) => `在 ${target} 输入 ${quote(text)}`,
      press: (key, ms) => (ms ? `按住 ${key} ${ms} 毫秒` : `按 ${key}`),
      touch: (x, y) => `触摸 (${x}, ${y})`,
      wait: (ms) => `等待 ${ms} 毫秒`,
      resize: (w, h) => `把窗口调整为 ${w}×${h}`,
      bridge: (method, value) => `调用游戏的 ${method}(${value ?? ""})`,
      reload: () => "刷新页面",
      offline: () => "断网",
      online: () => "恢复网络",
    },
    expect: {
      visible: "显示",
      hidden: "隐藏",
      enabled: "可以使用",
      disabled: "显示但不能使用",
      screenChanged: "画面有变化",
      notBlank: "画面不是空白",
      within: (ms) => `${ms} 毫秒内`,
    },
    op: { eq: "等于", ne: "不等于", gt: "大于", gte: "不小于", lt: "小于", lte: "不大于", contains: "包含", excludes: "不包含", exists: (yes) => (yes ? "存在" : "不存在") },
    state: "状态",
    remember: (name, path) => `记住 ${path}，记为 {{${name}}}`,
    nothing: "只打开游戏",
  },
};

export const wordsFor = (locale) => WORDS[locale] ?? WORDS.en;

function target(w, value) {
  if (!value) return "";
  if ("testId" in value) return w.target.testId(value.testId);
  if ("text" in value) return w.target.text(value.text);
  if ("role" in value) return w.target.role(value.role, value.name);
  if ("selector" in value) return w.target.selector(value.selector);
  return w.target.point(value.x, value.y);
}

function action(w, value) {
  switch (value.type) {
    case "click": return w.action.click(target(w, value.target));
    case "type": return w.action.type(target(w, value.target), value.text);
    case "press": return w.action.press(value.key, value.duration);
    case "touch": return w.action.touch(value.x, value.y);
    case "wait": return w.action.wait(value.milliseconds);
    case "resize": return w.action.resize(value.viewport.width, value.viewport.height);
    case "bridge": return w.action.bridge(value.method, value.value);
    default: return w.action[value.type]?.() ?? value.type;
  }
}

function condition(w, path, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const [name, operand] = Object.entries(value)[0] ?? [];
    if (name === "exists") return `${w.state} ${path} ${w.op.exists(operand)}`;
    if (name in w.op) return `${w.state} ${path} ${w.op[name]} ${shown(operand)}`;
  }
  return `${w.state} ${path} ${w.op.eq} ${shown(value)}`;
}

/** What a step's `expect` checks, one line each. */
function checks(w, expect) {
  if (!expect) return [];
  const lines = [];
  for (const kind of ["visible", "hidden", "enabled", "disabled"]) {
    if (expect[kind]?.length) lines.push(`${w.expect[kind]}: ${expect[kind].map((item) => target(w, item)).join(", ")}`);
  }
  for (const [path, value] of Object.entries(expect.state ?? {})) lines.push(condition(w, path, value));
  if (expect.screenChanged) lines.push(w.expect.screenChanged);
  if (expect.notBlank) lines.push(w.expect.notBlank);
  if (lines.length && expect.timeoutMs !== undefined) lines[lines.length - 1] += ` (${w.expect.within(expect.timeoutMs)})`;
  return lines;
}

/**
 * A step in words: who acts, what they do, and what is checked.
 * `players` is the test's count, so a one-player test names nobody.
 */
export function describeStep(step, players, locale) {
  const w = wordsFor(locale);
  let who;
  let does;
  if (step.together) {
    who = w.together(step.together.map((item) => item.player));
    does = step.together.map((item) => `${w.player(item.player)}: ${item.actions.map((value) => action(w, value)).join(w.then)}`).join(" · ");
  } else {
    who = players > 1 ? w.player(step.player ?? 1) : undefined;
    does = step.action ? action(w, step.action) : undefined;
  }
  const remembered = Object.entries(step.remember ?? {}).map(([name, path]) => w.remember(name, path));
  return { who, does, checks: [...checks(w, step.expect), ...remembered] };
}

export const nothingToDo = (locale) => wordsFor(locale).nothing;
