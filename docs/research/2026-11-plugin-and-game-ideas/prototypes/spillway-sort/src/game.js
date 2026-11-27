import { createRecorder, levelNumber, localDate, pressable } from "../../shared/record.js";
import { level as generate } from "./generator.js";
import { isSolved, pour } from "./rules.js";

// The playable prototype. Tap a bottle, then the bottle to pour into. Hold the
// bottle you'd pour into to see where the water would go without pouring.
// `?control=1` plays levels matched in length and dead ends but without
// pipes, for the comparison the validation plan asks for. `?player=` (or New
// player) keeps each tester's record apart; Levels → Copy results exports it.

const TEXT = {
  en: {
    level: (n, total) => `Level ${n} of ${total}`,
    daily: "Daily level",
    moves: (moves, best) => `${moves} moves · best possible ${best}`,
    control: " · control version (no pipes)",
    undo: "Undo",
    restart: "Restart",
    levels: "Levels",
    next: "Next level",
    done: (moves, best) => `Solved in ${moves} moves. The shortest solution is ${best}.`,
    hintPipes: "Pipes: pour into a bottle with a pipe and what rises over the top flows to the next bottle, whatever its colour. After choosing where to pour from, hold the bottle you'd pour into to see where the water would go.",
    hintPlain: "Tap a bottle, then the bottle to pour into. Same colour on top, or an empty bottle.",
    pickerTitle: (player) => `Levels · ${player}`,
    dailyButton: "Today's level",
    export: "Copy results",
    newPlayer: "New player",
    close: "Close",
    copied: "Results copied. Paste them into the playtest sheet.",
  },
  "zh-CN": {
    level: (n, total) => `第 ${n} 关，共 ${total} 关`,
    daily: "每日关",
    moves: (moves, best) => `${moves} 步 · 最少 ${best} 步`,
    control: " · 对照版（没有管子）",
    undo: "撤销",
    restart: "重来",
    levels: "选关",
    next: "下一关",
    done: (moves, best) => `用 ${moves} 步完成。最短解是 ${best} 步。`,
    hintPipes: "溢流管：倒进带管子的瓶子时，超出瓶口的部分会顺着管子流进旁边的瓶子，不管那瓶顶上是什么颜色。选好从哪瓶倒之后，按住要倒进去的瓶子，可以先看水会流到哪。",
    hintPlain: "点一个瓶子，再点要倒进去的瓶子。只能倒到同色或空瓶上。",
    pickerTitle: (player) => `选关 · ${player}`,
    dailyButton: "今天的关卡",
    export: "复制记录",
    newPlayer: "换一位试玩者",
    close: "关闭",
    copied: "记录已复制，贴到试玩记录表里。",
  },
};
const t = TEXT[navigator.language?.startsWith("zh") ? "zh-CN" : "en"];
const COLOURS = { a: ["#e8505b", "▲"], b: ["#f2c14e", "●"], c: ["#5fb85f", "■"], d: ["#4c8bf5", "◆"], e: ["#b06ad9", "★"], f: ["#f08a3c", "✚"], g: ["#3cc8c0", "▼"], h: ["#e7e7ea", "✖"] };

const params = new URLSearchParams(location.search);
const control = params.get("control") === "1";
const version = control ? "control" : "main";
const rule = control ? "classic" : "O1";
const pack = await (await fetch(new URL("../levels.json", import.meta.url))).json();
const levels = pack[version];
const capacity = pack.capacity;
const record = createRecorder("spillway-sort", version);

const els = Object.fromEntries(["title", "status", "hint", "board", "done", "done-text", "next", "undo", "restart", "levels", "picker", "picker-title", "picker-grid", "daily", "export", "export-text", "close", "new-player"].map((id) => [id, document.getElementById(id)]));
els.undo.textContent = t.undo;
els.restart.textContent = t.restart;
els.levels.textContent = t.levels;
els.next.textContent = t.next;
els.daily.textContent = t.dailyButton;
els.export.textContent = t.export;
els["new-player"].textContent = t.newPlayer;
els.close.textContent = t.close;

const game = { index: 0, level: undefined, state: [], history: [], selected: undefined, preview: undefined };

function open(index, level = levels[index]) {
  game.index = index;
  game.level = level;
  game.state = [...level.bottles];
  game.history = [];
  game.selected = undefined;
  game.preview = undefined;
  record.start(level, index);
  render();
}

function openDaily() {
  const daily = generate(`day-${localDate()}`, { tier: "rescued", kind: control ? "classic" : "rescued" });
  open(-1, control ? { ...daily, kind: "control", pipes: {} } : daily);
}

function tryPour(from, to) {
  const poured = pour(game.state, from, to, capacity, game.level.pipes, rule);
  game.selected = undefined;
  if (!poured) {
    // Draw first, then shake the new element: drawing replaces every bottle.
    render();
    flash([to], "shake");
    return;
  }
  const pause = record.act("moves");
  if (poured.overflow) record.first("firstOverflow", pause);
  game.history.push(game.state);
  game.state = poured.state;
  render();
  // The water's path, one bottle after another: the moment the pipes are for.
  poured.path.forEach((bottle, step) => setTimeout(() => flash([bottle], "flow"), step * 180));
  if (isSolved(game.state, capacity)) record.solved({ moves: game.history.length });
}

function flash(bottles, name) {
  for (const index of bottles) {
    const bottle = els.board.querySelector(`[data-index="${index}"]`);
    if (!bottle) continue;
    bottle.classList.remove(name);
    void bottle.offsetWidth;
    bottle.classList.add(name);
  }
}

function render() {
  const solved = isSolved(game.state, capacity);
  const preview = game.preview;
  els.title.textContent = game.index < 0 ? t.daily : t.level(game.index + 1, levels.length);
  els.status.textContent = t.moves(game.history.length, game.level.optimal) + (control ? t.control : "");
  els.hint.textContent = !control && Object.keys(game.level.pipes).length ? t.hintPipes : t.hintPlain;
  els.undo.disabled = !game.history.length || solved;
  els.done.hidden = !solved;
  if (solved) els["done-text"].textContent = t.done(game.history.length, game.level.optimal);
  els.next.hidden = game.index < 0 || game.index >= levels.length - 1;
  els.board.style.setProperty("--count", String(game.state.length));

  const shown = preview?.state ?? game.state;
  els.board.replaceChildren(
    ...game.state.map((bottle, index) => {
      const slot = document.createElement("div");
      slot.className = "slot";
      const pipe = control ? undefined : game.level.pipes[index];
      if (pipe !== undefined) {
        const arrow = document.createElement("div");
        arrow.className = `pipe ${pipe > index ? "right" : "left"}`;
        arrow.innerHTML = `<span>${pipe > index ? "➜" : "⬅"}</span>`;
        arrow.dataset.testid = `pipe-${index}-${pipe}`;
        slot.append(arrow);
      }
      const element = document.createElement("div");
      element.className = "bottle";
      element.dataset.index = String(index);
      element.dataset.press = `bottle-${index}`;
      element.dataset.testid = `bottle-${index}`;
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", `Bottle ${index + 1}: ${bottle || "empty"}`);
      if (index === game.selected) element.classList.add("selected");
      if (bottle.length === capacity && [...bottle].every((layer) => layer === bottle[0])) element.classList.add("done");
      if (preview?.path.includes(index)) element.classList.add("preview");
      const layers = shown[index];
      for (let i = 0; i < layers.length; i += 1) {
        const [colour, symbol] = COLOURS[layers[i]] ?? ["#888", "?"];
        const layer = document.createElement("div");
        layer.className = "layer";
        if (preview && (i >= bottle.length || layers[i] !== bottle[i])) layer.classList.add("ghost");
        layer.style.background = colour;
        layer.textContent = symbol;
        element.append(layer);
      }
      pressable(element, {
        onTap: () => tap(index),
        onHold: () => hold(index),
        onHoldEnd: () => {
          game.preview = undefined;
          render();
        },
      });
      slot.append(element);
      return slot;
    }),
  );
}

function tap(index) {
  if (isSolved(game.state, capacity)) return;
  if (game.selected === undefined) {
    if (!game.state[index]) return;
    game.selected = index;
  } else if (index === game.selected) game.selected = undefined;
  else return tryPour(game.selected, index);
  render();
}

/** Holding the bottle you'd pour into shows where the water goes; only a pour that's allowed counts as a preview. */
function hold(index) {
  if (game.selected === undefined || index === game.selected || isSolved(game.state, capacity)) return;
  const poured = pour(game.state, game.selected, index, capacity, game.level.pipes, rule);
  if (!poured) return;
  record.act("previews");
  game.preview = poured;
  render();
}

els.undo.addEventListener("click", () => {
  if (!game.history.length) return;
  game.state = game.history.pop();
  game.selected = undefined;
  record.act("undos");
  render();
});
els.restart.addEventListener("click", () => open(game.index, game.level));
els.next.addEventListener("click", () => open(game.index + 1));
els.levels.addEventListener("click", () => {
  els["picker-title"].textContent = t.pickerTitle(record.player);
  const solved = new Set(record.export().levels.filter((entry) => entry.tries.some((item) => item.outcome === "solved")).map((entry) => entry.seed));
  els["picker-grid"].replaceChildren(
    ...levels.map((level, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(index + 1);
      if (solved.has(level.seed)) button.classList.add("solved");
      button.addEventListener("click", () => {
        els.picker.close();
        open(index);
      });
      return button;
    }),
  );
  els["export-text"].hidden = true;
  els.picker.showModal();
});
els.daily.addEventListener("click", () => {
  els.picker.close();
  openDaily();
});
els["new-player"].addEventListener("click", () => {
  record.newPlayer();
  els.picker.close();
  open(0);
});
els.export.addEventListener("click", async () => {
  const text = JSON.stringify(record.export(), null, 1);
  els["export-text"].value = text;
  els["export-text"].hidden = false;
  try {
    await navigator.clipboard.writeText(text);
    els["export-text"].value = `${t.copied}\n\n${text}`;
  } catch {
    els["export-text"].select();
  }
});

// The playtest bridge OhMyGame's game_use and Game Tests read.
window.__OHMYGAME_PLAYTEST__ = {
  snapshot: () => ({
    version,
    player: record.player,
    level: game.index + 1,
    seed: game.level.seed,
    kind: game.level.kind,
    bottles: [...game.state],
    pipes: control ? {} : { ...game.level.pipes },
    selected: game.selected ?? null,
    moves: game.history.length,
    optimal: game.level.optimal,
    solved: isSolved(game.state, capacity),
  }),
  reset: () => open(game.index, game.level),
  /** Opens level n (1-based); 0 opens today's level. */
  setSeed: (n) => {
    if (Number(n) === 0) return openDaily();
    open((levelNumber(n, levels.length) ?? 1) - 1);
  },
};

// A reload goes back to the level the player was on.
if (params.get("daily") === "1") openDaily();
else open((levelNumber(params.get("level"), levels.length) ?? (record.current >= 0 ? record.current + 1 : 1)) - 1);
