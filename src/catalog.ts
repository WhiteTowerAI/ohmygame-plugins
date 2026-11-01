// What the index says beyond one version's contents: which package holds a
// plugin, what the maintainers blocked or featured, and each package's source,
// stars and downloads. Parsing and decisions are here; build-index.ts reads the
// network through FactSources.

import type { IndexedVersion } from "./checks.ts";

const PLUGIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY = 24 * 60 * 60 * 1000;

/** One line of blocked.json: a package, or one of its versions. */
export interface Block {
  package: string;
  version?: string;
  reason: string;
}

/** A typo must not quietly leave a package unblocked, so anything unexpected fails the run. */
export function parseBlocked(text: string): Block[] {
  const list: unknown = JSON.parse(text);
  if (!Array.isArray(list)) throw new Error("blocked.json must be a list");
  return list.map((item, index) => {
    const { package: name, version, reason, ...rest } = (item ?? {}) as Record<string, unknown>;
    if (
      typeof name !== "string" || !name.trim() ||
      typeof reason !== "string" || !reason.trim() ||
      (version !== undefined && (typeof version !== "string" || !version.trim())) ||
      Object.keys(rest).length
    )
      throw new Error(`blocked.json entry ${index} must have package, reason and optionally version`);
    return { package: name, reason, ...(version !== undefined ? { version: version as string } : {}) };
  });
}

export function parseFeatured(text: string): string[] {
  const list: unknown = JSON.parse(text);
  if (!Array.isArray(list)) throw new Error("featured.json must be a list");
  for (const id of list)
    if (typeof id !== "string" || !PLUGIN_ID.test(id)) throw new Error(`featured.json: ${JSON.stringify(id)} isn't a plugin id`);
  if (new Set(list).size !== list.length) throw new Error("featured.json lists a plugin twice");
  return list as string[];
}

const reject = (version: IndexedVersion, reason: string): IndexedVersion => {
  const { plugin: _, ...rest } = version;
  return { ...rest, rejected: [...(version.rejected ?? []), reason] };
};

/** A blocked version stays in the index, so the app can say why it's gone. */
export function applyBlocks(versions: IndexedVersion[], blocks: Block[]): IndexedVersion[] {
  return versions.map((version) => {
    const block = blocks.find((item) => item.package === version.package && (item.version === undefined || item.version === version.version));
    return block ? reject(version, `blocked: ${block.reason}`) : version;
  });
}

/** Both names can hold one plugin. The one published first keeps it; the other's versions are rejected. */
export function applyClaims(versions: IndexedVersion[]): IndexedVersion[] {
  const holders = new Map<string, { package: string; publishedAt: string }>();
  for (const { plugin, package: name, publishedAt = "" } of versions) {
    if (!plugin) continue;
    const holder = holders.get(plugin.id);
    if (!holder || publishedAt < holder.publishedAt || (publishedAt === holder.publishedAt && name < holder.package))
      holders.set(plugin.id, { package: name, publishedAt });
  }
  return versions.map((version) => {
    const holder = version.plugin && holders.get(version.plugin.id);
    return holder && holder.package !== version.package
      ? reject(version, `plugin ${version.plugin!.id} is already published as ${holder.package}`)
      : version;
  });
}

/** The featured plugins someone can install, in the file's order. */
export function featuredPlugins(featured: string[], versions: IndexedVersion[]): string[] {
  const available = new Set(versions.flatMap((version) => (version.plugin ? [version.plugin.id] : [])));
  return featured.filter((id) => available.has(id));
}

export interface GitHubRepository {
  owner: string;
  repo: string;
  /** Where the package is in a repository of several. */
  directory?: string;
}

const REPOSITORY_URL = /^(?:git\+)?(?:https?|ssh|git):\/\/(?:git@)?(?:www\.)?github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[#?].*)?$/i;
const REPOSITORY_SHORT = /^(?:github:)?([^/\s:]+)\/([^/\s#?]+?)(?:\.git)?$/;
const NAME_PART = /^[A-Za-z0-9_.-]+$/;

/** A package.json's `repository`, when it's on GitHub. */
export function parseRepository(value: unknown): GitHubRepository | undefined {
  const url = typeof value === "string" ? value : (value as { url?: unknown } | null | undefined)?.url;
  if (typeof url !== "string") return undefined;
  const match = REPOSITORY_URL.exec(url.trim()) ?? REPOSITORY_SHORT.exec(url.trim());
  if (!match) return undefined;
  const [, owner, repo] = match as unknown as [string, string, string];
  if (!NAME_PART.test(owner) || !NAME_PART.test(repo) || /^\.+$/.test(owner) || /^\.+$/.test(repo)) return undefined;
  const directory = typeof value === "object" ? (value as { directory?: unknown }).directory : undefined;
  const parts = typeof directory === "string" ? directory.split("/").filter((part) => part && part !== ".") : [];
  // A folder that can't be named safely is left out, so the top of the repository is read.
  const safe = parts.length > 0 && parts.every((part) => NAME_PART.test(part) && part !== "..");
  return { owner, repo, ...(safe ? { directory: parts.join("/") } : {}) };
}

const sameRepository = (a: GitHubRepository | undefined, b: GitHubRepository) =>
  a?.owner.toLowerCase() === b.owner.toLowerCase() && a?.repo.toLowerCase() === b.repo.toLowerCase();

/** The repository npm's SLSA provenance says built this version. */
export function attestedRepository(data: unknown, name: string, version: string): GitHubRepository | undefined {
  const subject = `pkg:npm/${name.replace(/^@/, "%40")}@${version}`;
  const attestations = (data as { attestations?: unknown } | null)?.attestations;
  for (const item of Array.isArray(attestations) ? attestations : []) {
    if (item?.predicateType !== "https://slsa.dev/provenance/v1") continue;
    try {
      const statement = JSON.parse(Buffer.from(String(item.bundle.dsseEnvelope.payload), "base64").toString("utf8"));
      if (!statement.subject.some((entry: { name?: unknown }) => entry.name === subject)) continue;
      return parseRepository(statement.predicate.buildDefinition.externalParameters.workflow.repository);
    } catch {
      continue;
    }
  }
  return undefined;
}

const packageJsonNames = (text: string | undefined, name: string) => {
  try {
    return text !== undefined && JSON.parse(text)?.name === name;
  } catch {
    return false;
  }
};

/** What the index says about a package as a whole. */
export interface PackageFacts {
  repository?: string;
  /** npm's provenance names this repository, or its package.json names this package. */
  sourceVerified?: true;
  /** Only when the source is verified, so a package can't borrow another project's stars. */
  stars?: number;
  weeklyDownloads?: number;
}

export interface CachedFacts {
  /** The newest version they were read for; a new one checks the source again. */
  version: string;
  checkedAt: number;
  facts: PackageFacts;
}

/** Each may throw, which means "can't tell right now". */
export interface FactSources {
  attestations(name: string, version: string): Promise<unknown>;
  /** The repository's package.json, undefined when it has none. */
  packageJson(repository: GitHubRepository): Promise<string | undefined>;
  stars(repository: GitHubRepository): Promise<number>;
  weeklyDownloads(name: string): Promise<number>;
}

/**
 * A package's facts, read at most once a day per version. Nothing here fails a
 * run: what can't be read now keeps its last value for that version, or is left
 * out, and is tried again next run.
 */
export async function packageFacts(
  name: string,
  version: string,
  meta: { repository?: unknown; hasProvenance: boolean },
  cached: CachedFacts | undefined,
  now: number,
  sources: FactSources,
): Promise<{ entry: CachedFacts; complete: boolean }> {
  if (cached && cached.version === version && now - cached.checkedAt < DAY) return { entry: cached, complete: true };
  const repository = parseRepository(meta.repository);
  const url = repository && `https://github.com/${repository.owner}/${repository.repo}`;
  const before = cached?.facts;
  // A source verdict holds only for the version and repository it was reached on.
  const held = cached?.version === version && before?.repository === url ? before : undefined;
  let complete = true;
  const read = async <T>(get: () => Promise<T>, fallback: T | undefined): Promise<T | undefined> => {
    try {
      return await get();
    } catch {
      complete = false;
      return fallback;
    }
  };
  let verified: boolean | undefined = false;
  if (repository) {
    if (meta.hasProvenance) {
      const attested = await read(async () => sameRepository(attestedRepository(await sources.attestations(name, version), name, version), repository), undefined);
      verified = attested === undefined ? undefined : attested;
    }
    if (!verified) {
      const named = await read(async () => packageJsonNames(await sources.packageJson(repository), name), undefined);
      verified = named || (verified === undefined || named === undefined ? undefined : false);
    }
    verified ??= Boolean(held?.sourceVerified);
  }
  const stars = verified && repository ? await read(() => sources.stars(repository), held?.stars) : undefined;
  const weeklyDownloads = await read(() => sources.weeklyDownloads(name), before?.weeklyDownloads);
  return {
    entry: {
      version,
      // What couldn't be read is tried again next run, not tomorrow.
      checkedAt: complete ? now : cached?.checkedAt ?? 0,
      facts: {
        ...(url ? { repository: url } : {}),
        ...(verified ? { sourceVerified: true as const } : {}),
        ...(stars !== undefined ? { stars } : {}),
        ...(weeklyDownloads !== undefined ? { weeklyDownloads } : {}),
      },
    },
    complete,
  };
}

/** Each package's newest version that can be installed. */
export function newestInstallable(versions: IndexedVersion[]): Map<string, IndexedVersion> {
  const newest = new Map<string, IndexedVersion>();
  for (const version of versions) {
    if (!version.plugin) continue;
    const current = newest.get(version.package);
    if (!current || (version.publishedAt ?? "") >= (current.publishedAt ?? "")) newest.set(version.package, version);
  }
  return newest;
}
