// The checks one release must pass to enter the index. Its archive is
// unpacked by the app's own code under the app's limits, as installing it
// would (`app/`, a checkout of WhiteTowerAI/ohmygame), into a private
// temporary folder, and checked there by the app's package check, so the
// index accepts what the app would install. Its icon and screenshots are
// checked as the app checks them and handed back by their contents' hash, for
// the index to keep beside it. Nothing from a package is run.

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { publisherIssue } from "./github.ts";
const LOCALES = ["en", "zh-CN"] as const;
/** What model providers make, in the app's order (`PROVIDER_KINDS` in OhMyGame's `src/shared/plugins.ts`). */
const PROVIDER_KINDS = ["language", "image", "video", "audio", "3d"] as const;

/** What the package's contents say, which never changes for one archive. */
export interface Verdict {
  plugin?: {
    id: string;
    /** By locale. */
    displayName: Record<string, string>;
    description: Record<string, string>;
    longDescription?: Record<string, string>;
    categories?: string[];
    /** Words to find it by, each by locale. */
    keywords?: Record<string, string>[];
    /** The titles of the model providers and agents it adds, each by locale, which search reads. */
    names?: Record<string, string>[];
    /** What its model providers make: `language` for chat, and each kind of media. */
    providerKinds?: string[];
    /** Project types it suits. */
    appliesTo?: string[];
    beta?: true;
    /** Its icon and screenshots, by their path beside the index: `assets/<sha256>.<ext>`. */
    icon?: string;
    screenshots?: { path: string; caption?: Record<string, string> }[];
    /** What it asks to be allowed, as the app's consent lists it. */
    grants: string[];
    /** How many of each contribution it adds, Skills included. */
    adds: Record<string, number>;
  };
  /** Why it can't be installed; absent when it can. */
  rejected?: string[];
}

/** What the index says about one release. */
export interface IndexedVersion extends Verdict {
  /** `owner/repo`, as GitHub spells it. */
  repository: string;
  tag: string;
  commit: string;
  version: string;
  publishedAt?: string;
  /** The market's signed record, for a version that can be installed. */
  release?: import("./signing.ts").SignedRelease;
  /** The same archive on GitHub, for a release that attaches it. */
  github?: string;
}

interface AppEntry {
  manifest: {
    id: string;
    version: string;
    displayName: string;
    description: string;
    longDescription?: string;
    categories?: string[];
    keywords?: string[];
    appliesTo?: string[];
    beta?: boolean;
    icon?: string;
    screenshots?: { path: string; caption?: string }[];
    contributes?: Record<string, unknown>;
  };
  strings: unknown;
  skills: unknown[];
}

/** The app code the checks use. */
export interface AppChecks {
  indexPluginPackage(root: string): Promise<{ ok: true; entry: AppEntry } | { ok: false; issues: { path: string; message: string }[] }>;
  localizePluginString(entry: AppEntry, value: string, locale: string): string;
  pluginApiIssue(manifest: AppEntry["manifest"]): string | undefined;
  capabilityGrants(manifest: AppEntry["manifest"]): string[];
  /** Throws for an icon the app wouldn't show: not a PNG, WebP or static SVG of the type its name says. */
  validateIcon(bytes: Buffer, mediaType: string): Promise<unknown>;
  /** A PNG, JPEG or WebP's type, which a screenshot must be. */
  sniffImage(bytes: Buffer): string | undefined;
  iconMediaTypes: Record<string, string>;
  /** The categories the app knows. */
  categories: readonly string[];
  archiveMaxBytes: number;
  archiveMaxEntries: number;
  /** The app's ZIP extraction, which installing a release uses. */
  extractArchive(archive: string, destination: string, options: {
    maxEntries: number;
    maxBytes: number;
    include?: (relative: string) => boolean;
    error: (reason: string) => Error;
  }): Promise<void>;
  /** Which app code judged: its commit, so a verdict is redone when the checks change. */
  version: string;
}

/** Loads the checks from an OhMyGame checkout. */
export async function loadAppChecks(appRoot: string): Promise<AppChecks> {
  const load = (file: string) => import(pathToFileURL(path.resolve(appRoot, file)).href);
  const [manifest, plugins, index, projectPlugins, icons, iconTypes, images, archives] = await Promise.all([
    load("src/shared/plugin-manifest.ts"),
    load("src/shared/plugins.ts"),
    load("src/daemon/plugin-index.ts"),
    load("src/daemon/project-plugins.ts"),
    load("src/daemon/plugin-icons.ts"),
    load("src/shared/plugin-icons.ts"),
    load("src/daemon/image-format.ts"),
    load("src/daemon/archive-extraction.ts"),
  ]);
  const commit = await promisify(execFile)("git", ["-C", appRoot, "rev-parse", "HEAD"])
    .then(({ stdout }) => stdout.trim())
    .catch(() => undefined);
  return {
    indexPluginPackage: index.indexPluginPackage,
    localizePluginString: index.localizePluginString,
    pluginApiIssue: manifest.pluginApiIssue,
    capabilityGrants: projectPlugins.capabilityGrants,
    validateIcon: icons.validatePluginIconImage,
    sniffImage: images.sniffImageType,
    iconMediaTypes: iconTypes.PLUGIN_ICON_MEDIA_TYPES,
    categories: manifest.PLUGIN_CATEGORIES,
    archiveMaxBytes: plugins.PLUGIN_ARCHIVE_MAX_BYTES,
    archiveMaxEntries: plugins.PLUGIN_ARCHIVE_MAX_ENTRIES,
    extractArchive: archives.extractArchive,
    // Without a commit no verdict is reused.
    version: commit ?? `unknown-${Date.now()}`,
  };
}

/** Where the index keeps an image: named by its contents, so it never changes. */
export function imagePath(bytes: Buffer, extension: string): string {
  return `assets/${createHash("sha256").update(bytes).digest("hex")}.${extension}`;
}

/** Keeps an image the index lists, by its path from `imagePath`. */
export type SaveImage = (path: string, bytes: Buffer) => Promise<void>;

const SCREENSHOT_EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** An archive the app couldn't install, and why. */
export class ArchiveError extends Error {}

/**
 * Unpacks a release's archive into `folder` as the app's `installRelease`
 * does, and returns the package's folder: the top of the archive, or the one
 * folder it was zipped with. A manifest folder anywhere else is refused.
 */
export async function unpackArchive(app: AppChecks, archive: string, folder: string): Promise<string> {
  let wrapped = false;
  await app.extractArchive(archive, folder, {
    maxEntries: app.archiveMaxEntries,
    maxBytes: app.archiveMaxBytes,
    include: (relative) => {
      const parts = relative.split("/").filter(Boolean);
      parts.forEach((part, index) => {
        if (part !== ".ohmygame-plugin" || index === 0) return;
        if (index === 1 && !parts[0]!.startsWith(".")) {
          wrapped = true;
          return;
        }
        throw new ArchiveError(`has a manifest folder outside its package: ${relative}`);
      });
      return true;
    },
    error: (reason) => new ArchiveError(`is unusable (${reason})`),
  });
  const items = await readdir(folder);
  const root = items.length === 1 && !items[0]!.startsWith(".") && (await stat(path.join(folder, items[0]!))).isDirectory()
    ? path.join(folder, items[0]!)
    : folder;
  if (wrapped && root === folder) throw new ArchiveError("has a manifest folder outside its package");
  return root;
}

/** What a release says it is: who publishes it, its version, and, in a repository of several, its name. */
export interface Expected {
  owner: string;
  version: string;
  name?: string;
}

/**
 * Checks one release's archive with the app's package check, and that the
 * package agrees with its release. Its icon and screenshots go to `save`.
 */
export async function judgeArchive(app: AppChecks, bytes: Buffer, expected: Expected, save: SaveImage = async () => {}): Promise<Verdict> {
  const folder = await mkdtemp(path.join(tmpdir(), "ohmygame-plugin-check-"));
  try {
    const archive = path.join(folder, "archive.zip");
    await writeFile(archive, bytes, { mode: 0o600 });
    const staging = path.join(folder, "package");
    await mkdir(staging, { mode: 0o700 });
    let root: string;
    try {
      root = await unpackArchive(app, archive, staging);
    } catch (error) {
      // A file system call failing here (no space, too many files) is this runner's, not the archive's.
      if ((error as NodeJS.ErrnoException).syscall) throw error;
      // Anything else unpacking it throws, such as corrupt compressed data, comes from the archive too.
      return { rejected: [error instanceof ArchiveError ? `the archive ${error.message}` : `the archive can't be unpacked: ${(error as Error).message}`] };
    }
    return await judgePackage(app, root, expected, save);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** Checks an unpacked package; see `judgeArchive`. */
export async function judgePackage(app: AppChecks, root: string, expected: Expected, save: SaveImage = async () => {}): Promise<Verdict> {
  const read = (file: string) => readFile(path.join(root, ...file.split("/"))).catch(() => undefined);
  const rejected: string[] = [];
  let scripts: Record<string, unknown> = {};
  try {
    const pkg = await read("package.json");
    scripts = pkg ? (JSON.parse(pkg.toString("utf8")).scripts ?? {}) : {};
  } catch {
    rejected.push("package.json is not JSON");
  }
  // The app never runs them, so a package that needs them wouldn't work.
  for (const script of ["preinstall", "install", "postinstall"])
    if (scripts[script]) rejected.push(`has a ${script} script, which the app never runs`);

  let result: Awaited<ReturnType<AppChecks["indexPluginPackage"]>>;
  // Whatever goes wrong from here on comes from the package's own files.
  try {
    result = await app.indexPluginPackage(root);
  } catch (error) {
    return { rejected: [...rejected, `the package can't be checked: ${(error as Error).message}`] };
  }
  if (!result.ok) return { rejected: [...rejected, ...result.issues.map((issue) => `${issue.path || "package"} ${issue.message}`)] };
  const { entry } = result;
  const manifest = entry.manifest;
  const publisher = publisherIssue(expected.owner, manifest.id);
  if (publisher) rejected.push(publisher);
  if (expected.name !== undefined && manifest.id.split("/")[1] !== expected.name)
    rejected.push(`the tag names ${expected.name}, plugin.json ${manifest.id}`);
  if (manifest.version !== expected.version) rejected.push(`plugin.json says version ${manifest.version}, the tag ${expected.version}`);
  const apiIssue = app.pluginApiIssue(manifest);
  if (apiIssue) rejected.push(apiIssue);
  if (rejected.length) return { rejected };
  const text = (value: string) => Object.fromEntries(LOCALES.map((locale) => [locale, app.localizePluginString(entry, value, locale)]));
  const displayName = text(manifest.displayName);
  const description = text(manifest.description);
  // A `%key%` must name a string the locale file itself holds, not, say, `%toString%`.
  for (const [field, values] of Object.entries({ displayName, description }))
    for (const [locale, value] of Object.entries(values))
      if (typeof value !== "string" || !value.trim()) rejected.push(`${field} isn't text in ${locale}`);
  if (rejected.length) return { rejected };
  // Optional text is left out in a locale it isn't text in.
  const optional = (value: string | undefined) => {
    const values = value === undefined ? {} : Object.fromEntries(Object.entries(text(value)).filter(([, item]) => typeof item === "string" && item.trim()));
    return Object.keys(values).length ? values : undefined;
  };
  // The package check found both in the package; one the app wouldn't show is left out.
  const kept = async (file: string, valid: (bytes: Buffer) => Promise<string | undefined>) => {
    const bytes = await read(file.slice(2));
    const extension = bytes && await valid(bytes);
    if (!bytes || !extension) return undefined;
    const at = imagePath(bytes, extension);
    await save(at, bytes);
    return at;
  };
  const icon = manifest.icon && await kept(manifest.icon, async (bytes) => {
    const extension = manifest.icon!.slice(manifest.icon!.lastIndexOf(".") + 1).toLowerCase();
    const mediaType = app.iconMediaTypes[extension];
    return mediaType && await app.validateIcon(bytes, mediaType).then(() => extension, () => undefined);
  });
  const screenshots = [];
  for (const shot of manifest.screenshots ?? []) {
    const at = await kept(shot.path, async (bytes) => SCREENSHOT_EXTENSIONS[app.sniffImage(bytes) ?? ""]);
    const caption = optional(shot.caption);
    if (at) screenshots.push({ path: at, ...(caption ? { caption } : {}) });
  }
  const longDescription = optional(manifest.longDescription);
  // An app older than plugin API 2.5.0 leaves keywords out of the manifest it reads.
  const keywords = (manifest.keywords ?? []).map(optional).filter((value) => value !== undefined);
  const titles = (list: unknown) => (Array.isArray(list) ? list : []).flatMap((item) =>
    item && typeof item === "object" && typeof (item as { title?: unknown }).title === "string" ? [(item as { title: string }).title] : []);
  const names = [...titles(manifest.contributes?.providers), ...titles(manifest.contributes?.agents)]
    .map(optional).filter((value) => value !== undefined).slice(0, 100);
  // Read off what each provider implements, so a listing can't claim what it doesn't make.
  // An app older than plugin API 2.5.0 leaves `media` out of the manifest it reads.
  const providers = (Array.isArray(manifest.contributes?.providers) ? manifest.contributes.providers : []) as { api?: unknown; media?: Record<string, unknown> }[];
  const providerKinds = PROVIDER_KINDS.filter((kind) => providers.some((provider) =>
    kind === "language" ? typeof provider?.api === "string" : Boolean(provider?.media?.[kind])));
  return {
    plugin: {
      id: manifest.id,
      displayName,
      description,
      ...(longDescription ? { longDescription } : {}),
      ...(manifest.categories?.length ? { categories: manifest.categories } : {}),
      ...(keywords.length ? { keywords } : {}),
      ...(names.length ? { names } : {}),
      ...(providerKinds.length ? { providerKinds } : {}),
      ...(manifest.appliesTo?.length ? { appliesTo: manifest.appliesTo } : {}),
      ...(manifest.beta ? { beta: true as const } : {}),
      ...(icon ? { icon } : {}),
      ...(screenshots.length ? { screenshots } : {}),
      grants: app.capabilityGrants(manifest),
      adds: Object.fromEntries(
        Object.entries(manifest.contributes ?? {})
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => [key, (value as unknown[]).length])
          .concat(entry.skills.length ? [["skills", entry.skills.length]] : []),
      ),
    },
  };
}
