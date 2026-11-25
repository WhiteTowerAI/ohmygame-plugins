import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listingArguments, readUnitTestOutput, UnitTestError, UnitTests, type UnitTestRun } from "../../plugins/game-tests/src/unit.ts";

// Excerpts of what each runner prints with no terminal attached.
const NODE_TAP = `TAP version 13
# Subtest: bomb beats pair
ok 1 - bomb beats pair
  ---
  duration_ms: 0.256208
  ...
# Subtest: three of a kind needs three
not ok 2 - three of a kind needs three
  ---
  duration_ms: 0.578708
  failureType: 'testCodeFailure'
  error: '1 == 2'
  code: 'ERR_ASSERTION'
  ...
# Subtest: turns
    # Subtest: cannot pass first
    not ok 1 - cannot pass first
      ---
      failureType: 'testCodeFailure'
      error: 'boom'
      ...
    # Subtest: four of a kind is a bomb
    not ok 2 - four of a kind is a bomb
      ---
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly equal:

        4 !== 5
      ...
    1..2
not ok 3 - turns
  ---
  type: 'suite'
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  ...
1..3
# tests 3
# suites 1
# pass 1
# fail 2
`;
const NODE_SPEC = `✔ bomb beats pair (0.254125ms)
✖ three of a kind needs three (0.296ms)
  AssertionError [ERR_ASSERTION]: 1 == 2
      at TestContext.<anonymous> (file:///game/rules.test.mjs:3:52)
▶ turns
  ✖ cannot pass first (0.033ms)
    Error: boom
✖ turns (0.165459ms)
ℹ tests 3
ℹ suites 1
ℹ pass 1
ℹ fail 2

✖ failing tests:

test at rules.test.mjs:3:1
✖ three of a kind needs three (0.296ms)
  AssertionError [ERR_ASSERTION]: 1 == 2

test at rules.test.mjs:4:67
✖ cannot pass first (0.033ms)
  Error: boom
`;
const VITEST = `\u001b[1m RUN \u001b[22m v5.0.5 /game

 ❯ rules.test.ts (4 tests | 2 failed) 4ms
   × three of a kind needs three 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  rules.test.ts > three of a kind needs three
AssertionError: expected 1 to be 2 // Object.is equality

 FAIL  rules.test.ts > turns > cannot pass first
Error: boom

 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
`;
const JEST = `FAIL ./rules.test.js
  ● turns › cannot pass first

    boom

Tests:       1 failed, 3 passed, 4 total
`;
const BUN = `error: boom
(fail) turns > cannot pass first [0.05ms]

 3 pass
 1 fail
Ran 4 tests across 1 file. [28.00ms]
`;

// With their tests listed: Vitest's verbose reporter, Jest's --verbose, and Bun.
const VITEST_VERBOSE = ` RUN  v5.0.5 /game

 ✓ rules.test.ts > bomb beats pair 1ms
 × rules.test.ts > turns > cannot pass first 2ms
   → boom
 ↓ rules.test.ts > turns > later

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 1 skipped (3)
`;
const JEST_VERBOSE = `PASS ./cards.test.js
  ✓ bomb beats pair (3 ms)
FAIL ./rules.test.js
  turns
    ✓ starts with player one (1 ms)
    ✕ cannot pass first (2 ms)
    ○ skipped later

  ● turns › cannot pass first

    boom

Tests:       1 failed, 1 skipped, 2 passed, 4 total
`;
const BUN_FULL = `tests/rules.test.ts:
(pass) bomb beats pair [0.12ms]
error: boom
(fail) turns > cannot pass first [0.05ms]
(skip) turns > later

 1 pass
 1 skip
 1 fail
Ran 3 tests across 1 file. [28.00ms]
`;

describe("reading a unit test run's output", () => {
  it("reads Node's test runner as TAP, leaving out groups that fail with their tests", () => {
    expect(readUnitTestOutput(NODE_TAP)).toEqual({
      passed: 1,
      failed: 2,
      failures: [
        { name: "three of a kind needs three", message: "1 == 2" },
        { name: "cannot pass first", message: "boom" },
        { name: "four of a kind is a bomb", message: "Expected values to be strictly equal: 4 !== 5" },
      ],
      tests: [
        { name: "bomb beats pair", status: "passed", durationMs: 0.256208 },
        { name: "three of a kind needs three", status: "failed", durationMs: 0.578708, message: "1 == 2" },
        { name: "cannot pass first", groups: ["turns"], status: "failed", message: "boom" },
        { name: "four of a kind is a bomb", groups: ["turns"], status: "failed", message: "Expected values to be strictly equal: 4 !== 5" },
      ],
    });
  });

  it("reads Node's spec reporter from its list of failing tests", () => {
    expect(readUnitTestOutput(NODE_SPEC)).toEqual({
      passed: 1,
      failed: 2,
      failures: [
        { name: "three of a kind needs three", message: "AssertionError [ERR_ASSERTION]: 1 == 2" },
        { name: "cannot pass first", message: "Error: boom" },
      ],
      tests: [
        { name: "bomb beats pair", status: "passed", durationMs: 0.254125 },
        { name: "three of a kind needs three", status: "failed", durationMs: 0.296, message: "AssertionError [ERR_ASSERTION]: 1 == 2" },
        { name: "cannot pass first", groups: ["turns"], status: "failed", durationMs: 0.033, message: "Error: boom" },
      ],
    });
  });

  it("reads Vitest, Jest and Bun", () => {
    expect(readUnitTestOutput(VITEST)).toEqual({
      passed: 2,
      failed: 2,
      failures: [
        { name: "rules.test.ts > three of a kind needs three", message: "AssertionError: expected 1 to be 2 // Object.is equality" },
        { name: "rules.test.ts > turns > cannot pass first", message: "Error: boom" },
      ],
    });
    expect(readUnitTestOutput(JEST)).toEqual({ passed: 3, failed: 1, failures: [{ name: "turns › cannot pass first", message: "boom" }] });
    // Bun's excerpt names only the failure, fewer than it counted, so there is no list.
    expect(readUnitTestOutput(BUN)).toEqual({ passed: 3, failed: 1, failures: [{ name: "turns > cannot pass first" }] });
  });

  it("lists every test Vitest, Jest and Bun name, with their files and groups", () => {
    expect(readUnitTestOutput(VITEST_VERBOSE).tests).toEqual([
      { name: "bomb beats pair", file: "rules.test.ts", status: "passed", durationMs: 1 },
      { name: "cannot pass first", groups: ["turns"], file: "rules.test.ts", status: "failed", durationMs: 2, message: "boom" },
      { name: "later", groups: ["turns"], file: "rules.test.ts", status: "skipped" },
    ]);
    expect(readUnitTestOutput(JEST_VERBOSE).tests).toEqual([
      { name: "bomb beats pair", file: "cards.test.js", status: "passed", durationMs: 3 },
      { name: "starts with player one", groups: ["turns"], file: "rules.test.js", status: "passed", durationMs: 1 },
      { name: "cannot pass first", groups: ["turns"], file: "rules.test.js", status: "failed", durationMs: 2, message: "boom" },
      { name: "later", groups: ["turns"], file: "rules.test.js", status: "skipped" },
    ]);
    expect(readUnitTestOutput(BUN_FULL)).toMatchObject({
      passed: 1,
      failed: 1,
      tests: [
        { name: "bomb beats pair", file: "tests/rules.test.ts", status: "passed", durationMs: 0.12 },
        { name: "cannot pass first", groups: ["turns"], file: "tests/rules.test.ts", status: "failed", durationMs: 0.05 },
        { name: "later", groups: ["turns"], file: "tests/rules.test.ts", status: "skipped" },
      ],
    });
  });

  it("asks Vitest and Jest to name every test when the script is the runner alone", () => {
    expect(listingArguments("vitest run", "npm")).toEqual(["--", "--reporter=verbose"]);
    expect(listingArguments("npx jest --ci", "pnpm")).toEqual(["--verbose"]);
    expect(listingArguments("vitest run && eslint .", "npm")).toEqual([]);
    expect(listingArguments("tsx --test tests/*.test.ts", "npm")).toEqual([]);
  });

  it("says nothing it can't read", () => {
    expect(readUnitTestOutput("all good\n")).toEqual({});
  });
});

describe("running a project's unit tests", () => {
  const folders: string[] = [];
  afterEach(async () => {
    await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
  });

  /** A project whose test script runs `script` with Node, its dependencies already in place. */
  async function project(test: string | undefined, script = ""): Promise<string> {
    const folder = await mkdtemp(path.join(tmpdir(), "ohmygame-unit-tests-"));
    folders.push(folder);
    await mkdir(path.join(folder, "node_modules"));
    await writeFile(path.join(folder, "package-lock.json"), "{}");
    await writeFile(path.join(folder, "package.json"), JSON.stringify({ name: "game", scripts: test === undefined ? {} : { test } }));
    await writeFile(path.join(folder, "check.mjs"), script);
    return folder;
  }
  function tests(folder: string, timeoutMs?: number) {
    const published: UnitTestRun[] = [];
    return { published, tests: new UnitTests(folder, { onChange: (run) => published.push(run), timeoutMs }) };
  }

  it("finds the test script, and none in a project without one or with npm's placeholder", async () => {
    expect(await tests(await project("node check.mjs")).tests.state()).toEqual({ script: { command: "npm run test", script: "node check.mjs" } });
    expect(await tests(await project(undefined)).tests.state()).toEqual({});
    const placeholder = tests(await project('echo "Error: no test specified" && exit 1')).tests;
    expect(await placeholder.state()).toEqual({});
    await expect(placeholder.start()).rejects.toBeInstanceOf(UnitTestError);
  });

  it("runs the script and reports what passed and failed", async () => {
    const { tests: unit, published } = tests(await project("node check.mjs", 'console.log("# pass 3\\n# fail 0");'));
    const passed = await unit.run();
    expect(passed).toMatchObject({ status: "passed", exitCode: 0, passed: 3, failed: 0, command: "npm run test" });
    expect(passed.output).toContain("# pass 3");
    expect(published[0]?.status).toBe("running");
    expect(published.at(-1)?.status).toBe("passed");

    const failing = tests(await project("node check.mjs", `console.log("not ok 1 - a bomb beats a pair\\n  ---\\n  error: 'expected true'\\n  ...\\n# pass 2\\n# fail 1"); process.exit(1);`)).tests;
    expect(await failing.run()).toMatchObject({
      status: "failed",
      exitCode: 1,
      passed: 2,
      failed: 1,
      failures: [{ name: "a bomb beats a pair", message: "expected true" }],
    });
  });

  it("installs the dependencies first when the project has none yet", async () => {
    const folder = await project("node check.mjs", 'console.log("# pass 1\\n# fail 0");');
    await rm(path.join(folder, "node_modules"), { recursive: true });
    await rm(path.join(folder, "package-lock.json"));
    const { tests: unit, published } = tests(folder);
    expect(await unit.run()).toMatchObject({ status: "passed", passed: 1 });
    expect(published.map((run) => run.phase)).toContain("installing");
  });

  it("stops a run, and one that takes too long", async () => {
    const forever = await project("node check.mjs", "setInterval(() => {}, 1000);");
    const { tests: unit } = tests(forever);
    const { done } = await unit.start();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await unit.cancel();
    expect((await done).status).toBe("cancelled");

    const { tests: slow } = tests(forever, 500);
    expect(await slow.run()).toMatchObject({ status: "error", error: expect.stringContaining("didn't finish") });
  });
});
