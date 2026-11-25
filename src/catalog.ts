// What the index says beyond one release's contents: which repository holds
// a plugin, and what the maintainers blocked, featured or categorized.

import type { IndexedVersion } from "./checks.ts";

const PLUGIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** One line of blocked.json: a repository, or one of its plugins or versions. */
export interface Block {
  /** `owner/repo`; matched without regard to case, as GitHub does. */
  repository: string;
  /** One plugin of a repository that holds several. */
  plugin?: string;
  version?: string;
  reason: string;
}

// Blocks match a version literally, so a range like "*" or "1.0" would block nothing.
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** A typo must not quietly leave a repository unblocked, so anything unexpected fails the run. */
export function parseBlocked(text: string): Block[] {
  const list: unknown = JSON.parse(text);
  if (!Array.isArray(list)) throw new Error("blocked.json must be a list");
  return list.map((item, index) => {
    const { repository, plugin, version, reason, ...rest } = (item ?? {}) as Record<string, unknown>;
    if (
      typeof repository !== "string" || !REPOSITORY.test(repository) ||
      typeof reason !== "string" || !reason.trim() ||
      (plugin !== undefined && (typeof plugin !== "string" || !PLUGIN_ID.test(plugin))) ||
      (version !== undefined && (typeof version !== "string" || !EXACT_VERSION.test(version))) ||
      Object.keys(rest).length
    )
      throw new Error(`blocked.json entry ${index} must have repository, reason and optionally plugin and version`);
    return { repository, reason, ...(plugin !== undefined ? { plugin: plugin as string } : {}), ...(version !== undefined ? { version: version as string } : {}) };
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

/**
 * categories.json: plugin ids to the categories the market lists them under,
 * in place of what their manifests say. Only categories the app knows.
 */
export function parseCategories(text: string, known: readonly string[]): Record<string, string[]> {
  const map: unknown = JSON.parse(text);
  if (!map || typeof map !== "object" || Array.isArray(map)) throw new Error("categories.json must be an object of plugin ids");
  for (const [id, list] of Object.entries(map)) {
    if (!PLUGIN_ID.test(id)) throw new Error(`categories.json: ${JSON.stringify(id)} isn't a plugin id`);
    if (!Array.isArray(list) || !list.length || list.length > 3 || new Set(list).size !== list.length || list.some((item) => !known.includes(item)))
      throw new Error(`categories.json: ${id} must have one to three categories the app knows (${known.join(", ")})`);
  }
  return map as Record<string, string[]>;
}

/** Every version of a plugin in categories.json is listed under its categories there. */
export function applyCategories(versions: IndexedVersion[], categories: Record<string, string[]>): IndexedVersion[] {
  return versions.map((version) => {
    const override = version.plugin && categories[version.plugin.id];
    return override ? { ...version, plugin: { ...version.plugin!, categories: override } } : version;
  });
}

/**
 * A blocked version stays in the index, with the plugin it holds, so the app
 * can say why it's gone, and a block on one plugin of a repository holding
 * several doesn't reach the others.
 */
export function applyBlocks(versions: IndexedVersion[], blocks: Block[]): IndexedVersion[] {
  return versions.map((version) => {
    const block = blocks.find((item) => item.repository.toLowerCase() === version.repository.toLowerCase()
      && (item.plugin === undefined || item.plugin === version.plugin?.id) && (item.version === undefined || item.version === version.version));
    return block ? { ...version, rejected: [...(version.rejected ?? []), `blocked: ${block.reason}`] } : version;
  });
}

/**
 * Two repositories of one owner can hold the same plugin. The one released
 * first keeps it and the other's versions are rejected. A repository's date
 * is its first release's, whatever became of that release, so blocking a
 * version or failing to download one can't move a plugin to the other. One
 * with no known date never comes before one with a date. Run this before
 * applyBlocks.
 */
export function applyClaims(versions: IndexedVersion[], firstReleased: ReadonlyMap<string, string>): IndexedVersion[] {
  const earlier = (a: string, b: string) => {
    const [dateA, dateB] = [firstReleased.get(a), firstReleased.get(b)];
    if (dateA !== dateB) return dateB === undefined || (dateA !== undefined && dateA < dateB);
    return a < b;
  };
  const holders = new Map<string, string>();
  for (const { plugin, repository } of versions) {
    if (!plugin) continue;
    const holder = holders.get(plugin.id);
    if (holder === undefined || earlier(repository, holder)) holders.set(plugin.id, repository);
  }
  return versions.map((version) => {
    const holder = version.plugin && holders.get(version.plugin.id);
    return holder !== undefined && holder !== version.repository
      ? reject(version, `plugin ${version.plugin!.id} is already published from ${holder}`)
      : version;
  });
}

/**
 * The app knows a release by its id and version, so only one release may hold
 * each: the one published first. Run this after applyClaims.
 */
export function applyVersionClaims(versions: IndexedVersion[]): IndexedVersion[] {
  const first = new Map<string, IndexedVersion>();
  for (const version of versions) {
    if (!version.plugin) continue;
    const key = `${version.plugin.id}@${version.version}`;
    const held = first.get(key);
    if (!held || (version.publishedAt ?? "\uffff") < (held.publishedAt ?? "\uffff")) first.set(key, version);
  }
  return versions.map((version) => {
    const held = version.plugin && first.get(`${version.plugin.id}@${version.version}`);
    return held && held !== version ? reject(version, `${version.plugin!.id} ${version.version} is already released as ${held.repository} ${held.tag}`) : version;
  });
}

/** The featured plugins someone can install, in the file's order. */
export function featuredPlugins(featured: string[], versions: IndexedVersion[]): string[] {
  const available = new Set(versions.flatMap((version) => (version.plugin && !version.rejected ? [version.plugin.id] : [])));
  return featured.filter((id) => available.has(id));
}

/** What the index says about a repository as a whole, from the topic search. */
export interface RepositoryFacts {
  stars: number;
  /** The owner's GitHub avatar, `https://avatars.githubusercontent.com/u/<id>?v=<n>`. */
  avatar?: string;
  createdAt?: string;
}
