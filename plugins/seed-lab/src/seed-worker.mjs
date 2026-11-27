// Runs seeds through a bundled simulation module, one at a time, in its own
// thread. The pool gives each seed a time limit and replaces a thread that
// runs over, so a seed stuck in a loop can't stop the run.
//
// workerData: { bundle (file URL), params }. Posts { ready } or { fatal }
// once the module loads, then answers each { seed } with a SeedResult.
import { parentPort, workerData } from "node:worker_threads";

const { bundle, params } = workerData;

// Stack frames point at the project's own files, through the bundle's inline source map.
process.setSourceMapsEnabled(true);

/** "Name: message (file:line)", the place being the first frame in the project's code. */
function message(error) {
  if (!(error instanceof Error)) return String(error);
  const text = `${error.name === "Error" ? "" : `${error.name}: `}${error.message}`;
  const frame = String(error.stack ?? "")
    .split("\n")
    .map((line) => /\(?((?:file:\/\/)?[^()\s]+:\d+):\d+\)?$/.exec(line.trim())?.[1])
    .find((place) => place && !place.startsWith("node:") && !place.includes("seed-worker.mjs"));
  return frame ? `${text} (${frame.replace(/^project:\/\/\//, "").replace(/^file:\/\//, "")})` : text;
}

/** Keeps only finite numbers; anything else in `metrics` is reported, not guessed at. */
function check(answer) {
  if (!answer || typeof answer !== "object" || typeof answer.solvable !== "boolean") return { error: `evaluate() must return { solvable: boolean, metrics?: { name: number } }; it returned ${JSON.stringify(answer)?.slice(0, 120)}` };
  const metrics = {};
  for (const [name, value] of Object.entries(answer.metrics ?? {})) {
    if (typeof value === "boolean") metrics[name] = value ? 1 : 0;
    else if (typeof value === "number" && Number.isFinite(value)) metrics[name] = value;
    else return { error: `metric "${name}" must be a finite number; it was ${JSON.stringify(value)}` };
  }
  return { solvable: answer.solvable, metrics };
}

let sim;
try {
  sim = await import(bundle);
  if (typeof sim.generate !== "function" || typeof sim.evaluate !== "function") throw new Error("The simulation module must export generate(seed, params) and evaluate(level, params).");
  parentPort.postMessage({ ready: true });
} catch (error) {
  parentPort.postMessage({ fatal: message(error) });
}

parentPort.on("message", async ({ seed }) => {
  const started = performance.now();
  try {
    const level = await sim.generate(seed, params);
    const answer = level == null ? { error: "generate() returned nothing" } : check(await sim.evaluate(level, params));
    parentPort.postMessage({ seed, ...answer, ms: performance.now() - started });
  } catch (error) {
    parentPort.postMessage({ seed, error: message(error), ms: performance.now() - started });
  }
});
