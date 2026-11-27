// design/ship.json: the plan every agent reads before it works on the game.
// The person and the agent both write it; this reads it leniently, so a
// half-written plan still gives what it has, and says what's wrong with it.

export const SHIP_FILE = "design/ship.json";

export interface CoreProbe {
  /** What a player does, as game_use's actions. */
  actions: unknown[];
  /** A dotted path into the game's playtest snapshot whose value the actions should change, such as "score". */
  state: string;
}

export interface ShipPlan {
  /** The day the game goes out, YYYY-MM-DD. */
  shipDate?: string;
  /** Where it goes out, such as "itch.io" or "OhMyGame Community". */
  platforms: string[];
  /** The game in one sentence: what the player does, again and again. */
  core?: string;
  /** What this version leaves out. */
  notDoing: string[];
  jam?: { name?: string; deadline: string; submitUrl?: string };
  coreProbe?: CoreProbe;
}

export interface ShipRead {
  plan?: ShipPlan;
  problems: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()) : [];

export function readShip(text: string | undefined): ShipRead {
  if (text === undefined) return { problems: [] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    return { problems: [`${SHIP_FILE} isn't valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { problems: [`${SHIP_FILE} should hold an object`] };
  const raw = value as Record<string, unknown>;
  const problems: string[] = [];
  const plan: ShipPlan = { platforms: strings(raw.platforms), notDoing: strings(raw.notDoing) };
  if (typeof raw.shipDate === "string" && DATE.test(raw.shipDate) && !Number.isNaN(Date.parse(raw.shipDate))) plan.shipDate = raw.shipDate;
  else if (raw.shipDate !== undefined) problems.push("shipDate should be a date written YYYY-MM-DD");
  if (typeof raw.core === "string" && raw.core.trim()) plan.core = raw.core.trim();
  const jam = raw.jam as Record<string, unknown> | undefined;
  if (jam && typeof jam === "object") {
    if (typeof jam.deadline === "string" && !Number.isNaN(Date.parse(jam.deadline))) {
      plan.jam = { deadline: new Date(jam.deadline).toISOString() };
      if (typeof jam.name === "string" && jam.name.trim()) plan.jam.name = jam.name.trim();
      if (typeof jam.submitUrl === "string" && /^https:\/\//.test(jam.submitUrl)) plan.jam.submitUrl = jam.submitUrl;
    } else problems.push("jam.deadline should be a date and time, such as 2026-12-07T23:00:00+08:00");
  }
  const probe = raw.coreProbe as Record<string, unknown> | undefined;
  if (probe && typeof probe === "object") {
    if (Array.isArray(probe.actions) && probe.actions.length && typeof probe.state === "string" && probe.state.trim())
      plan.coreProbe = { actions: probe.actions, state: probe.state.trim() };
    else problems.push("coreProbe needs actions (game_use actions) and state (a path in the game's snapshot)");
  }
  return { plan, problems };
}

/** A plan as the panel and the agent write it: stable key order, two-space JSON. */
export function writeShip(plan: ShipPlan): string {
  const ordered: Record<string, unknown> = {
    $schema: "https://raw.githubusercontent.com/WhiteTowerAI/ohmygame-plugins/main/plugins/ship-ladder/schemas/ship.json",
    shipDate: plan.shipDate,
    platforms: plan.platforms,
    core: plan.core,
    notDoing: plan.notDoing,
    jam: plan.jam,
    coreProbe: plan.coreProbe,
  };
  return `${JSON.stringify(ordered, (_key, value) => (value === undefined ? undefined : value), 2)}\n`;
}
