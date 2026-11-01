// Builds the plugin index the app reads.
//
//   tsx src/build-index.ts [--app DIR] [--out DIR] [--cache FILE] [--keyword K]
//                          [--package NAME@VERSION ...] [--tarball FILE ...]
//
// Finds packages by keyword on registry.npmjs.org and, for each version,
// checks the registry's signature, downloads the tarball, checks its
// integrity, and checks the package with the app's own code (src/checks.ts).
// Applies blocked.json, keeps each plugin with the package published first, and
// adds each package's source, stars and downloads (src/catalog.ts) and the plugins
// in featured.json. Writes `index.<sha256>.json` and `index.json`, which names it.
//
// --cache keeps each version's verdict on its contents, by integrity and by
// the checks that gave it (the app commit, this indexer's source and its tar
// version), so a run downloads only what is new or what changed checks must
// look at again. Only bytes matching the signed integrity are ever judged and
// cached. Signatures and blocks are checked every run. A package's facts are read
// at most daily, and what can't be read never fails a run.
// A registry that can't be read fails the run, so no partial index is
// published; a tarball that can't be downloaded is left out until a later
// run gets it.

import { createHash, createPublicKey } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyBlocks,
  applyClaims,
  featuredPlugins,
  newestInstallable,
  packageFacts,
  parseBlocked,
  parseFeatured,
  type CachedFacts,
  type PackageFacts,
} from "./catalog.ts";
import {
  integrityIssue,
  judgeTarball,
  loadAppChecks,
  readTarball,
  signatureIssue,
  TarballError,
  type AppChecks,
  type IndexedVersion,
  type RegistryKeys,
  type Verdict,
} from "./checks.ts";
import { factSources, fetchWithRetry, REGISTRY } from "./network.ts";


interface Options {
  app: string;
  out: string;
  cache?: string;
  keyword: string;
  packages: string[];
  tarballs: string[];
}

/** A cached verdict on one version's contents. */
interface CachedVerdict {
  integrity: string;
  /** The checks that gave it: see checksVersion. */
  checks: string;
  verdict: Verdict;
}

function options(argv: string[]): Options {
  const result: Options = { app: "app", out: "out", keyword: "ohmygame-plugin", packages: [], tarballs: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === "--app") result.app = value;
    else if (flag === "--out") result.out = value;
    else if (flag === "--cache") result.cache = value;
    else if (flag === "--keyword") result.keyword = value;
    else if (flag === "--package") result.packages.push(value);
    else if (flag === "--tarball") result.tarballs.push(value);
    else throw new Error(`Unknown flag ${flag}`);
  }
  return result;
}

async function json(url: string): Promise<any> {
  const response = await fetchWithRetry(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/** Every package carrying the keyword, 250 at a time (the endpoint's most). */
async function search(keyword: string): Promise<string[]> {
  const names: string[] = [];
  for (let from = 0; ; from += 250) {
    const page = await json(`${REGISTRY}/-/v1/search?text=keywords:${encodeURIComponent(keyword)}&size=250&from=${from}`);
    names.push(...page.objects.map((item: any) => item.package.name));
    if (page.objects.length < 250 || from + 250 >= page.total) return names;
  }
}

async function registryKeys(): Promise<RegistryKeys> {
  const { keys } = await json(`${REGISTRY}/-/npm/v1/keys`);
  return new Map(keys.map((item: any) => [item.keyid, {
    key: createPublicKey({ key: Buffer.from(item.key, "base64"), format: "der", type: "spki" }),
    ...(item.expires ? { expires: Date.parse(item.expires) } : {}),
  }]));
}

/** The app commit, this indexer's source and its tar version: a verdict holds while they do. */
async function checksVersion(app: AppChecks): Promise<string> {
  const hash = createHash("sha256").update(app.version).update("\0");
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const file of ["checks.ts", "build-index.ts"]) hash.update(await readFile(path.join(here, file))).update("\0");
  hash.update(createRequire(import.meta.url)("tar/package.json").version);
  return hash.digest("hex");
}

/** A download that failed for now, or came back wrong; the version is tried again next run. */
class DownloadError extends Error {}

/** Past this a tarball isn't read further, so its integrity can't be checked. */
const DOWNLOAD_HARD_LIMIT = 256 * 1024 * 1024;

/**
 * The tarball's bytes once they match its integrity, or a TarballError when
 * they match but exceed the app's archive limit. Bytes over the limit are
 * hashed without being kept, so only a verified tarball is ever judged.
 */
async function download(url: string, integrity: string, limit: number): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetchWithRetry(url);
  } catch (error) {
    throw new DownloadError((error as Error).message);
  }
  if (!response.ok || !response.body) throw new DownloadError(`HTTP ${response.status}`);
  const chunks: Buffer[] = [];
  const hash = createHash("sha512");
  let size = 0;
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > DOWNLOAD_HARD_LIMIT) throw new DownloadError(`stopped after ${DOWNLOAD_HARD_LIMIT / 1024 / 1024} MB`);
      hash.update(chunk);
      if (size <= limit) chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    throw error instanceof DownloadError ? error : new DownloadError((error as Error).message);
  }
  const sha512 = integrity.split(/\s+/).find((item) => item.startsWith("sha512-"));
  if (sha512 && hash.digest("base64") !== sha512.slice("sha512-".length)) throw new DownloadError("integrity doesn't match the tarball");
  if (size > limit) throw new TarballError(`is larger than ${Math.round(limit / 1024 / 1024)} MB`);
  return Buffer.concat(chunks);
}

/** The verdict on a version's contents: from the cache when nothing it rests on changed. */
async function contentVerdict(app: AppChecks, checks: string, cache: Record<string, CachedVerdict>, name: string, version: string, tarball: string, integrity: string): Promise<Verdict> {
  const key = `${name}@${version}`;
  const cached = cache[key];
  if (cached && cached.integrity === integrity && cached.checks === checks) return cached.verdict;
  // Without a sha512 there is nothing to verify the bytes against, so they aren't fetched.
  const missing = integrityIssue(Buffer.alloc(0), integrity) === "no sha512 integrity";
  let verdict: Verdict;
  if (missing) verdict = { rejected: ["no sha512 integrity"] };
  else {
    try {
      verdict = await judgeTarball(app, name, version, await download(tarball, integrity, app.archiveMaxBytes));
    } catch (error) {
      if (error instanceof TarballError) verdict = { rejected: [`the tarball ${error.message}`] };
      else throw error;
    }
  }
  cache[key] = { integrity, checks, verdict };
  return verdict;
}

async function indexVersion(app: AppChecks, checks: string, cache: Record<string, CachedVerdict>, name: string, version: string, meta: any, publishedAt: string | undefined, keys: RegistryKeys): Promise<IndexedVersion> {
  const dist = meta.dist ?? {};
  const base: IndexedVersion = {
    package: name,
    version,
    tarball: String(dist.tarball ?? ""),
    integrity: String(dist.integrity ?? ""),
    signatures: Array.isArray(dist.signatures) ? dist.signatures.map(({ keyid, sig }: any) => ({ keyid: String(keyid), sig: String(sig) })) : [],
    ...(meta._npmUser?.name ? { publisher: String(meta._npmUser.name) } : {}),
    ...(dist.attestations?.provenance ? { provenance: String(dist.attestations.url) } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };
  const rejected: string[] = [];
  // Checked every run: the keys npm trusts can change.
  const signature = signatureIssue(name, version, base.integrity, base.signatures, keys, publishedAt);
  if (signature) rejected.push(signature);
  const verdict = await contentVerdict(app, checks, cache, name, version, base.tarball, base.integrity);
  if (verdict.rejected) rejected.push(...verdict.rejected);
  return rejected.length ? { ...base, rejected } : { ...base, plugin: verdict.plugin! };
}

async function main(): Promise<void> {
  const opts = options(process.argv.slice(2));
  const app = await loadAppChecks(opts.app);
  const checks = await checksVersion(app);
  const saved = opts.cache ? JSON.parse(await readFile(opts.cache, "utf8").catch(() => "{}")) : {};
  const cache: Record<string, CachedVerdict> = saved.versions ?? {};
  const factsCache: Record<string, CachedFacts> = saved.packages ?? {};
  let versions: IndexedVersion[] = [];
  const packages: Record<string, PackageFacts> = {};
  const metas = new Map<string, any>();
  let featured: string[] = [];

  // A local tarball checks only the package itself: it has no registry record.
  for (const file of opts.tarballs) {
    const bytes = await readFile(file);
    const pkgFile = (await readTarball(bytes, { maxEntries: app.archiveMaxEntries, maxBytes: app.archiveMaxBytes })).get("package.json");
    if (!pkgFile) throw new Error(`${file} has no package/package.json`);
    const pkg = JSON.parse(pkgFile.toString("utf8"));
    versions.push({
      package: pkg.name,
      version: pkg.version,
      tarball: file,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      signatures: [],
      ...(await judgeTarball(app, pkg.name, pkg.version, bytes)),
    });
  }

  if (!opts.tarballs.length) {
    const keys = await registryKeys();
    const names = opts.packages.length
      ? [...new Set(opts.packages.map((spec) => spec.slice(0, spec.lastIndexOf("@"))))]
      : await search(opts.keyword);
    for (const name of names) {
      // One that can't be read fails the run: leaving it out would drop its plugins from the catalog.
      const packument = await json(`${REGISTRY}/${name.replace("/", "%2f")}`);
      metas.set(name, packument);
      const only = opts.packages.filter((spec) => spec.slice(0, spec.lastIndexOf("@")) === name).map((spec) => spec.slice(spec.lastIndexOf("@") + 1));
      for (const [version, meta] of Object.entries<any>(packument.versions ?? {})) {
        if (only.length && !only.includes(version)) continue;
        try {
          versions.push(await indexVersion(app, checks, cache, name, version, meta, packument.time?.[version], keys));
        } catch (error) {
          if (!(error instanceof DownloadError)) throw error;
          console.warn(`left out ${name}@${version} for now: its tarball didn't download (${error.message})`);
        }
      }
    }
  }

  if (!opts.tarballs.length) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    versions = applyClaims(applyBlocks(versions, parseBlocked(await readFile(path.join(here, "..", "blocked.json"), "utf8"))));
    featured = featuredPlugins(parseFeatured(await readFile(path.join(here, "..", "featured.json"), "utf8")), versions);
    const now = Date.now();
    for (const [name, version] of newestInstallable(versions)) {
      const meta = metas.get(name)?.versions?.[version.version] ?? {};
      const { entry, complete } = await packageFacts(name, version.version, { repository: meta.repository, hasProvenance: Boolean(version.provenance) }, factsCache[name], now, factSources);
      if (!complete) console.warn(`couldn't read all of ${name}'s facts; trying again next run`);
      factsCache[name] = entry;
      packages[name] = entry.facts;
    }
  }

  versions.sort((a, b) => a.package.localeCompare(b.package) || (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "") || a.version.localeCompare(b.version));
  const index = { schemaVersion: 1, versions, packages, featured };
  const text = `${JSON.stringify(index, null, 2)}\n`;
  const digest = createHash("sha256").update(text).digest("hex");
  await mkdir(opts.out, { recursive: true });
  await writeFile(path.join(opts.out, `index.${digest}.json`), text);
  await writeFile(path.join(opts.out, "index.json"), `${JSON.stringify({ schemaVersion: 1, latest: `index.${digest}.json`, sha256: digest, generatedAt: new Date().toISOString() })}\n`);
  if (opts.cache) await writeFile(opts.cache, `${JSON.stringify({ versions: cache, packages: factsCache }, null, 2)}\n`);
  for (const item of versions)
    console.log(`${item.rejected ? "rejected" : "ok      "} ${item.package}@${item.version}${item.rejected ? `: ${item.rejected.join("; ")}` : ` -> ${item.plugin?.id}`}`);
}

await main();
