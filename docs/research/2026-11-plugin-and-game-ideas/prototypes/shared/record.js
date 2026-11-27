// The playtest record both prototypes keep on the device, shaped for the
// validation sheets. Each player has their own record (`?player=` or New
// player), so five people on one test phone don't mix. Each level keeps every
// try, written as it happens, so a level someone gives up on still says what
// they did; and an ordered log of the levels played gives the "next level"
// rate.
//
// A try (and its entry in the log) only starts once the player does something
// on the level: opening one and leaving, or the page opening on the last
// tester's level before New player is pressed, records nothing.

const now = () => Date.now();

export function createRecorder(game, version) {
  const params = new URLSearchParams(location.search);
  const playerKey = `${game}:player`;
  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private browsing: kept for this visit only.
    }
  };
  let player = params.get("player") || read(playerKey, "player-1");
  write(playerKey, player);
  const key = () => `${game}:${version}:${player}`;
  let data;
  /** The level on screen, before the player has done anything there. */
  let pending;
  /** The try in progress. */
  let active;
  const save = () => write(key(), data);

  /** Loads the player's record; a try a reload or a closed tab left open ends as abandoned. */
  const load = () => {
    data = read(key(), { levels: {}, opens: [], current: undefined });
    let closed = false;
    for (const entry of Object.values(data.levels))
      for (const item of entry.tries)
        if (!item.outcome) {
          Object.assign(item, { outcome: "abandoned", reason: "reload", endedAt: item.lastActionAt ? new Date(item.lastActionAt).toISOString() : undefined });
          closed = true;
        }
    if (closed) save();
  };
  load();

  /** Ends the try in progress, if there is one, as abandoned unless said otherwise. */
  const end = (outcome = "abandoned", extra = {}) => {
    if (!active || active.outcome) return;
    Object.assign(active, { outcome, endedAt: new Date().toISOString(), ...extra });
    active = undefined;
    save();
  };

  /** The try for the level on screen, made when the player first does something there. */
  const current = () => {
    if (active) return active;
    if (!pending) return undefined;
    const { level, index, startedAt, t0 } = pending;
    const daily = index < 0;
    const entry = (data.levels[level.seed] ??= { level: index + 1, seed: level.seed, kind: level.kind, daily, tier: level.tier, difficulty: level.optimal ?? level.arrows, tries: [] });
    active = { startedAt, t0, lastActionAt: t0, moves: 0, undos: 0, previews: 0, bumps: 0, outcome: undefined };
    entry.tries.push(active);
    data.opens.push({ seed: level.seed, kind: level.kind, daily, at: startedAt });
    pending = undefined;
    return active;
  };

  return {
    get player() {
      return player;
    },
    /** The level index the player was last on, to resume after a reload: -1 for the daily level. */
    get current() {
      return data.current;
    },
    /** A level opens: ends the try before. Nothing is recorded until the player acts. */
    start(level, index) {
      end();
      pending = { level, index, startedAt: new Date().toISOString(), t0: now() };
      data.current = index;
      save();
    },
    /**
     * A move (or a bump, or an undo): counts it, and returns the pause since
     * the player's last such action, or since the level opened.
     */
    act(field) {
      const item = current();
      if (!item) return 0;
      const at = now();
      const pause = at - item.lastActionAt;
      item.lastActionAt = at;
      if (field) item[field] = (item[field] ?? 0) + 1;
      save();
      return pause;
    },
    /** Counts something that isn't a move, such as a preview, without resetting the pause. */
    note(field) {
      const item = current();
      if (!item) return;
      item[field] = (item[field] ?? 0) + 1;
      save();
    },
    /** Notes something once per try, such as the first overflow, with when it happened and the pause before it. */
    first(name, pause) {
      const item = current();
      if (!item || item[name]) return;
      item[name] = { atMs: now() - item.t0, pauseMs: pause, previewsBefore: item.previews, movesBefore: item.moves };
      save();
    },
    solved(extra) {
      const item = current();
      end("solved", { ms: item ? now() - item.t0 : undefined, ...extra });
    },
    lost(extra) {
      current();
      end("lost", extra);
    },
    /** The next free name, across every version, so tester records never merge. */
    newPlayer() {
      end();
      pending = undefined;
      const taken = new Set(Object.keys(localStorage).filter((item) => item.startsWith(`${game}:`) && item !== playerKey).map((item) => item.split(":").pop()));
      let n = 1;
      while (taken.has(`player-${n}`)) n += 1;
      player = `player-${n}`;
      write(playerKey, player);
      // A `?player=` left in the address would bring the last tester back on reload.
      if (params.has("player")) {
        params.delete("player");
        const search = params.toString();
        history.replaceState(null, "", `${location.pathname}${search ? `?${search}` : ""}${location.hash}`);
      }
      load();
      // Keep the new name in the store even before they play.
      save();
      return player;
    },
    export() {
      return {
        game,
        version,
        player,
        userAgent: navigator.userAgent,
        exportedAt: new Date().toISOString(),
        opens: data.opens,
        levels: Object.values(data.levels).map((entry) => ({ ...entry, tries: entry.tries.map(({ t0, lastActionAt, ...rest }) => rest) })),
      };
    },
  };
}

/** Today's date where the player is, for the daily level. */
export function localDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days since 1970 for a local date string, to pick a daily level from a pool. */
export function dayNumber(date = localDate()) {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** A 1-based level number from text, or undefined. */
export function levelNumber(value, count) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, count) : undefined;
}

const SLOP_PX = 10;

/**
 * Tap and hold on an element, one finger at a time.
 * - `onTap` runs when the finger lifts over the same element.
 * - `onHold` runs once the finger has stayed `holdMs`. It returns true when it
 *   showed something; then lifting the finger calls `onHoldEnd`, not `onTap`.
 *   A hold that showed nothing is still a tap, however long it was.
 * - Moving more than a few pixels before the hold, lifting elsewhere, or the
 *   browser cancelling the gesture does nothing (or ends a hold).
 */
export function pressable(element, { holdMs = 500, onTap, onHold, onHoldEnd }) {
  element.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) return;
    event.preventDefault();
    const id = event.pointerId;
    const start = { x: event.clientX, y: event.clientY };
    let held = false;
    let done = false;
    const timer = setTimeout(() => {
      held = onHold?.() === true;
    }, holdMs);
    const finish = (tapped) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("pointermove", move);
      if (held) onHoldEnd?.();
      else if (tapped) onTap?.();
    };
    const over = (upEvent) => {
      const under = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      return Boolean(under && (under === element || element.contains(under) || under.closest?.("[data-press]")?.dataset.press === element.dataset.press));
    };
    const up = (upEvent) => upEvent.pointerId === id && finish(over(upEvent));
    const cancel = (cancelEvent) => cancelEvent.pointerId === id && finish(false);
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== id || held) return;
      if (Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) > SLOP_PX) finish(false);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("pointermove", move);
  });
}
