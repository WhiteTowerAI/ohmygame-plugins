import { createRecorder, levelNumber, localDate, pressable } from "../../shared/record.js";
import { level as generate } from "./generator.js";
import { canLeave, isSolved, take } from "./rules.js";

// The playable prototype. Tap an arrow: it slides out the way it points, or
// hits something and costs a heart. With gravity, what's above it falls one
// cell. Hold an arrow to see the board after taking it. `?control=1` plays
// boards matched in size and arrows but without gravity, for the comparison
// the validation plan asks for; `?preview=0` turns the hold preview off.
// `?player=` (or New player) keeps each tester's record apart; Levels → Copy
// results exports it.

const TEXT = {
  en: {
    level: (n, total) => `Level ${n} of ${total}`,
    daily: "Daily level",
    status: (left, hearts) => `${left} arrows left · ${"♥".repeat(hearts)}${"♡".repeat(3 - hearts)}`,
    control: " · control version (no falling)",
    undo: "Undo",
    restart: "Restart",
    levels: "Levels",
    next: "Next level",
    done: (bumps) => (bumps ? `Cleared, with ${bumps} ${bumps === 1 ? "bump" : "bumps"}.` : "Cleared without a bump."),
    out: "Out of hearts. Restart to try again.",
    hintGravity: "Tap an arrow to send it off the board. When one leaves, everything above it falls one cell, so a clear path can close and a blocked one can open. Hold an arrow to see what happens first.",
    hintGravityNoPreview: "Tap an arrow to send it off the board. When one leaves, everything above it falls one cell, so a clear path can close and a blocked one can open.",
    hintPlain: "Tap an arrow to send it off the board. If something is in the way it bounces and you lose a heart.",
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
    status: (left, hearts) => `还剩 ${left} 支箭 · ${"♥".repeat(hearts)}${"♡".repeat(3 - hearts)}`,
    control: " · 对照版（不会塌）",
    undo: "撤销",
    restart: "重来",
    levels: "选关",
    next: "下一关",
    done: (bumps) => (bumps ? `清空了，撞了 ${bumps} 次。` : "一次没撞就清空了。"),
    out: "心用完了，点重来再试。",
    hintGravity: "点一支箭，它会沿箭头方向飞出棋盘。一支箭离开后，它上面的整列会掉下来一格：通的路可能堵上，堵的路也可能通了。按住一支箭可以先看拔掉之后的样子。",
    hintGravityNoPreview: "点一支箭，它会沿箭头方向飞出棋盘。一支箭离开后，它上面的整列会掉下来一格：通的路可能堵上，堵的路也可能通了。",
    hintPlain: "点一支箭，它会沿箭头方向飞出棋盘。前面有东西挡着就会弹回来，扣一颗心。",
    pickerTitle: (player) => `选关 · ${player}`,
    dailyButton: "今天的关卡",
    export: "复制记录",
    newPlayer: "换一位试玩者",
    close: "关闭",
    copied: "记录已复制，贴到试玩记录表里。",
  },
};
const t = TEXT[navigator.language?.startsWith("zh") ? "zh-CN" : "en"];
const GLYPH = { U: "↑", D: "↓", L: "←", R: "→" };
const HEARTS = 3;

const params = new URLSearchParams(location.search);
const control = params.get("control") === "1";
const previewOn = params.get("preview") !== "0";
const version = `${control ? "control" : "main"}${previewOn ? "" : "-nopreview"}`;
const gravity = !control;
const pack = await (await fetch(new URL("../levels.json", import.meta.url))).json();
const levels = pack[control ? "control" : "main"];
const record = createRecorder("falling-arrows", version);

const els = Object.fromEntries(["title", "status", "hint", "board", "done", "done-text", "next", "undo", "restart", "levels", "picker", "picker-title", "picker-grid", "daily", "export", "export-text", "close", "new-player"].map((id) => [id, document.getElementById(id)]));
els.undo.textContent = t.undo;
els.restart.textContent = t.restart;
els.levels.textContent = t.levels;
els.next.textContent = t.next;
els.daily.textContent = t.dailyButton;
els.export.textContent = t.export;
els["new-player"].textContent = t.newPlayer;
els.close.textContent = t.close;

const game = { index: 0, level: undefined, board: "", history: [], hearts: HEARTS, bumps: 0, preview: undefined };

function open(index, level = levels[index]) {
  game.index = index;
  game.level = level;
  game.board = level.board;
  game.history = [];
  game.hearts = HEARTS;
  game.bumps = 0;
  game.preview = undefined;
  record.start(level, index);
  render();
}

function openDaily() {
  const daily = generate(`day-${localDate()}`, { tier: "main", kind: "rescued" });
  // The control's daily board: the same size and number of arrows, without gravity.
  open(-1, control ? generate(`control-day-${localDate()}`, { tier: "main", kind: "control", arrows: daily.arrows }) : daily);
}

const over = () => isSolved(game.board) || game.hearts <= 0;

function tap(x, y) {
  if (over()) return;
  const { width, height } = game.level;
  const next = take(game.board, width, height, x, y, gravity);
  if (next === null) {
    game.hearts -= 1;
    game.bumps += 1;
    const pause = record.act("bumps");
    record.first("firstBump", pause);
    if (game.hearts <= 0) record.lost({ moves: game.history.length });
    // Draw first, then shake the new cell: drawing replaces every cell.
    render();
    flash(x, y, "shake");
    return;
  }
  record.act("moves");
  game.history.push(game.board);
  game.board = next;
  if (isSolved(game.board)) record.solved({ moves: game.history.length });
  render();
}

function flash(x, y, name) {
  const cell = els.board.querySelector(`[data-x="${x}"][data-y="${y}"]`);
  if (!cell) return;
  cell.classList.remove(name);
  void cell.offsetWidth;
  cell.classList.add(name);
}

function render() {
  const { width, height } = game.level;
  const preview = game.preview;
  const solved = isSolved(game.board);
  const left = game.board.replace(/\./g, "").length;
  els.title.textContent = game.index < 0 ? t.daily : t.level(game.index + 1, levels.length);
  els.status.textContent = t.status(left, Math.max(0, game.hearts)) + (control ? t.control : "");
  els.hint.textContent = !gravity ? t.hintPlain : previewOn ? t.hintGravity : t.hintGravityNoPreview;
  els.undo.disabled = !game.history.length || over();
  els.done.hidden = !over();
  els["done-text"].textContent = solved ? t.done(game.bumps) : t.out;
  els.next.hidden = !solved || game.index < 0 || game.index >= levels.length - 1;

  els.board.style.gridTemplateColumns = `repeat(${width}, var(--cell))`;
  const shown = preview?.board ?? game.board;
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const arrow = shown[y * width + x];
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      if (arrow !== ".") {
        cell.classList.add("arrow");
        cell.textContent = GLYPH[arrow];
        cell.dataset.testid = `arrow-${x}-${y}`;
        cell.dataset.press = `arrow-${x}-${y}`;
        cell.setAttribute("role", "button");
        cell.setAttribute("aria-label", `${arrow} at ${x + 1}, ${y + 1}`);
        if (!preview && canLeave(game.board, width, height, x, y)) cell.classList.add("free");
        if (preview && arrow !== game.board[y * width + x]) cell.classList.add("ghost");
        pressable(cell, {
          onTap: () => tap(x, y),
          onHold: previewOn ? () => hold(x, y) : undefined,
          onHoldEnd: () => {
            game.preview = undefined;
            render();
          },
        });
      }
      if (preview && preview.from.x === x && preview.from.y === y) cell.classList.add(preview.board ? "leaving" : "blocked");
      cells.push(cell);
    }
  }
  els.board.replaceChildren(...cells);
}

/** Holding an arrow shows the board after taking it, or that it would bump. Taking nothing. */
function hold(x, y) {
  if (over()) return;
  const { width, height } = game.level;
  record.act("previews");
  game.preview = { board: take(game.board, width, height, x, y, gravity) ?? undefined, from: { x, y } };
  render();
}

els.undo.addEventListener("click", () => {
  if (!game.history.length || over()) return;
  game.board = game.history.pop();
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
    width: game.level.width,
    height: game.level.height,
    board: game.board,
    hearts: game.hearts,
    moves: game.history.length,
    solved: isSolved(game.board),
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
