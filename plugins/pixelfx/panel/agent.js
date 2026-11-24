// The panel's assistant: the person's model, run by the app with the
// plugin's own tools (host.assistant), drawn as pixelfx's AI drawer was
// (gallery/index.html #agent-drawer, MIT, see lib/LICENSE). The app keeps the
// conversation and its history undoes each change a tool made, so the drawer
// has no undo of its own. The system prompt, the turns and the tool steps are
// plain functions, which tests run; createDrawer draws them.

/** What the assistant is told about its job, with what the panel shows now. */
export function systemPrompt(context) {
  return [
    "You are the assistant of the Pixel Effects panel in OhMyGame, a pixel art VFX and game sound expert. You make and tune pixelfx effects and their sounds through the panel's tools, which work on the project's pixelfx/ folder while the person watches.",
    "",
    "How to work:",
    "- Use the tools; never only describe code. Look before writing: find_effects and read_effect show how the built-in effects are made.",
    "- Settings first: show_effect with settings (palette, seed, fps, duration, size, flip, options) changes a look without code.",
    "- Built-in effects are read-only. copy_effect puts one in the project; write_effect writes a project effect whole and returns its check. Fix every error it names, and the warnings that matter.",
    "- An effect is one ES module: `export const meta = { name, desc, tags, size, origin, duration, loop, fps, options }` and `export function draw(p, t, o)` (pure in t) or `export function create(o)` returning { update(dt), draw(p) }. Import from \"../../core/index.js\". Never Math.random() or Date: randomness comes from o.seed. One-shots end empty at t = duration; loops match at both ends.",
    "- Sound: write_sfx writes pixelfx/sfx/<category>/<name>.js, which imports from \"../../sfx-core/index.js\" and exports `variants`, then renders each to a WAV. Read the effect's duration and act.hits first and line the attacks up with them. Make about three variants that differ clearly. read_sfx shows the current script and variants.",
    "- make_sfx_with_model costs the person money: use it only when they ask for a model-made sound.",
    "- Keep answers short: say what you changed and what to try next. Each change can be undone from the app's history.",
    "",
    "The panel now:",
    context,
  ].join("\n");
}

/**
 * The turns to draw from `host.assistant.history()`: each of the person's
 * messages, and the assistant's steps after it as one turn of text and tool
 * steps.
 */
export function turnsFromHistory(entries) {
  const turns = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.role === "user") turns.push({ role: "user", text: String(entry.text ?? ""), images: entry.images });
    else if (entry?.role === "assistant") {
      let turn = turns.at(-1);
      if (turn?.role !== "assistant") turns.push((turn = { role: "assistant", items: [] }));
      if (entry.text) turn.items.push({ kind: "text", text: String(entry.text) });
      for (const tool of entry.tools ?? []) turn.items.push({ kind: "tool", id: tool.id, name: tool.name, input: tool.input, result: tool.result, error: !!tool.error, done: true });
    }
  }
  return turns;
}

/** The assistant's turn after one event of a run, as a new object. */
export function reduceTurn(turn, event) {
  const items = [...turn.items];
  if (event?.type === "text" && event.text) items.push({ kind: "text", text: String(event.text) });
  else if (event?.type === "tool") items.push({ kind: "tool", id: event.id, name: event.name, input: event.input, done: false });
  else if (event?.type === "tool.result") {
    const index = items.findIndex((item) => item.kind === "tool" && item.id === event.id);
    const step = { kind: "tool", id: event.id, name: event.name, input: index >= 0 ? items[index].input : undefined, result: event.result, error: !!event.error, done: true };
    if (index >= 0) items[index] = step;
    else items.push(step);
  }
  return { ...turn, items };
}

/** The turn once its run ends: a reply it didn't already show, and tool steps left waiting marked stopped. */
export function endTurn(turn, { text, stopped, error } = {}) {
  const items = turn.items.map((item) => (item.kind === "tool" && !item.done ? { ...item, done: true, error: true, stopped: true } : item));
  const said = items.filter((item) => item.kind === "text").map((item) => item.text);
  if (text && !said.includes(text)) items.push({ kind: "text", text });
  return { ...turn, items, ...(stopped ? { stopped } : {}), ...(error ? { error } : {}) };
}

/** A tool step in a few words: the tool, and the effect or format it's about. */
export function toolLabel(name, input) {
  const short = String(name ?? "").replace(/^.*__/, "");
  const about = input && typeof input === "object" ? (input.effect ?? input.query ?? input.format ?? "") : "";
  return about ? `${short} · ${String(about).slice(0, 60)}` : short;
}

/** The first line of a tool's answer worth showing: an error, or what it says it did. */
export function toolSummary(result) {
  if (typeof result !== "string" || !result) return "";
  try {
    const value = JSON.parse(result);
    if (value && typeof value === "object") {
      if (Array.isArray(value.errors) && value.errors.length) return value.errors[0];
      if (value.note) return value.note;
      if (value.path) return value.path;
    }
  } catch {
    // Plain text.
  }
  return result.split("\n")[0].slice(0, 160);
}

/** A tool's answer laid out to read: JSON indented, anything else as it is. */
export function readable(result) {
  const text = String(result ?? "");
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// The drawer.

/**
 * Draws the assistant in `root`. `context()` gives what the panel shows now,
 * in English; `target()` the effect's id for the drawer's head;
 * `canRun()` whether a run may start.
 */
export function createDrawer({ host, t, el, root, context, target, onBusy = () => {} }) {
  const head = el("div", { className: "agent-head" }, [
    el("div", { className: "agent-title" }, [el("h3", { textContent: t.agent.title }), el("div", { className: "agent-sub" })]),
    el("div", { className: "agent-head-actions" }, [
      el("button", { type: "button", className: "ctrl-btn btn-xs agent-new", textContent: t.agent.newChat }),
      el("button", { type: "button", className: "ctrl-btn btn-xs agent-close", textContent: t.agent.close }),
    ]),
  ]);
  const chips = el(
    "div",
    { className: "agent-quick-chips" },
    t.agent.chips.map(([label, prompt]) => {
      const chip = el("button", { type: "button", className: "ctrl-btn q-chip", textContent: label, title: prompt });
      chip.dataset.prompt = prompt;
      return chip;
    }),
  );
  const list = el("div", { className: "agent-msgs px-sunken", role: "log", ariaLive: "polite" });
  const input = el("textarea", { className: "ctrl-input px-sunken agent-input", rows: 3, placeholder: t.agent.placeholder, ariaLabel: t.agent.placeholder });
  const send = el("button", { type: "submit", className: "primary-btn agent-send", textContent: t.agent.send });
  const form = el("form", { className: "agent-input-bar" }, [input, el("div", { className: "agent-input-foot" }, [el("span", { className: "agent-note", textContent: t.agent.undoNote }), send])]);
  root.replaceChildren(head, chips, list, form);

  let turns = [];
  let live;
  let running;
  let unavailable = "";
  let loaded = false;

  const updateTarget = () => {
    const sub = $(".agent-sub");
    sub.textContent = sub.title = target() ?? "";
  };
  function $(selector) {
    return root.querySelector(selector);
  }

  function drawItem(item) {
    if (item.kind === "text") return el("div", { className: "agent-text", textContent: item.text });
    const state = !item.done ? "running" : item.error ? "failed" : "ok";
    const mark = { running: "…", failed: "✕", ok: "✓" }[state];
    const summary = el("summary", {}, [el("span", { className: "tool-mark", textContent: mark }), el("span", { className: "tool-name", textContent: toolLabel(item.name, item.input) })]);
    const detail = item.done ? el("pre", { className: "tool-result", textContent: item.stopped ? t.agent.stoppedTool : readable(item.result).slice(0, 4000) }) : null;
    const step = el("details", { className: `agent-tool ${state}` }, [summary, detail]);
    const brief = item.done && !item.stopped ? toolSummary(item.result) : "";
    if (brief && item.error) step.append(el("div", { className: "tool-brief", textContent: brief }));
    return step;
  }

  function drawTurn(turn, pending = false) {
    if (turn.role === "user") return el("div", { className: "agent-msg user", textContent: turn.text });
    const kids = turn.items.map(drawItem);
    if (pending && !turn.items.some((item) => item.kind === "tool" && !item.done)) kids.push(el("div", { className: "agent-thinking", textContent: t.agent.thinking }));
    if (turn.stopped) kids.push(el("div", { className: "agent-foot", textContent: turn.stopped === "user" ? t.agent.stopped : turn.stopped === "steps" ? t.agent.tooManySteps : t.agent.cutShort }));
    const msg = el("div", { className: `agent-msg assistant${turn.error ? " err" : ""}` }, kids);
    if (turn.error) msg.append(el("div", { className: "agent-error", textContent: turn.error }));
    return msg;
  }

  function draw() {
    updateTarget();
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const nodes = turns.map((turn) => drawTurn(turn));
    if (live) nodes.push(drawTurn(live, true));
    if (!nodes.length) nodes.push(el("div", { className: "agent-msg assistant hint", textContent: unavailable || (loaded ? t.agent.empty : t.agent.loading) }));
    else if (unavailable) nodes.push(el("div", { className: "agent-msg assistant hint", textContent: unavailable }));
    list.replaceChildren(...nodes);
    if (atBottom || live) list.scrollTop = list.scrollHeight;
    const blocked = !!unavailable;
    send.textContent = running ? t.agent.stop : t.agent.send;
    send.classList.toggle("stop", !!running);
    send.disabled = blocked && !running;
    input.disabled = blocked;
    for (const chip of chips.children) chip.disabled = blocked || !!running;
    $(".agent-new").disabled = blocked || !!running || !turns.length;
  }

  async function load() {
    try {
      const models = host.models ? await host.models.list() : [];
      if (!models.length) {
        unavailable = t.agent.noModel;
        loaded = true;
        return draw();
      }
      turns = turnsFromHistory(await host.assistant.history());
      unavailable = "";
    } catch (error) {
      unavailable = t.agent.unavailable(error instanceof Error ? error.message : String(error));
    }
    loaded = true;
    draw();
  }

  async function run(text) {
    const said = text.trim();
    if (!said || running || unavailable) return;
    input.value = "";
    turns.push({ role: "user", text: said });
    live = { role: "assistant", items: [] };
    const controller = new AbortController();
    running = controller;
    onBusy(true);
    draw();
    try {
      const result = await host.assistant.run({ text: said, system: systemPrompt(context()), maxTokens: 8192 }, { signal: controller.signal, onEvent: (event) => {
        live = reduceTurn(live, event);
        draw();
      } });
      live = endTurn(live, { text: result.text, stopped: result.stopped });
    } catch (error) {
      live = controller.signal.aborted ? endTurn(live, { stopped: "user" }) : endTurn(live, { error: error instanceof Error ? error.message : String(error) });
    } finally {
      turns.push(live);
      live = undefined;
      running = undefined;
      onBusy(false);
      draw();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (running) running.abort();
    else void run(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!running) void run(input.value);
    }
  });
  chips.addEventListener("click", (event) => {
    const chip = event.target.closest(".q-chip");
    if (chip && !chip.disabled) void run(chip.dataset.prompt);
  });
  $(".agent-new").addEventListener("click", async () => {
    if (running) return;
    try {
      await host.assistant.clear();
      turns = [];
    } catch (error) {
      unavailable = t.agent.unavailable(error instanceof Error ? error.message : String(error));
    }
    draw();
  });

  return {
    closeButton: $(".agent-close"),
    /** Reads the conversation the first time the drawer opens. */
    open() {
      if (!loaded) void load();
      draw();
      input.focus();
    },
    refresh: updateTarget,
    /** Puts `text` in the box for the person to send or change. */
    prefill(text) {
      if (running || unavailable) return;
      input.value = text;
      input.focus();
    },
    get running() {
      return !!running;
    },
  };
}
