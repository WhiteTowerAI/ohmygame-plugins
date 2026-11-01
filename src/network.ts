// What the index job reads from the network, apart from package tarballs.

import type { FactSources } from "./catalog.ts";

export const REGISTRY = "https://registry.npmjs.org";

/** A fetch that tries again on a network error or a 5xx/429 answer. */
export async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt >= 3 || (response.status < 500 && response.status !== 429)) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt >= 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}

/** A read that gives up rather than holding up the run; for facts, which can wait. */
async function factResponse(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetchWithRetry(url, { headers, signal: AbortSignal.timeout(15_000) });
}

const FACTS_MAX_BYTES = 1024 * 1024;

export const factSources: FactSources = {
  async attestations(name, version) {
    const response = await factResponse(`${REGISTRY}/-/npm/v1/attestations/${name.replace("/", "%2f")}@${version}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  async packageJson({ owner, repo, directory }) {
    const file = [owner, repo, "HEAD", ...(directory ? directory.split("/") : []), "package.json"].map(encodeURIComponent).join("/");
    const response = await factResponse(`https://raw.githubusercontent.com/${file}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return text.length > FACTS_MAX_BYTES ? undefined : text;
  },
  async stars({ owner, repo }) {
    const token = process.env.GITHUB_TOKEN;
    const response = await factResponse(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      accept: "application/vnd.github+json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { stargazers_count: stars } = await response.json() as { stargazers_count?: unknown };
    if (typeof stars !== "number") throw new Error("no star count");
    return stars;
  },
  async weeklyDownloads(name) {
    const response = await factResponse(`https://api.npmjs.org/downloads/point/last-week/${name.replace("/", "%2f")}`);
    // A package too new for npm's counts has none yet.
    if (response.status === 404) return 0;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { downloads } = await response.json() as { downloads?: unknown };
    if (typeof downloads !== "number") throw new Error("no download count");
    return downloads;
  },
};
