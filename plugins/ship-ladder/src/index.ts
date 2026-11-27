import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PluginContext } from "../../../app/src/shared/extension-host-protocol.js";
import type { PluginHookInputs } from "../../../app/src/shared/plugin-hooks.js";
import { coreProbe, startCheck } from "./check.ts";
import { jamKey, shouldRemind, timeLeft } from "./jam.ts";
import { emptyState, gameTestVerdict, isGameTestTool, judge, standing, type LadderState, type Rung } from "./ladder.ts";
import { readShip, SHIP_FILE } from "./ship.ts";

// The Ship ladder's native side. It keeps each project's ladder in the
// plugin's data folder, hears Game Tests' results and the end of each turn,
// and runs the checks the panel asks for. The plan itself, design/ship.json,
// is the project's: the panel and the agent write it.

export const JAM_NOTICE =
  "Less than 24 hours to the jam deadline. Open the Ship ladder panel and choose Ship the fallback build. 离 Jam 截止不到 24 小时：打开“发布阶梯”面板，选“出保底版本”。";

export function stateFile(dataFolder: string, projectFolder: string): string {
  const key = createHash("sha256").update(path.resolve(projectFolder)).digest("hex").slice(0, 32);
  return path.join(dataFolder, "ladders", `${key}.json`);
}

/** The ladder on disk, read and written one change at a time. */
export class LadderStore {
  #file: string;
  #queue: Promise<unknown> = Promise.resolve();
  constructor(file: string) {
    this.#file = file;
  }
  async read(): Promise<LadderState> {
    try {
      const value = JSON.parse(await readFile(this.#file, "utf8")) as LadderState;
      return value?.version === 1 ? { ...emptyState(), ...value } : emptyState();
    } catch {
      return emptyState();
    }
  }
  update(change: (state: LadderState) => LadderState): Promise<LadderState> {
    const next = this.#queue.then(async () => {
      const state = change(await this.read());
      await mkdir(path.dirname(this.#file), { recursive: true });
      const temporary = `${this.#file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(state));
      await rename(temporary, this.#file);
      return state;
    });
    this.#queue = next.catch(() => {});
    return next;
  }
}

const RUNG_INPUT = new Set<Rung>(["core", "loop"]);

export function activate(context: PluginContext): void {
  const folder = context.project?.folder;
  if (!folder) return;
  const store = new LadderStore(stateFile(context.dataFolder, folder));
  const plan = async () => readShip(await readFile(path.join(folder, SHIP_FILE), "utf8").catch(() => undefined));
  const now = () => new Date();

  const view = async (state?: LadderState) => {
    const ladder = state ?? (await store.read());
    const { plan: ship, problems } = await plan();
    return {
      file: SHIP_FILE,
      plan: ship ?? null,
      problems,
      ladder: standing(ladder),
      firstPassed: ladder.firstPassed,
      jam: ship?.jam ? { ...ship.jam, left: timeLeft(ship.jam.deadline, now()) } : null,
      canProbe: Boolean(ship?.coreProbe),
    };
  };

  context.registerHook("tool.afterCall", async (input) => {
    const result = input as PluginHookInputs["tool.afterCall"];
    // Listing the tests says nothing about whether the game starts.
    if (!isGameTestTool(result.tool) || result.args?.operation === "list") return;
    const { verdict, detail } = gameTestVerdict(result);
    await store.update((state) => {
      // A run that can't be judged doesn't take away what an earlier one showed.
      if (verdict === "unknown" && state.rungs.starts && state.rungs.starts.verdict !== "unknown") return state;
      return judge(state, "starts", { verdict, source: "game-tests", at: now().toISOString(), detail });
    });
  });

  context.registerHook("turn.completed", async () => {
    const { plan: ship } = await plan();
    const state = await store.read();
    if (!ship?.jam || !shouldRemind(ship.jam, state.reminded, now())) return;
    await store.update((current) => ({ ...current, reminded: [...current.reminded, jamKey(ship.jam!)] }));
    // Open the panel once, which offers the fallback build; a closed project can't.
    await context.panels?.open("ladder", { state: { jamAlert: true } }).catch(() => {});
    return { notice: JAM_NOTICE, tone: "danger" };
  });

  context.registerCommand("state", () => view());

  context.registerCommand("check", async (_input, call) => {
    if (!context.game) throw new Error("This project's game can't be opened for a check.");
    call.progress("Opening the game");
    const started = await startCheck(context.game, call.signal);
    let state = await store.update((current) => judge(current, "starts", { ...started, source: "check", at: now().toISOString() }));
    const { plan: ship } = await plan();
    if (ship?.coreProbe && started.verdict === "passed") {
      call.progress("Playing the core probe");
      const probed = await coreProbe(context.game, ship.coreProbe, call.signal);
      // The person's own tick stands unless the probe sees the loop work.
      state = await store.update((current) =>
        current.rungs.core?.source === "person" && probed.verdict !== "passed" ? current : judge(current, "core", { ...probed, source: "probe", at: now().toISOString() }),
      );
    }
    return view(state);
  });

  context.registerCommand("mark", async (input) => {
    const { rung, done } = (input ?? {}) as { rung?: Rung; done?: boolean };
    if (!rung || !RUNG_INPUT.has(rung)) throw new Error("Only the core loop and losing and playing again are ticked by hand.");
    const state = await store.update((current) => {
      if (done) return judge(current, rung, { verdict: "passed", source: "person", at: now().toISOString() });
      const rungs = { ...current.rungs };
      delete rungs[rung];
      return { ...current, rungs };
    });
    return view(state);
  });
}
