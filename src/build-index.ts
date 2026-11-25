// Builds the plugin index the app reads (v2): plugins released on GitHub.
//
//   tsx src/build-index.ts [--app DIR] [--out DIR] [--cache FILE] [--images DIR]
//                          [--archives DIR] [--topic T] [--mirror URL]
//                          [--repository OWNER/REPO ...]
//
// The market's signing key comes from the environment:
// PLUGIN_RELEASE_KEY (an Ed25519 private key, PKCS#8 PEM) and
// PLUGIN_RELEASE_KEY_ID. GITHUB_TOKEN raises GitHub's rate limits.
// See src/index-builder.ts for what a run does.

import { readFile, writeFile } from "node:fs/promises";
import { loadAppChecks } from "./checks.ts";
import { githubApi } from "./github.ts";
import { ArchiveTooLarge, buildIndex, DownloadError } from "./index-builder.ts";
import { fetchWithRetry } from "./network.ts";
import { signingKey } from "./signing.ts";

interface Options {
  app: string;
  out: string;
  cache?: string;
  images: string;
  archives: string;
  topic: string;
  mirror: string;
  repositories: string[];
}

function options(argv: string[]): Options {
  const result: Options = { app: "app", out: "out", images: "images", archives: "archives", topic: "ohmygame-plugin", mirror: "https://plugins.ohmygame.ai/plugins", repositories: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--app") result.app = value;
    else if (flag === "--out") result.out = value;
    else if (flag === "--cache") result.cache = value;
    else if (flag === "--images") result.images = value;
    else if (flag === "--archives") result.archives = value;
    else if (flag === "--topic") result.topic = value;
    else if (flag === "--mirror") result.mirror = value.replace(/\/+$/, "");
    else if (flag === "--repository") result.repositories.push(value);
    else throw new Error(`Unknown flag ${flag}`);
  }
  if (!result.mirror.startsWith("https://")) throw new Error("--mirror must be an https:// address");
  return result;
}

/** Downloads an archive, stopping past `limit`: one that big can't be installed. */
async function download(url: string, limit: number): Promise<Buffer> {
  let response: Response;
  try {
    // Five minutes is far longer than the largest archive should take.
    response = await fetchWithRetry(url, { redirect: "follow", signal: AbortSignal.timeout(300_000) });
  } catch (error) {
    throw new DownloadError((error as Error).message);
  }
  if (!response.ok || !response.body) throw new DownloadError(`HTTP ${response.status}`);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > limit) break;
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    throw new DownloadError((error as Error).message);
  }
  if (size > limit) {
    await response.body.cancel().catch(() => {});
    throw new ArchiveTooLarge();
  }
  return Buffer.concat(chunks);
}

const opts = options(process.argv.slice(2));
const pem = process.env.PLUGIN_RELEASE_KEY;
const keyId = process.env.PLUGIN_RELEASE_KEY_ID;
if (!pem || !keyId) throw new Error("PLUGIN_RELEASE_KEY and PLUGIN_RELEASE_KEY_ID must be set to sign releases");
const saved = opts.cache ? JSON.parse(await readFile(opts.cache, "utf8").catch(() => "{}")) : {};
const cache = saved.releases ?? {};
await buildIndex({
  app: await loadAppChecks(opts.app),
  github: githubApi((url, init) => fetchWithRetry(url, init)),
  download,
  key: signingKey(keyId, pem),
  mirror: opts.mirror,
  topic: opts.topic,
  out: opts.out,
  images: opts.images,
  archives: opts.archives,
  cache,
  ...(opts.repositories.length ? { only: opts.repositories } : {}),
  log: (line) => console.log(line),
});
if (opts.cache) await writeFile(opts.cache, `${JSON.stringify({ releases: cache }, null, 2)}\n`);
