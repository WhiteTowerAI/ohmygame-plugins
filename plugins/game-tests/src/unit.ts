import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

// A project's own unit tests: the `test` script in its package.json, run as
// its package manager runs it, with the result shown beside the game tests.

/** Output a run keeps: its end, where test runners print what failed. */
export const UNIT_TEST_OUTPUT_CHARS = 64 * 1024;
/** Failing tests a run lists by name. */
export const UNIT_TEST_MAX_FAILURES = 50;
/** Tests a run lists, passed or not. */
export const UNIT_TEST_MAX_TESTS = 1000;
/** How long a run, or installing the dependencies it needs, may take before it is stopped. */
export const UNIT_TEST_TIMEOUT_MS = 5 * 60_000;

const MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof MANAGERS)[number];

export interface UnitTestScript {
  /** How it is run, such as `npm run test`. */
  command: string;
  /** The script itself, such as `vitest run`. */
  script: string;
}

/** A failing test, as the test runner's output names it. */
export interface UnitTestFailure {
  name: string;
  message?: string;
}

/** One test as the runner printed it, passed or not. */
export interface UnitTestCase {
  name: string;
  /** The groups (`describe`s) it is in, outermost first. */
  groups?: string[];
  /** Its file, when the runner says. */
  file?: string;
  status: "passed" | "failed" | "skipped";
  durationMs?: number;
  /** Why it failed, when the runner says. */
  message?: string;
}

export interface UnitTestRun {
  id: string;
  /** `error` when the tests couldn't be run at all, such as when installing failed. */
  status: "running" | "passed" | "failed" | "cancelled" | "error";
  /** While running: installing the project's dependencies first, or testing. */
  phase?: "installing" | "testing";
  startedAt: string;
  finishedAt?: string;
  command: string;
  exitCode?: number;
  /** Counts the test runner printed, when its summary is one this plugin reads. */
  passed?: number;
  failed?: number;
  failures?: UnitTestFailure[];
  /** Every test the runner listed, in its order, when its output is one this plugin reads. */
  tests?: UnitTestCase[];
  /** Why the tests couldn't be run, or didn't finish. */
  error?: string;
  /** The end of what the tests printed, without colors. */
  output: string;
}

export interface UnitTestsState {
  /** Undefined when the project has no `test` script. */
  script?: UnitTestScript;
  run?: UnitTestRun;
}

export class UnitTestError extends Error {}

/** The script npm init writes, which only says there are no tests. */
const PLACEHOLDER = /no test specified/i;
const LOCKFILES: [string, PackageManager][] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["package-lock.json", "npm"],
];

const exists = (file: string) => access(file).then(() => true, () => false);

/** The package manager a project names in package.json, or its lockfile shows; npm otherwise. */
export async function packageManager(folder: string, manifest: { packageManager?: unknown }): Promise<PackageManager> {
  if (typeof manifest.packageManager === "string") {
    const name = manifest.packageManager.split("@")[0] as PackageManager;
    if (MANAGERS.includes(name)) return name;
  }
  for (const [file, manager] of LOCKFILES) if (await exists(path.join(folder, file))) return manager;
  return "npm";
}

interface Found extends UnitTestScript {
  folder: string;
  manager: PackageManager;
}

async function findScript(folder: string): Promise<Found | undefined> {
  let manifest: { scripts?: Record<string, unknown>; packageManager?: unknown };
  try {
    manifest = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
  const script = manifest.scripts?.test;
  if (typeof script !== "string" || !script.trim() || PLACEHOLDER.test(script)) return undefined;
  const manager = await packageManager(folder, manifest);
  return { command: `${manager} run test`, script: script.trim(), folder, manager };
}

// Color codes and cursor moves, which runners may print even when asked not to.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** Keeps the end of what a run printed, within the limit. */
class Output {
  #text = "";
  append(chunk: string): void {
    this.#text += chunk.replace(ANSI, "").replace(/\r\n?/g, "\n");
    if (this.#text.length > UNIT_TEST_OUTPUT_CHARS * 2) this.#text = this.#text.slice(-UNIT_TEST_OUTPUT_CHARS);
  }
  get text(): string {
    return this.#text.length > UNIT_TEST_OUTPUT_CHARS ? `…\n${this.#text.slice(-UNIT_TEST_OUTPUT_CHARS)}` : this.#text;
  }
}

/**
 * What a run's output says: the counts and failing tests of the runners this
 * plugin reads (Node's test runner as TAP or spec, Vitest, Jest and Bun).
 * Anything else leaves them out, and the exit code alone says how it went.
 */
export function readUnitTestOutput(output: string): Pick<UnitTestRun, "passed" | "failed" | "failures" | "tests"> {
  const text = output.replace(ANSI, "");
  const number = (pattern: RegExp) => {
    const match = pattern.exec(text);
    return match ? Number(match[1]) : undefined;
  };
  let passed: number | undefined;
  let failed: number | undefined;
  const summary = /^\s*Tests\s+(.+?)\s*\(\d+\)\s*$/m.exec(text) ?? /^Tests:\s+(.+?),\s*\d+ total\s*$/m.exec(text);
  if (summary) {
    passed = Number(/(\d+) passed/.exec(summary[1]!)?.[1] ?? 0);
    failed = Number(/(\d+) failed/.exec(summary[1]!)?.[1] ?? 0);
  } else {
    passed = number(/^(?:#|ℹ) pass (\d+)\s*$/m) ?? number(/^\s*(\d+) pass\s*$/m);
    failed = number(/^(?:#|ℹ) fail (\d+)\s*$/m) ?? number(/^\s*(\d+) fail\s*$/m);
  }

  const failures = new Map<string, UnitTestFailure>();
  const add = (name: string, detail?: string) => {
    name = name.trim();
    if (!name || failures.has(name) || failures.size >= UNIT_TEST_MAX_FAILURES) return;
    failures.set(name, detail?.trim() ? { name, message: detail.trim() } : { name });
  };
  const lines = text.split("\n");
  const nextLine = (index: number) => lines.slice(index + 1).find((line) => line.trim())?.trim();
  const specFailures = lines.findIndex((line) => line.startsWith("✖ failing tests:"));
  lines.forEach((line, index) => {
    let match: RegExpExecArray | null;
    // Vitest: " FAIL  file.test.ts > group > name", then the error.
    if ((match = /^\s*FAIL\s+(\S.* > .+)$/.exec(line))) return add(match[1]!, nextLine(index));
    // Jest: "  ● group › name", then the error.
    if ((match = /^\s*● (.+ › .+)$/.exec(line))) return add(match[1]!, nextLine(index));
    // Bun: "(fail) group > name [1.00ms]".
    if ((match = /^\(fail\) (.+?)(?: \[[\d.]+m?s\])?$/.exec(line))) return add(match[1]!);
    // Node's spec reporter lists failing tests again at the end, without groups.
    if (specFailures >= 0 && index > specFailures && (match = /^✖ (.+?) \([\d.]+m?s\)$/.exec(line))) return add(match[1]!, nextLine(index));
    // Node's TAP reporter: "not ok 2 - name", then a YAML block with its error.
    if ((match = /^(\s*)not ok \d+ - (.+?)(?: # .*)?$/.exec(line))) {
      const block: string[] = [];
      for (const item of lines.slice(index + 1)) {
        if (item.trim() === "...") break;
        block.push(item);
      }
      // A group fails with its tests, which are listed on their own.
      if (block.some((item) => item.includes("failureType: 'subtestsFailed'"))) return;
      const at = block.findIndex((item) => /^\s*error: /.test(item));
      const value = at >= 0 ? block[at]!.replace(/^\s*error: /, "").trim() : undefined;
      const indent = at >= 0 ? /^\s*/.exec(block[at]!)![0].length : 0;
      // A message of several lines is a YAML block that starts on the next line.
      const continued = () => {
        const end = block.findIndex((item, row) => row > at && item.trim() && /^\s*/.exec(item)![0].length <= indent);
        return block.slice(at + 1, end < 0 ? undefined : end).map((item) => item.trim()).filter(Boolean).slice(0, 4).join(" ");
      };
      add(match[2]!, value && /^[|>][-+]?$/.test(value) ? continued() : value?.replace(/^(['"])(.*)\1$/, "$2"));
    }
  });
  // A list that has fewer tests than the runner counted, such as one that
  // names only failures, would say the others weren't there.
  const listed = readUnitTestList(text);
  const counted = (passed ?? 0) + (failed ?? 0);
  const tests = listed.filter((test) => test.status !== "skipped").length >= counted ? listed : [];
  // A failing test's message, from the failure that names it.
  for (const test of tests) {
    if (test.status !== "failed" || test.message) continue;
    const found = [...failures.values()].find((failure) => failure.name === test.name || /(?: > | › )/.test(failure.name) && failure.name.split(/ > | › /).at(-1) === test.name);
    if (found?.message) test.message = found.message;
  }
  passed ??= tests.length ? tests.filter((test) => test.status === "passed").length : undefined;
  failed ??= tests.length ? tests.filter((test) => test.status === "failed").length : undefined;
  return {
    ...(passed !== undefined ? { passed } : {}),
    ...(failed !== undefined ? { failed } : {}),
    ...(failures.size ? { failures: [...failures.values()] } : {}),
    ...(tests.length ? { tests } : {}),
  };
}

const TEST_FILE = /^\S*?[^\s/]+[._-](?:test|spec)\.[cm]?[jt]sx?$/;
const ms = (value: string | undefined, unit = "ms") => (value === undefined ? undefined : Number(value) * (unit === "s" ? 1000 : 1));
const indentOf = (line: string) => /^\s*/.exec(line)![0].length;
/** The groups open at a line's indent: those that started less indented. */
const groupsAt = (stack: { indent: number; name: string }[], indent: number) => {
  while (stack.length && stack.at(-1)!.indent >= indent) stack.pop();
  return stack.map((item) => item.name);
};

/**
 * Every test a run's output lists, passed, failed or skipped: Node's test
 * runner as TAP or spec, Vitest's verbose reporter, Jest's verbose output and
 * Bun. Groups that pass or fail with their tests aren't tests.
 */
export function readUnitTestList(text: string): UnitTestCase[] {
  const tests: UnitTestCase[] = [];
  const add = (test: UnitTestCase) => {
    if (tests.length >= UNIT_TEST_MAX_TESTS || !test.name.trim()) return;
    tests.push({
      name: test.name.trim(),
      ...(test.groups?.length ? { groups: test.groups } : {}),
      ...(test.file ? { file: test.file } : {}),
      status: test.status,
      ...(test.durationMs !== undefined && Number.isFinite(test.durationMs) ? { durationMs: test.durationMs } : {}),
      ...(test.message ? { message: test.message } : {}),
    });
  };
  const lines = text.split("\n");
  const subtests: { indent: number; name: string }[] = [];
  const suites: { indent: number; name: string }[] = [];
  const groups: { indent: number; name: string }[] = [];
  let file: string | undefined;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    let match: RegExpExecArray | null;
    // Node's spec reporter repeats the failures after its summary.
    if (line.startsWith("✖ failing tests:")) break;

    // Node, TAP: "# Subtest: name", then "ok 1 - name" and a YAML block.
    if ((match = /^(\s*)# Subtest: (.+)$/.exec(line))) {
      groupsAt(subtests, match[1]!.length);
      subtests.push({ indent: match[1]!.length, name: match[2]! });
      continue;
    }
    if ((match = /^(\s*)(not ok|ok) \d+ - (.+?)(?: # (SKIP|TODO)\b.*)?$/i.exec(line))) {
      const block: string[] = [];
      if (lines[index + 1]?.trim() === "---") for (const item of lines.slice(index + 2)) {
        if (item.trim() === "...") break;
        block.push(item);
      }
      const parents = groupsAt(subtests, match[1]!.length);
      if (block.some((item) => /^\s*type: 'suite'/.test(item))) continue;
      const duration = block.map((item) => /^\s*duration_ms: ([\d.]+)/.exec(item)?.[1]).find(Boolean);
      add({ name: match[3]!, groups: parents, status: match[4] ? "skipped" : match[2] === "ok" ? "passed" : "failed", durationMs: ms(duration) });
      continue;
    }

    // Node, spec: "▶ group", then "✔ name (0.2ms)", then the group's own line.
    if ((match = /^(\s*)▶ (.+?)(?: \([\d.]+m?s\))?$/.exec(line))) {
      const indent = match[1]!.length;
      const open = suites.at(-1);
      if (open?.indent === indent && open.name === match[2]) suites.pop();
      else {
        groupsAt(suites, indent);
        suites.push({ indent, name: match[2]! });
      }
      continue;
    }
    if ((match = /^(\s*)([✔✖﹣]) (.+?) \(([\d.]+)(m?s)\)(?: # (SKIP|TODO)\b.*)?$/.exec(line))) {
      const indent = match[1]!.length;
      const open = suites.at(-1);
      if (open?.indent === indent && open.name === match[3]) {
        suites.pop();
        continue;
      }
      add({ name: match[3]!, groups: groupsAt(suites, indent), status: match[2] === "﹣" || match[6] ? "skipped" : match[2] === "✔" ? "passed" : "failed", durationMs: ms(match[4], match[5]) });
      continue;
    }

    // Bun: "tests/rules.test.ts:", then "(pass) group > name [0.12ms]".
    if ((match = /^(\S+):$/.exec(line)) && TEST_FILE.test(match[1]!)) {
      file = match[1];
      continue;
    }
    if ((match = /^\((pass|fail|skip|todo)\) (.+?)(?: \[([\d.]+)(m?s)\])?$/.exec(line))) {
      const path = match[2]!.split(" > ");
      add({ name: path.pop()!, groups: path, file, status: match[1] === "pass" ? "passed" : match[1] === "fail" ? "failed" : "skipped", durationMs: ms(match[3], match[4]) });
      continue;
    }

    // Jest: "PASS ./rules.test.js", group lines, then "✓ name (3 ms)".
    if ((match = /^(PASS|FAIL) +(\S+)/.exec(line))) {
      file = match[2]!.replace(/^\.\//, "");
      groups.length = 0;
      continue;
    }
    if ((match = /^(\s+)([✓✕○✎]) (?:(skipped|todo) )?(.+?)(?: \((\d+) ms\))?$/.exec(line))) {
      const indent = match[1]!.length;
      const path = match[4]!.split(" > ");
      // Vitest's verbose reporter: "✓ rules.test.ts > group > name 1ms".
      if (path.length > 1 && TEST_FILE.test(path[0]!)) {
        const last = path.pop()!.replace(/ (\d+(?:\.\d+)?)(m?s)$/, "");
        const duration = / (\d+(?:\.\d+)?)(m?s)$/.exec(match[4]!);
        add({ name: last, groups: path.slice(1), file: path[0], status: match[2] === "✓" ? "passed" : match[2] === "✕" ? "failed" : "skipped", durationMs: ms(duration?.[1], duration?.[2]) });
        continue;
      }
      add({ name: match[4]!, groups: groupsAt(groups, indent), file, status: match[2] === "✓" ? "passed" : match[2] === "✕" ? "failed" : "skipped", durationMs: ms(match[5]) });
      continue;
    }
    // Vitest marks failures with × and skips with ↓; its passes use ✓, read above.
    if ((match = /^\s*([×↓]) (\S+) > (.+?)(?: (\d+(?:\.\d+)?)(m?s))?$/.exec(line)) && TEST_FILE.test(match[2]!)) {
      const path = match[3]!.split(" > ");
      const next = lines[index + 1]?.trim();
      add({ name: path.pop()!, groups: path, file: match[2], status: match[1] === "×" ? "failed" : "skipped", durationMs: ms(match[4], match[5]), message: next?.startsWith("→ ") ? next.slice(2) : undefined });
      continue;
    }
    // A group, in Jest's verbose output: an indented line within a file's results.
    if (file && /^\s+\S/.test(line) && !/^\s*[●›→]/.test(line) && groups !== undefined) {
      const indent = indentOf(line);
      const name = line.trim();
      if (!/^(Tests|Test Suites|Snapshots|Time):/.test(name)) {
        groupsAt(groups, indent);
        groups.push({ indent, name });
      }
    }
  }
  return tests;
}

/**
 * What makes the script's runner name every test: Vitest and Jest list only
 * failures unless asked. Only for a script that is that runner alone, where
 * extra arguments reach it; npm passes them after `--`.
 */
export function listingArguments(script: string, manager: PackageManager): string[] {
  if (/[;&|<>`$]/.test(script)) return [];
  const runner = /^(?:npx\s+|bunx\s+|pnpm\s+(?:exec\s+)?|yarn\s+)?(vitest|jest)(?:\s|$)/.exec(script.trim())?.[1];
  const extra = runner === "vitest" ? ["--reporter=verbose"] : runner === "jest" ? ["--verbose"] : [];
  return extra.length && manager === "npm" ? ["--", ...extra] : extra;
}

class Cancelled extends Error {}

/** The plugin host's environment without the app's own settings, which aren't for project code. */
function environment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(result)) if (name.toUpperCase().startsWith("OHMYGAME_")) delete result[name];
  // Runners that would watch for changes run once, and print plain text.
  return { ...result, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" };
}

/** Runs a command until it exits, stopping it and what it started when the signal aborts or time runs out. */
function runCommand(command: string, args: string[], cwd: string, output: Output, signal: AbortSignal, timeoutMs: number): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const windows = process.platform === "win32";
    const child = spawn(command, args, { cwd, env: environment(), stdio: ["ignore", "pipe", "pipe"], detached: !windows, shell: windows, windowsHide: true });
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => output.append(chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => output.append(chunk));
    let stopped: Error | undefined;
    const kill = () => {
      if (!child.pid) return;
      try {
        if (windows) spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
        else process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const stop = (reason: Error) => {
      stopped ??= reason;
      kill();
    };
    const abort = () => stop(new Cancelled());
    const timer = setTimeout(() => stop(new UnitTestError(`The tests didn't finish within ${Math.round(timeoutMs / 60_000)} minutes, so they were stopped.`)), timeoutMs);
    if (signal.aborted) abort();
    signal.addEventListener("abort", abort, { once: true });
    child.once("error", (cause) => {
      stopped ??= cause;
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      // A test's own processes may outlive the runner.
      kill();
      if (stopped) reject(stopped);
      else resolve(code ?? undefined);
    });
  });
}

/** The project's unit tests and their latest run. One run at a time; a new one ends the last. */
export class UnitTests {
  #current: { run: UnitTestRun; controller: AbortController; done: Promise<UnitTestRun> } | undefined;

  constructor(
    private readonly folder: string,
    private readonly options: { timeoutMs?: number; onChange?: (run: UnitTestRun) => void } = {},
  ) {}

  async state(): Promise<UnitTestsState> {
    const found = await findScript(this.folder);
    const run = this.#current?.run;
    return { ...(found ? { script: { command: found.command, script: found.script } } : {}), ...(run ? { run: structuredClone(run) } : {}) };
  }

  /** Starts a run, ending the current one. The returned run finishes with `done`. */
  async start(): Promise<{ run: UnitTestRun; done: Promise<UnitTestRun> }> {
    const found = await findScript(this.folder);
    if (!found) throw new UnitTestError('This project has no unit tests: its package.json has no "test" script.');
    await this.cancel();
    const run: UnitTestRun = { id: randomUUID(), status: "running", phase: "testing", startedAt: new Date().toISOString(), command: found.command, output: "" };
    const controller = new AbortController();
    const current = { run, controller, done: Promise.resolve(run) };
    this.#current = current;
    const changed = () => {
      if (this.#current === current) this.options.onChange?.(structuredClone(run));
    };
    const output = new Output();
    const timeoutMs = this.options.timeoutMs ?? UNIT_TEST_TIMEOUT_MS;
    current.done = (async () => {
      try {
        // The preview usually installed them already; a project opened fresh may not have them yet.
        if (!(await exists(path.join(found.folder, "node_modules")))) {
          run.phase = "installing";
          changed();
          const code = await runCommand(found.manager, ["install"], found.folder, output, controller.signal, timeoutMs);
          if (code !== 0) throw new UnitTestError(`Installing the project's dependencies failed (exit code ${code ?? "unknown"}).`);
          run.phase = "testing";
          changed();
        }
        const code = await runCommand(found.manager, ["run", "test", ...listingArguments(found.script, found.manager)], found.folder, output, controller.signal, timeoutMs);
        Object.assign(run, readUnitTestOutput(output.text), { exitCode: code, status: code === 0 ? "passed" : "failed" });
      } catch (cause) {
        if (controller.signal.aborted || cause instanceof Cancelled) run.status = "cancelled";
        else {
          run.status = "error";
          run.error = cause instanceof Error ? cause.message : String(cause);
        }
      }
      delete run.phase;
      run.output = output.text;
      run.finishedAt = new Date().toISOString();
      changed();
      return run;
    })();
    changed();
    return { run: structuredClone(run), done: current.done };
  }

  /** Runs the tests and waits for the result; aborting the signal ends the run. */
  async run(signal?: AbortSignal): Promise<UnitTestRun> {
    const { done } = await this.start();
    const current = this.#current;
    const cancel = () => current?.controller.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      return structuredClone(await done);
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  async cancel(): Promise<void> {
    const current = this.#current;
    if (!current || current.run.status !== "running") return;
    current.controller.abort();
    await current.done.catch(() => undefined);
  }

  dispose(): void {
    this.#current?.controller.abort();
  }
}
