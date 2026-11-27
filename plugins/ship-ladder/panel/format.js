// The Ship ladder panel's logic apart from the page, so it can be tested
// without a browser.

export const SHIP_FILE = "design/ship.json";

/** The requests the panel puts in the composer, the same as the plugin's commands; in English, as text to the agent is. */
export const STARTER_PROMPT =
  "Before building, write design/ship.json for a new game with me: a ship date, where it goes out, the core loop in one sentence, and a not-doing list that keeps the first version small enough to finish by that date. Ask me what the game is about first.";
export const FALLBACK_PROMPT =
  "The jam deadline is close. Freeze features: add nothing new. Fix only what stops the game from starting or being finished, check it with game_test or game_use, then export the web build so it can be submitted. Say what you left out.";

/** Lines of a text box as a list, without blanks. */
export const lines = (text) => String(text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
/** A comma- or line-separated list. */
export const list = (text) => String(text ?? "").split(/[,\n，]/).map((item) => item.trim()).filter(Boolean);

/** "2026-12-07 23:00" in the person's time zone as an ISO time, or undefined. */
export function localToIso(text) {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/.exec(String(text ?? "").trim());
  if (!match) return undefined;
  const date = new Date(`${match[1]}T${match[2].padStart(2, "0")}:${match[3]}:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** An ISO time as "2026-12-07 23:00" in the person's time zone. */
export function isoToLocal(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The plan file with the form's fields set, keeping everything else it holds,
 * such as a coreProbe the agent wrote. Empty fields are removed. Returns the
 * text and what's wrong with the form, if anything.
 */
export function mergePlan(originalText, form) {
  let plan = {};
  if (originalText) {
    try {
      const value = JSON.parse(originalText);
      if (value && typeof value === "object" && !Array.isArray(value)) plan = value;
    } catch {
      return { error: "unreadable" };
    }
  }
  const next = { ...plan };
  const set = (key, value) => {
    if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) delete next[key];
    else next[key] = value;
  };
  const date = String(form.shipDate ?? "").trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "shipDate" };
  set("shipDate", date);
  set("platforms", list(form.platforms));
  set("core", String(form.core ?? "").trim());
  set("notDoing", lines(form.notDoing));
  const deadline = String(form.jamDeadline ?? "").trim();
  if (deadline) {
    const iso = localToIso(deadline);
    if (!iso) return { error: "jamDeadline" };
    const jam = { ...(plan.jam && typeof plan.jam === "object" ? plan.jam : {}), deadline: iso };
    const name = String(form.jamName ?? "").trim();
    if (name) jam.name = name;
    else delete jam.name;
    next.jam = jam;
  } else delete next.jam;
  return { text: `${JSON.stringify(next, null, 2)}\n` };
}

/** The form's fields from a plan. */
export function formOf(plan) {
  return {
    shipDate: plan?.shipDate ?? "",
    platforms: (plan?.platforms ?? []).join(", "),
    core: plan?.core ?? "",
    notDoing: (plan?.notDoing ?? []).join("\n"),
    jamDeadline: plan?.jam?.deadline ? isoToLocal(plan.jam.deadline) : "",
    jamName: plan?.jam?.name ?? "",
  };
}

/** Whether the panel should offer the fallback build: within the last day, once per deadline. */
export function dueForFallback(jam, asked, now = Date.now()) {
  if (!jam?.deadline) return false;
  const left = Date.parse(jam.deadline) - now;
  return left > 0 && left <= 24 * 60 * 60 * 1000 && !asked.includes(jam.deadline);
}

export function countdown(deadline, now = Date.now()) {
  const left = Date.parse(deadline) - now;
  if (!(left > 0)) return { over: true, days: 0, hours: 0, minutes: 0 };
  const minutes = Math.floor(left / 60000);
  return { over: false, days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}

/** Days until the ship date, counting today as 0. */
export function daysUntil(date, now = new Date()) {
  const [year, month, day] = String(date).split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const target = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
