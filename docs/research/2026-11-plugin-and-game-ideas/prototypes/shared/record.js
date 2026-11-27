// The playtest record both prototypes keep on the device, shaped for the
// validation sheets. Each player has their own record (`?player=` or New
// player), so five people on one test phone don't mix. Each level keeps every
// try, written as it happens, so a level someone gives up on still says what
// they did; and an ordered log of level opens gives the "next level" rate.

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
  let data = read(key(), { levels: {}, opens: [], current: undefined });
  let active;
  const save = () => write(key(), data);

  /** Ends the try in progress, if there is one, as abandoned unless said otherwise. */
  const end = (outcome = "abandoned", extra = {}) => {
    if (!active || active.outcome) return;
    Object.assign(active, { outcome, endedAt: new Date().toISOString(), ...extra });
    active = undefined;
    save();
  };

  return {
    get player() {
      return player;
    },
    /** The level index the player was last on, to resume after a reload. */
    get current() {
      return data.current;
    },
    /** A new try: ends the one before, logs the open, and returns the try to fill in. */
    start(level, index) {
      end();
      const entry = (data.levels[level.seed] ??= { level: index + 1, seed: level.seed, kind: level.kind, tier: level.tier, difficulty: level.optimal ?? level.arrows, tries: [] });
      active = { startedAt: new Date().toISOString(), t0: now(), lastActionAt: now(), moves: 0, undos: 0, previews: 0, bumps: 0, outcome: undefined };
      entry.tries.push(active);
      data.opens.push({ seed: level.seed, kind: level.kind, at: active.startedAt });
      data.current = index;
      save();
      return active;
    },
    /** Something the player did: counts it and remembers when, for pauses. */
    act(field) {
      if (!active) return 0;
      const at = now();
      const pause = at - active.lastActionAt;
      active.lastActionAt = at;
      if (field) active[field] = (active[field] ?? 0) + 1;
      save();
      return pause;
    },
    /** Notes something once per try, such as the first overflow, with when it happened and the pause before it. */
    first(name, pause) {
      if (!active || active[name]) return;
      active[name] = { atMs: now() - active.t0, pauseMs: pause, previewsBefore: active.previews, movesBefore: active.moves };
      save();
    },
    solved(extra) {
      end("solved", { ms: active ? now() - active.t0 : undefined, ...extra });
    },
    lost(extra) {
      end("lost", extra);
    },
    newPlayer() {
      end();
      const taken = new Set(Object.keys(localStorage).filter((item) => item.startsWith(`${game}:${version}:`)).map((item) => item.split(":").pop()));
      let n = 1;
      while (taken.has(`player-${n}`)) n += 1;
      player = `player-${n}`;
      write(playerKey, player);
      data = read(key(), { levels: {}, opens: [], current: undefined });
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

/** A 1-based level number from text, or undefined. */
export function levelNumber(value, count) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, count) : undefined;
}

/**
 * Tap and hold on an element: `onTap` when it's released on the same element
 * before `holdMs`, `onHold` once held that long, and `onHoldEnd` when a hold
 * ends. A cancelled gesture or a release elsewhere does nothing.
 */
export function pressable(element, { holdMs = 500, onTap, onHold, onHoldEnd }) {
  element.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    let held = false;
    const timer = setTimeout(() => {
      held = true;
      onHold?.();
    }, holdMs);
    const finish = (tapped) => {
      clearTimeout(timer);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (held) onHoldEnd?.();
      else if (tapped) onTap?.();
    };
    const up = (upEvent) => {
      const under = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      finish(Boolean(under && (under === element || element.contains(under) || under.closest?.("[data-press]")?.dataset.press === element.dataset.press)));
    };
    const cancel = () => finish(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  });
}
