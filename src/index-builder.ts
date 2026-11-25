// Builds index v2 from GitHub. For each public repository with the topic, each
// release whose tag names a version is downloaded once, checked with the app's
// own code (src/checks.ts), kept for the mirror under a path named by its
// digest, and signed with the market's key. blocked.json, categories.json and
// featured.json apply as before. Writes `index.<sha256>.json`, `index.json`,
// which names it, and `assets/`, the icons and screenshots it lists.
//
// The cache keeps each release's verdict on its archive, by the archive and
// the checks that gave it (the app commit and this indexer's source), with
// its icons, screenshots and archive beside it, so a run downloads only what
// is new or what changed checks must look at again. Blocks and signatures are
// applied every run. GitHub not answering fails the run, so no partial index
// is published; an archive that can't be downloaded is left out until a later
// run gets it.

import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyBlocks,
  applyCategories,
  applyClaims,
  applyVersionClaims,
  featuredPlugins,
  parseBlocked,
  parseCategories,
  parseFeatured,
  type RepositoryFacts,
} from "./catalog.ts";
import { judgeArchive, type AppChecks, type IndexedVersion, type SaveImage, type Verdict } from "./checks.ts";
import { GitHubError, parseTag, releaseArchive, type GitHubApi, type FoundRepository } from "./github.ts";
import { mirrorPath, signRelease, type SigningKey } from "./signing.ts";

export interface BuildOptions {
  app: AppChecks;
  github: GitHubApi;
  /** Downloads an archive, at most `limit` bytes; throws `DownloadError` when it can't for now. */
  download(url: string, limit: number): Promise<Buffer>;
  key: SigningKey;
  /** Where the mirror's base is served, such as `https://plugins.ohmygame.ai/plugins`. */
  mirror: string;
  topic: string;
  out: string;
  /** Kept between runs: icons and screenshots, and archives under their mirror paths. */
  images: string;
  archives: string;
  cache: Record<string, CachedRelease>;
  /** Only these repositories (`owner/repo`), for a local run. */
  only?: string[];
  /** blocked.json, categories.json and featured.json; this repository's by default. */
  lists?: string;
  log?: (line: string) => void;
}

/** A cached verdict on one release's archive. */
export interface CachedRelease {
  release: number;
  /** The version its tag names. */
  version: string;
  /** `asset:<id>`, or `source` for the tag's source. */
  archive: string;
  commit: string;
  /** The checks that gave it: the app commit and this indexer's source. */
  checks: string;
  sha256?: string;
  size?: number;
  verdict: Verdict;
}

/** A download that failed for now; the release is tried again next run. */
export class DownloadError extends Error {}

/** The images a verdict lists, by their paths beside the index. */
const imagesOf = (verdict: Verdict) => [verdict.plugin?.icon, ...(verdict.plugin?.screenshots ?? []).map((shot) => shot.path)].filter((file): file is string => Boolean(file));

const exists = (file: string) => access(file).then(() => true, () => false);

/** The app commit and this indexer's source: a verdict holds while they do. */
export async function checksVersion(app: AppChecks): Promise<string> {
  const hash = createHash("sha256").update(app.version).update("\0");
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const file of ["checks.ts", "index-builder.ts", "github.ts"]) hash.update(await readFile(path.join(here, file))).update("\0");
  return hash.digest("hex");
}

export async function buildIndex(options: BuildOptions): Promise<{ index: unknown; pointer: unknown }> {
  const { app, github, cache } = options;
  const log = options.log ?? (() => {});
  const checks = await checksVersion(app);
  const at = (file: string) => path.join(options.images, path.basename(file));
  const save: SaveImage = (file, bytes) => writeFile(at(file), bytes);
  const archiveAt = (cached: CachedRelease) => path.join(options.archives, ...mirrorPath(cached.verdict.plugin!.id, cached.version, cached.sha256!).split("/"));
  await mkdir(options.images, { recursive: true });
  await mkdir(options.archives, { recursive: true });

  const only = options.only?.map((item) => item.toLowerCase());
  const repositories = (await github.repositories(options.topic))
    .filter((item) => !only || only.includes(`${item.owner}/${item.repo}`.toLowerCase()));
  const facts: Record<string, RepositoryFacts> = {};
  const firstReleased = new Map<string, string>();
  let versions: IndexedVersion[] = [];
  const kept = new Set<string>();
  /** The repositories this run read, by `owner/repo` lowercased: only their cache entries can be let go. */
  const seen = new Set<string>();

  for (const repository of repositories) {
    const full = `${repository.owner}/${repository.repo}`;
    // Search pages can shift while they are read, and give one repository twice.
    if (seen.has(full.toLowerCase())) continue;
    facts[full] = { stars: repository.stars, ...(repository.avatar ? { avatar: repository.avatar } : {}), ...(repository.createdAt ? { createdAt: repository.createdAt } : {}) };
    let releases: Awaited<ReturnType<GitHubApi["releases"]>>;
    try {
      releases = await github.releases(repository.owner, repository.repo);
    } catch (error) {
      // Search still lists a repository deleted or made private for a while; that one
      // is left out. Anything else fails the run, so no partial index is published.
      if (!(error instanceof GitHubError && error.status === 404)) throw error;
      delete facts[full];
      log(`left out ${full}: GitHub doesn't have it any more`);
      continue;
    }
    seen.add(full.toLowerCase());
    for (const release of releases) {
      const tag = parseTag(release.tag);
      if (release.draft || !tag) continue;
      if (release.publishedAt && (firstReleased.get(full) ?? "\uffff") > release.publishedAt) firstReleased.set(full, release.publishedAt);
      // GitHub ignores case in a repository's name, not in a tag.
      const key = `${full.toLowerCase()}@${release.tag}`;
      kept.add(key);
      try {
        const cached = await judged(repository, release, tag, cache[key]);
        cache[key] = cached;
        const base = {
          repository: full,
          tag: release.tag,
          commit: cached.commit,
          version: tag.version,
          ...(release.publishedAt ? { publishedAt: release.publishedAt } : {}),
        };
        const plugin = cached.verdict.plugin;
        if (!plugin) {
          versions.push({ ...base, rejected: cached.verdict.rejected ?? [] });
          continue;
        }
        const asset = cached.archive.startsWith("asset:") ? release.assets.find((item) => `asset:${item.id}` === cached.archive) : undefined;
        versions.push({
          ...base,
          plugin,
          release: signRelease(options.key, {
            id: plugin.id,
            version: tag.version,
            url: `${options.mirror}/${mirrorPath(plugin.id, tag.version, cached.sha256!)}`,
            size: cached.size!,
            sha256: cached.sha256!,
          }),
          ...(asset ? { github: asset.url } : {}),
        });
      } catch (error) {
        if (!(error instanceof DownloadError)) throw error;
        log(`left out ${full} ${release.tag} for now: its archive didn't download (${error.message})`);
      }
    }
  }

  /** The verdict on a release's archive: from the cache when nothing it rests on changed and what it keeps is there. */
  async function judged(repository: FoundRepository, release: Parameters<typeof releaseArchive>[1], tag: { version: string; name?: string }, cached: CachedRelease | undefined): Promise<CachedRelease> {
    const asset = release.assets.filter((item) => item.name.toLowerCase().endsWith(".zip"));
    const archiveKey = asset.length === 1 ? `asset:${asset[0]!.id}` : asset.length ? "many" : "source";
    const same = cached?.release === release.id && cached.archive === archiveKey && cached.version === tag.version;
    if (cached && same && cached.checks === checks) {
      const present = await Promise.all([...imagesOf(cached.verdict).map((file) => exists(at(file))), ...(cached.verdict.plugin ? [exists(archiveAt(cached))] : [])]);
      if (present.every(Boolean)) return cached;
    }
    // A release judged before keeps its commit and, once signed, its bytes: the mirror's
    // copy is judged again, so a moved tag or a changed source can't change a signed version.
    const stored = same && cached.verdict.plugin ? await readFile(archiveAt(cached)).catch(() => undefined) : undefined;
    let commit: string;
    if (same) commit = cached.commit;
    else {
      try {
        commit = await github.commit(repository.owner, repository.repo, release.tag);
      } catch (error) {
        // A tag on something that isn't a commit.
        if (error instanceof GitHubError && (error.status === 404 || error.status === 422))
          return { release: release.id, version: tag.version, archive: archiveKey, commit: "", checks, verdict: { rejected: [`tag ${release.tag} doesn't point to a commit`] } };
        throw error;
      }
    }
    const base = { release: release.id, version: tag.version, archive: archiveKey, commit, checks };
    const source = releaseArchive(repository, release, commit);
    if ("issue" in source) return { ...base, verdict: { rejected: [source.issue] } };
    if (source.kind === "asset" && source.size > app.archiveMaxBytes)
      return { ...base, verdict: { rejected: [`the archive is larger than ${Math.round(app.archiveMaxBytes / 1024 / 1024)} MB`] } };
    let bytes: Buffer;
    if (stored && createHash("sha256").update(stored).digest("hex") === cached!.sha256) bytes = stored;
    else {
      try {
        bytes = await options.download(source.url, app.archiveMaxBytes);
      } catch (error) {
        if (error instanceof ArchiveTooLarge) return { ...base, verdict: { rejected: [`the archive is larger than ${Math.round(app.archiveMaxBytes / 1024 / 1024)} MB`] } };
        throw error;
      }
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const verdict = await judgeArchive(app, bytes, { owner: repository.owner, version: tag.version, ...(tag.name ? { name: tag.name } : {}) }, save);
    const result: CachedRelease = { ...base, sha256, size: bytes.length, verdict };
    if (verdict.plugin) {
      await mkdir(path.dirname(archiveAt(result)), { recursive: true });
      await writeFile(archiveAt(result), bytes);
    }
    return result;
  }

  const lists = options.lists ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  versions = applyBlocks(applyVersionClaims(applyClaims(versions, firstReleased)), parseBlocked(await readFile(path.join(lists, "blocked.json"), "utf8")));
  versions = applyCategories(versions, parseCategories(await readFile(path.join(lists, "categories.json"), "utf8"), app.categories));
  // A blocked version keeps no release, so nothing can install it.
  versions = versions.map((version) => {
    if (!version.rejected || !version.release) return version;
    const { release: _release, github: _github, ...rest } = version;
    return rest;
  });
  const featured = featuredPlugins(parseFeatured(await readFile(path.join(lists, "featured.json"), "utf8")), versions);

  versions.sort((a, b) => a.repository.localeCompare(b.repository) || (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "") || a.tag.localeCompare(b.tag));
  const index = { schemaVersion: 2, versions, repositories: facts, featured };
  const text = `${JSON.stringify(index, null, 2)}\n`;
  const digest = createHash("sha256").update(text).digest("hex");
  const pointer = { schemaVersion: 2, latest: `index.${digest}.json`, sha256: digest, generatedAt: new Date().toISOString() };
  await mkdir(path.join(options.out, "assets"), { recursive: true });
  await writeFile(path.join(options.out, `index.${digest}.json`), text);
  await writeFile(path.join(options.out, "index.json"), `${JSON.stringify(pointer)}\n`);

  // Only a release still on GitHub keeps its cache entry, images and archive; one of a
  // repository this run didn't read is kept for the next.
  for (const key of Object.keys(cache)) if (seen.has(key.slice(0, key.indexOf("@"))) && !kept.has(key)) delete cache[key];
  const held = Object.values(cache);
  const listed = new Set(versions.flatMap(imagesOf).map((file) => path.basename(file)));
  const heldImages = new Set([...listed, ...held.flatMap(({ verdict }) => imagesOf(verdict)).map((file) => path.basename(file))]);
  for (const file of listed) await copyFile(at(file), path.join(options.out, "assets", file));
  for (const file of await readdir(options.images)) if (!heldImages.has(file)) await rm(path.join(options.images, file), { force: true });
  const heldArchives = new Set(held.filter((item) => item.verdict.plugin).map(archiveAt));
  for (const file of await readdir(options.archives, { recursive: true, withFileTypes: true }))
    if (file.isFile() && !heldArchives.has(path.join(file.parentPath, file.name))) await rm(path.join(file.parentPath, file.name), { force: true });

  for (const item of versions)
    log(`${item.rejected ? "rejected" : "ok      "} ${item.repository} ${item.tag}${item.rejected ? `: ${item.rejected.join("; ")}` : ` -> ${item.plugin?.id}`}`);
  return { index, pointer };
}

/** An archive over the app's limit, which can't be installed. */
export class ArchiveTooLarge extends Error {}
