// Finds plugins on GitHub: public repositories with the `ohmygame-plugin`
// topic, and their releases whose tag names a version. Parsing and decisions
// are here; the network comes in through `GitHubApi`, so tests can stand in.

/** A repository the topic search found. */
export interface FoundRepository {
  /** As GitHub spells it. */
  owner: string;
  repo: string;
  stars: number;
  /** The owner's avatar, when GitHub gives one at its usual address. */
  avatar?: string;
  createdAt?: string;
}

/** GitHub answered with an error. */
export class GitHubError extends Error {
  constructor(readonly status: number, url: string) {
    super(`${url}: HTTP ${status}`);
  }
}

/** One release, as GitHub lists it. */
export interface FoundRelease {
  id: number;
  tag: string;
  draft: boolean;
  publishedAt?: string;
  assets: { id: number; name: string; size: number; url: string }[];
}

/** What the index reads from GitHub. Each throws when GitHub can't answer. */
export interface GitHubApi {
  repositories(topic: string): Promise<FoundRepository[]>;
  /** Its newest releases, at most 100. */
  releases(owner: string, repo: string): Promise<FoundRelease[]>;
  /** The commit a tag points to. */
  commit(owner: string, repo: string, tag: string): Promise<string>;
}

const VERSION = "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?";
const ROOT_TAG = new RegExp(`^v(${VERSION})$`);
const NAMED_TAG = new RegExp(`^([a-z0-9]+(?:-[a-z0-9]+)*)-v(${VERSION})$`);

/**
 * A release tag the index reads: `v<version>` for a repository that is one
 * plugin, or `<name>-v<version>` for plugin `<name>` in a repository of
 * several, which must attach its package.
 */
export function parseTag(tag: string): { version: string; name?: string } | undefined {
  const root = ROOT_TAG.exec(tag);
  if (root) return { version: root[1]! };
  const named = NAMED_TAG.exec(tag);
  return named ? { name: named[1]!, version: named[2]! } : undefined;
}

/** Where a release's package comes from: its one `.zip` asset, else the tag's source. */
export type ReleaseArchive =
  | { kind: "asset"; id: number; url: string; size: number }
  | { kind: "source"; url: string };

export function releaseArchive(repository: FoundRepository, release: FoundRelease, commit: string): ReleaseArchive | { issue: string } {
  const zips = release.assets.filter((asset) => asset.name.toLowerCase().endsWith(".zip"));
  if (zips.length > 1) return { issue: `release ${release.tag} has more than one .zip asset` };
  const [zip] = zips;
  if (zip) return { kind: "asset", id: zip.id, url: zip.url, size: zip.size };
  // A repository of several plugins has no one folder its source could be.
  if (parseTag(release.tag)?.name) return { issue: `release ${release.tag} has no .zip asset` };
  return { kind: "source", url: `https://codeload.github.com/${repository.owner}/${repository.repo}/zip/${commit}` };
}

/**
 * Why a repository's owner can't publish a plugin id: the publisher is the
 * owner, lowercased, and `ohmygame` is OhMyGame's own, on WhiteTowerAI.
 */
export function publisherIssue(owner: string, id: string): string | undefined {
  const publisher = id.split("/")[0]!;
  const allowed = publisher === "ohmygame" ? "whitetowerai" : publisher;
  if (owner.toLowerCase() === allowed) return undefined;
  return `plugin ${id} must be published by ${publisher === "ohmygame" ? "WhiteTowerAI" : publisher}, not ${owner}`;
}

// --- GitHub's REST API ------------------------------------------------------

const API = "https://api.github.com";
const AVATAR = /^https:\/\/avatars\.githubusercontent\.com\/u\/[0-9]{1,12}(?:\?v=[0-9]{1,4})?$/;
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** GitHub's API through `fetch`, with the token when there is one. */
export function githubApi(fetch: Fetch, token = process.env.GITHUB_TOKEN): GitHubApi {
  const get = async (url: string): Promise<any> => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new GitHubError(response.status, url);
    return response.json();
  };
  const name = (value: unknown) => {
    if (typeof value !== "string" || !SAFE_NAME.test(value) || /^\.+$/.test(value)) throw new Error(`GitHub gave an unexpected name ${JSON.stringify(value)}`);
    return value;
  };
  return {
    async repositories(topic) {
      const found: FoundRepository[] = [];
      // Search gives at most 1000 results, 100 a page.
      for (let page = 1; page <= 10; page++) {
        const data = await get(`${API}/search/repositories?q=${encodeURIComponent(`topic:${topic} is:public fork:false`)}&sort=updated&per_page=100&page=${page}`);
        // A search that timed out answers with what it found so far; publishing that would drop the rest.
        if (data.incomplete_results === true) throw new Error("GitHub's search timed out before finding every repository");
        const items: any[] = Array.isArray(data.items) ? data.items : [];
        for (const item of items) {
          const avatar = item.owner?.avatar_url;
          found.push({
            owner: name(item.owner?.login),
            repo: name(item.name),
            stars: Number.isSafeInteger(item.stargazers_count) ? item.stargazers_count : 0,
            ...(typeof avatar === "string" && AVATAR.test(avatar) ? { avatar } : {}),
            ...(typeof item.created_at === "string" ? { createdAt: item.created_at } : {}),
          });
        }
        if (items.length < 100) break;
      }
      return found;
    },
    async releases(owner, repo) {
      // Only the newest page, so one repository can't spend the run's API budget.
      const items: any[] = await get(`${API}/repos/${owner}/${repo}/releases?per_page=100`);
      return items.map((item): FoundRelease => ({
        id: Number(item.id),
        tag: String(item.tag_name ?? ""),
        draft: item.draft === true,
        ...(typeof item.published_at === "string" ? { publishedAt: item.published_at } : {}),
        assets: (Array.isArray(item.assets) ? item.assets : []).map((asset: any) => ({
          id: Number(asset.id),
          name: String(asset.name ?? ""),
          size: Number(asset.size),
          url: String(asset.browser_download_url ?? ""),
        })),
      }));
    },
    async commit(owner, repo, tag) {
      const data = await get(`${API}/repos/${owner}/${repo}/commits/${encodeURIComponent(tag)}`);
      if (typeof data.sha !== "string" || !/^[0-9a-f]{40}$/.test(data.sha)) throw new Error(`${owner}/${repo} ${tag} has no commit`);
      return data.sha;
    },
  };
}
