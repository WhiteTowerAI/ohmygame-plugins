// A Library source for Sketchfab (sketchfab.com): downloadable 3D models under
// licenses that allow commercial use and changes (CC0, CC BY and CC BY-SA).
// Browsing, searching and thumbnails need no account. Adding a model downloads
// it, which Sketchfab allows only to a signed-in person: with OhMyGame's
// Sketchfab sign-in (OAuth authorization code as a public client, returning to
// this computer) or with the API token from the person's Sketchfab settings.
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const API = "https://api.sketchfab.com/v3";
const SITE = "https://sketchfab.com";
const HEADERS = { "User-Agent": "ohmygame-sketchfab-plugin" };
/** Where Sketchfab shows a person's API token (Settings › Password & API). */
export const TOKEN_PAGE = `${SITE}/settings/password`;
/**
 * OhMyGame's Sketchfab OAuth application: authorization code, registered as a
 * public client (no secret, as Sketchfab sets up desktop apps) with the
 * redirect below. A public client's ID isn't a secret.
 */
export const CLIENT_ID = "UzF21eLjwbKLCben4gh6PnBGdn0RcBhMrC3seoZr";
// Sketchfab takes only redirects it has registered, so the port is fixed.
export const REDIRECT_PORT = 52817;
export const REDIRECT_PATH = "/sketchfab/callback";
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}${REDIRECT_PATH}`;
const SIGN_IN_MS = 10 * 60_000;
const ACCOUNT_FILE = "account.json";
// The Library takes files up to 200 MB.
export const MAX_BYTES = 200 * 1024 * 1024;

/**
 * The licenses the tab searches and adds, by Sketchfab's slug: each allows
 * commercial use and changes. Sketchfab searches one license at a time.
 */
export const LICENSES = {
  by: { uid: "322a749bcfa841b29dff1e8a1bb74b0b", name: "CC BY" },
  cc0: { uid: "7c23a1ba438d4306920229c12afcb5f9", name: "CC0" },
  "by-sa": { uid: "b9ddc40b93e34cdca1fc152f39b9f375", name: "CC BY-SA" },
};
const LICENSE_BY_UID = new Map(
  Object.values(LICENSES).map((license) => [license.uid, license]),
);
// Each license fills a third of a page.
const PER_LICENSE = 8;
/** Each collection of the tab, in the manifest's order, and its Sketchfab category. */
export const COLLECTIONS = {
  all: undefined,
  characters: "characters-creatures",
  animals: "animals-pets",
  vehicles: "cars-vehicles",
  weapons: "weapons-military",
  nature: "nature-plants",
  buildings: "architecture",
  furniture: "furniture-home",
  food: "food-drink",
  tech: "science-technology",
};
const UID = /^[0-9a-f]{32}$/;

/**
 * Sketchfab's own viewer for a model, which the Library's details load when
 * asked (OhMyGame API 2.35): it turns, zooms and plays the model's animations.
 * `dnt=1` asks Sketchfab not to track the viewer.
 */
export function embedOf(uid) {
  const params = new URLSearchParams({ autostart: "1", ui_theme: "dark", dnt: "1" });
  return `${SITE}/models/${uid}/embed?${params}`;
}

export const SIGN_IN_NEEDED =
  "Sign in to Sketchfab to add models: open Plugins › Sketchfab › Settings and sign in, or paste your Sketchfab API token there. Browsing and previews work without an account.";

const text = (value, max) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : undefined;
const https = (value) =>
  typeof value === "string" &&
  value.startsWith("https://") &&
  value.length <= 2000
    ? value
    : undefined;

/**
 * The license of a Sketchfab model, when it is one the tab adds. Search
 * results name it by `uid`; a model's own page by `slug` and `uri`, without
 * `uid`.
 */
export function licenseOf(model) {
  const license = model?.license;
  const uid =
    license?.uid ??
    /\/licenses\/([0-9a-f]{32})\/?$/.exec(String(license?.uri ?? ""))?.[1];
  return (
    LICENSE_BY_UID.get(String(uid ?? "")) ??
    (Object.hasOwn(LICENSES, String(license?.slug))
      ? LICENSES[license.slug]
      : undefined)
  );
}

/** Who made it, its license and its page, as the Library keeps them with an asset. */
export function credit(model) {
  const author =
    text(model?.user?.displayName, 200) ?? text(model?.user?.username, 200);
  const url = https(model?.viewerUrl);
  const license = licenseOf(model);
  return {
    ...(author ? { author } : {}),
    ...(license ? { license: license.name } : {}),
    ...(url ? { url } : {}),
  };
}

/** The smallest thumbnail at least 400 pixels wide, or the largest there is. */
export function thumbnailOf(model) {
  const images = (
    Array.isArray(model?.thumbnails?.images) ? model.thumbnails.images : []
  )
    .filter((image) => https(image?.url) && Number.isInteger(image.width))
    .sort((a, b) => a.width - b.width);
  return (images.find((image) => image.width >= 400) ?? images.at(-1))?.url;
}

/**
 * One search result as a Library item, or nothing for one the tab leaves
 * out: another license, age-restricted, or a GLB the Library can't take.
 */
export function item(model) {
  if (!UID.test(String(model?.uid)) || !licenseOf(model)) return undefined;
  if (model.isAgeRestricted === true) return undefined;
  const archives = model.archives;
  if (archives && typeof archives === "object") {
    const size = archives.glb?.size;
    if (!archives.glb || (Number.isFinite(size) && size > MAX_BYTES))
      return undefined;
  }
  const thumbnail = thumbnailOf(model);
  return {
    id: model.uid,
    name: text(model.name, 200) ?? "Untitled",
    mediaType: "model",
    ...(thumbnail ? { thumbnail } : {}),
    embed: embedOf(model.uid),
    ...credit(model),
  };
}

/** A file name from the title, without characters a file name can't hold. */
export function fileName(title) {
  const base = String(title ?? "")
    .replace(/[\p{Cc}/\\:*?"<>|]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .slice(0, 120);
  return `${base || "sketchfab"}.glb`;
}

/** Where each license's results continue: a Sketchfab cursor, or null once it has no more. */
export function readCursor(cursor) {
  let value;
  try {
    value = JSON.parse(Buffer.from(String(cursor), "base64url").toString());
  } catch {
    value = undefined;
  }
  const valid =
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([license, next]) =>
        Object.hasOwn(LICENSES, license) &&
        (next === null ||
          (typeof next === "string" && /^[\w-]{1,64}$/.test(next))),
    );
  if (!valid) throw new Error("That isn't a Sketchfab page this tab gave");
  return value;
}

const writeCursor = (cursors) =>
  Buffer.from(JSON.stringify(cursors)).toString("base64url");

async function detailOf(response) {
  return response
    .json()
    .then((body) => {
      const said = body?.detail ?? body?.error_description ?? body?.error;
      return typeof said === "string" ? said.slice(0, 300) : undefined;
    })
    .catch(() => undefined);
}

class SketchfabError extends Error {
  constructor(status, detail) {
    super(`Sketchfab answered ${status}${detail ? `: ${detail}` : ""}`);
    this.status = status;
  }
}

/** Asks the Data API, with the person's credentials when given. */
async function call(url, { authorization, signal } = {}) {
  const response = await fetch(url, {
    headers: {
      ...HEADERS,
      ...(authorization ? { Authorization: authorization.header } : {}),
    },
    ...(signal ? { signal } : {}),
  });
  if (response.status === 429)
    throw new Error("Sketchfab is limiting requests. Try again later.");
  if (!response.ok)
    throw new SketchfabError(response.status, await detailOf(response));
  return response.json();
}

/** The account a token belongs to, as Sketchfab's `/me` gives it. */
async function accountOf(header, signal) {
  const me = await call(`${API}/me`, { authorization: { header }, signal });
  const username = text(me?.username, 200);
  if (!username) throw new Error("Sketchfab answered without an account");
  return { username, displayName: text(me?.displayName, 200) ?? username };
}

/** Saves a download, refusing one over the Library's limit or that isn't GLB. */
async function saveGlb(response, file) {
  let size = 0;
  let head = Buffer.alloc(0);
  const limit = new Transform({
    transform(chunk, _encoding, done) {
      size += chunk.length;
      if (head.length < 4) head = Buffer.concat([head, chunk]).subarray(0, 4);
      if (size > MAX_BYTES)
        done(new Error("This model is larger than the Library's 200 MB"));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      limit,
      createWriteStream(file),
    );
  } catch (error) {
    await rm(file, { force: true });
    throw error;
  }
  if (head.toString("latin1") !== "glTF") {
    await rm(file, { force: true });
    throw new Error("Sketchfab's download isn't a GLB file");
  }
}

const STATUS = {
  en: {
    waiting: "Waiting for you to allow OhMyGame in the Sketchfab page.",
    waitingDetail:
      "Sign in to Sketchfab there and choose Allow. Sketchfab then returns to this computer, and this says who is signed in.",
    openSignIn: "Open Sketchfab sign-in",
    signedIn: (name) => `Signed in to Sketchfab as ${name}.`,
    renews:
      "Adding a model downloads it with this account. OhMyGame renews the sign-in by itself; choose Sign out to stop.",
    expired: (date) =>
      `Your Sketchfab sign-in ended on ${date}. Sign in again to add models.`,
    token: (name) => `Using the API token of ${name}.`,
    tokenDetail:
      "Adding a model downloads it with this account. Clear the token, or choose Sign out, to stop.",
    tokenRefused:
      "Sketchfab didn't accept the API token above. Copy it again from your Sketchfab settings, or clear it.",
    unreachable: "Sketchfab can't be reached to check the API token.",
    signedOut:
      "Not signed in. Browsing and previews work without an account; adding a model needs a Sketchfab sign-in.",
    howTo: (oauth) =>
      oauth
        ? "Choose Sign in with Sketchfab, or paste the API token from Sketchfab's Settings › Password & API above."
        : "Paste the API token from Sketchfab's Settings › Password & API above. Get API token opens that page.",
    tokenPage: "Sketchfab API token",
    failed: (why) => `Sketchfab sign-in didn't finish: ${why}`,
  },
  "zh-CN": {
    waiting: "请在 Sketchfab 页面中允许 OhMyGame。",
    waitingDetail:
      "在该页面登录 Sketchfab 并选择“允许”。Sketchfab 会返回本机，这里随后显示登录的账号。",
    openSignIn: "打开 Sketchfab 登录",
    signedIn: (name) => `已登录 Sketchfab：${name}。`,
    renews: "添加模型时会用此账号下载。OhMyGame 会自动续期登录；选择“退出登录”即可停止。",
    expired: (date) => `Sketchfab 登录已于 ${date} 到期。请重新登录以添加模型。`,
    token: (name) => `正在使用 ${name} 的 API 令牌。`,
    tokenDetail: "添加模型时会用此账号下载。清空令牌或选择“退出登录”即可停止。",
    tokenRefused:
      "Sketchfab 不接受上面的 API 令牌。请从 Sketchfab 设置中重新复制，或将其清空。",
    unreachable: "无法连接 Sketchfab 来检查 API 令牌。",
    signedOut: "未登录。浏览和预览无需账号；添加模型需要登录 Sketchfab。",
    howTo: (oauth) =>
      oauth
        ? "选择“使用 Sketchfab 登录”，或在上方粘贴 Sketchfab“设置 › Password & API”中的 API 令牌。"
        : "在上方粘贴 Sketchfab“设置 › Password & API”中的 API 令牌。“获取 API 令牌”会打开该页面。",
    tokenPage: "Sketchfab API 令牌",
    failed: (why) => `Sketchfab 登录未完成：${why}`,
  },
};

const PAGE = {
  en: {
    title: "Sketchfab sign-in",
    done: "Signed in. You can close this tab and go back to OhMyGame.",
    failed: "Sign-in didn't finish. Go back to OhMyGame and try again.",
  },
  "zh-CN": {
    title: "Sketchfab 登录",
    done: "已登录。可以关闭此标签页并返回 OhMyGame。",
    failed: "登录未完成。请返回 OhMyGame 重试。",
  },
};

/** The page Sketchfab returns to, once the sign-in has finished or failed. */
function callbackPage(locale, done) {
  const words = PAGE[locale];
  return `<!doctype html><html lang="${locale}"><meta charset="utf-8"><title>${words.title}</title>
<style>body{font:16px system-ui,sans-serif;margin:20vh auto;max-width:28em;text-align:center}</style>
<p>${done ? words.done : words.failed}</p></html>`;
}

/**
 * Asks Sketchfab's token endpoint, as a public client: with the client ID and
 * no secret. Returns the new access token, its refresh token and lifetime.
 */
async function requestToken(fields, signal) {
  const response = await fetch(`${SITE}/oauth2/token/`, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok)
    throw new SketchfabError(response.status, await detailOf(response));
  const body = await response.json();
  const accessToken = String(body?.access_token ?? "");
  if (!/^[\w.~+/=-]{8,512}$/.test(accessToken))
    throw new Error("Sketchfab returned no access token");
  const refreshToken =
    typeof body.refresh_token === "string" &&
    /^[\w.~+/=-]{8,512}$/.test(body.refresh_token)
      ? body.refresh_token
      : undefined;
  const seconds = Number(body.expires_in);
  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 2_592_000,
  };
}

/**
 * The person's Sketchfab sign-in: an OAuth account kept in the plugin's data
 * folder, readable only by them, or the API token saved in Settings.
 */
export function sketchfab({
  dataFolder,
  apiToken,
  clientId = CLIENT_ID,
  now = () => Date.now(),
}) {
  let token = typeof apiToken === "string" ? apiToken.trim() : "";
  const accountFile = path.join(dataFolder, ACCOUNT_FILE);
  let pending;
  let failure;
  let checked;
  let renewing;

  async function readAccount() {
    const saved = await readFile(accountFile, "utf8").then(
      (value) => JSON.parse(value),
      () => undefined,
    );
    return typeof saved?.accessToken === "string" &&
      Number.isFinite(saved.expiresAt) &&
      typeof saved.username === "string"
      ? saved
      : undefined;
  }

  const bearer = (account) => ({
    header: `Bearer ${account.accessToken}`,
    kind: "oauth",
  });

  /**
   * A new access token for the saved sign-in, from its refresh token; one
   * request however many ask at once. A refresh token Sketchfab refuses ends
   * the sign-in.
   */
  function renew(account) {
    renewing ??= (async () => {
      if (!account.refreshToken || !clientId) return undefined;
      try {
        const tokens = await requestToken({
          grant_type: "refresh_token",
          refresh_token: account.refreshToken,
          client_id: clientId,
        });
        const { accessToken: _, refreshToken: __, expiresAt: ___, ...who } = account;
        return await save({ refreshToken: account.refreshToken, ...tokens }, who);
      } catch (error) {
        if (error?.status === 400 || error?.status === 401) {
          await rm(accountFile, { force: true });
          return undefined;
        }
        throw error;
      }
    })().finally(() => {
      renewing = undefined;
    });
    return renewing;
  }

  /** The header a download is asked with: the OAuth account first, then the API token. */
  async function authorization() {
    const account = await readAccount();
    if (account && account.expiresAt > now()) return bearer(account);
    if (account?.refreshToken) {
      const renewed = await renew(account);
      if (renewed) return bearer(renewed);
    }
    if (token) return { header: `Token ${token}`, kind: "token" };
    return undefined;
  }

  /** Who the API token belongs to, asked again every ten minutes. */
  async function checkToken() {
    if (checked && checked.at > now() - 10 * 60_000) return checked.result;
    let result;
    try {
      result = {
        account: await accountOf(`Token ${token}`, AbortSignal.timeout(6000)),
      };
    } catch (error) {
      result = { refused: error?.status === 401 || error?.status === 403 };
    }
    checked = { at: now(), result };
    return result;
  }

  /** Ends a waiting sign-in; the server stops listening, and drops its connections unless one is still answering. */
  function stop({ answering = false } = {}) {
    if (!pending) return;
    const { server, timer } = pending;
    pending = undefined;
    clearTimeout(timer);
    server.close();
    if (!answering) server.closeAllConnections?.();
  }

  /** Keeps a sign-in for this person alone, renewed a minute early so a download doesn't start with one about to end. */
  async function save(tokens, account) {
    const saved = {
      accessToken: tokens.accessToken,
      ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
      expiresAt: now() + Math.max(0, tokens.seconds - 60) * 1000,
      ...account,
    };
    await writeFile(accountFile, JSON.stringify(saved), { mode: 0o600 });
    return saved;
  }

  /** Turns the code Sketchfab returned into a saved sign-in. */
  async function receive(query) {
    if (query.get("error")) {
      const error = query.get("error");
      throw new Error(
        error === "access_denied"
          ? "you didn't allow OhMyGame"
          : String(query.get("error_description") ?? error).slice(0, 200),
      );
    }
    const code = query.get("code") ?? "";
    if (!/^[\w.~+/=-]{1,512}$/.test(code))
      throw new Error("Sketchfab returned no code");
    const tokens = await requestToken({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
    });
    await save(tokens, await accountOf(`Bearer ${tokens.accessToken}`));
  }

  async function handle(request, response) {
    response.shouldKeepAlive = false;
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${REDIRECT_PORT}`);
    // Another site can't reach this server through a name that points here.
    if (
      request.method !== "GET" ||
      request.headers.host !== `127.0.0.1:${REDIRECT_PORT}` ||
      url.pathname !== REDIRECT_PATH ||
      !pending
    ) {
      response.writeHead(404).end();
      return;
    }
    const { locale, state } = pending;
    const page = (status, done) =>
      response
        .writeHead(status, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        })
        .end(callbackPage(locale, done));
    // Only the sign-in OhMyGame started; another page's visit leaves it waiting.
    if (url.searchParams.get("state") !== state) {
      page(400, false);
      return;
    }
    try {
      await receive(url.searchParams);
      failure = undefined;
      page(200, true);
    } catch (error) {
      failure = String(error?.message ?? error).slice(0, 300);
      page(400, false);
    }
    stop({ answering: true });
  }

  async function begin(locale) {
    if (!clientId) throw new Error("Sketchfab sign-in isn't available in this version: paste an API token instead");
    stop();
    failure = undefined;
    const server = createServer((request, response) => {
      handle(request, response).catch(() => response.destroy());
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(REDIRECT_PORT, "127.0.0.1", resolve);
    }).catch((error) => {
      throw new Error(
        error?.code === "EADDRINUSE"
          ? `Port ${REDIRECT_PORT} on this computer is in use, so Sketchfab can't return to OhMyGame. Close what uses it and try again, or paste an API token instead.`
          : `OhMyGame couldn't wait for Sketchfab's answer: ${error?.message ?? error}`,
      );
    });
    const state = randomBytes(24).toString("base64url");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      state,
      approval_prompt: "auto",
    });
    pending = {
      server,
      state,
      locale,
      url: `${SITE}/oauth2/authorize/?${params}`,
      expiresAt: now() + SIGN_IN_MS,
      timer: setTimeout(stop, SIGN_IN_MS),
    };
    pending.timer.unref?.();
  }

  async function status(locale) {
    const words = STATUS[locale];
    const date = (ms) =>
      new Date(ms).toLocaleDateString(locale, { dateStyle: "medium" });
    if (pending)
      return {
        message: words.waiting,
        detail: words.waitingDetail,
        link: {
          title: words.openSignIn,
          url: pending.url,
          expiresAt: pending.expiresAt,
        },
        actions: ["cancel-sign-in"],
      };
    const account = await readAccount();
    // One that has ended is renewed when a model is added, not by reading the status.
    if (account && (account.expiresAt > now() || account.refreshToken))
      return {
        message: words.signedIn(account.displayName ?? account.username),
        detail: words.renews,
        actions: ["sign-out"],
      };
    const signIn = clientId ? ["sign-in"] : [];
    const signOut = account || token ? ["sign-out"] : [];
    if (token) {
      const result = await checkToken();
      if (result.account)
        return {
          message: words.token(result.account.displayName),
          detail: words.tokenDetail,
          actions: [...signIn, "sign-out"],
        };
      return {
        message: result.refused ? words.tokenRefused : words.unreachable,
        actions: [...signIn, "open-token-page", ...signOut],
      };
    }
    return {
      message: account
        ? words.expired(date(account.expiresAt))
        : words.signedOut,
      detail: failure ? words.failed(failure) : words.howTo(Boolean(clientId)),
      actions: [...signIn, "open-token-page", ...signOut],
    };
  }

  return {
    authorization,
    status,
    begin,
    stop,
    async signOut() {
      stop();
      await rm(accountFile, { force: true });
      checked = undefined;
      if (!token) return undefined;
      // The API token is a setting, so it is cleared through Settings.
      token = "";
      return { apiToken: null };
    },
    /**
     * After Sketchfab refused a sign-in: a renewed one to try again with, or
     * nothing, having forgotten one that can't be renewed.
     */
    async refused(kind) {
      if (kind !== "oauth") return undefined;
      const account = await readAccount();
      const renewed = account ? await renew(account) : undefined;
      if (!renewed) await rm(accountFile, { force: true });
      return renewed ? bearer(renewed) : undefined;
    },
  };
}

const localeOf = (input) => (input?.locale === "zh-CN" ? "zh-CN" : "en");

export function activate(context, options = {}) {
  const account = sketchfab({
    dataFolder: context.dataFolder,
    apiToken: context.configuration?.apiToken,
    ...options,
  });
  context.onDispose?.(() => account.stop());

  context.registerCommand("search", async ({ query, cursor, collection }, run) => {
    const category = COLLECTIONS[collection];
    const cursors = cursor
      ? readCursor(cursor)
      : Object.fromEntries(Object.keys(LICENSES).map((license) => [license, ""]));
    const licenses = Object.keys(LICENSES).filter(
      (license) => typeof cursors[license] === "string",
    );
    const words = String(query ?? "").trim();
    const pages = await Promise.all(
      licenses.map(async (license) => {
        const params = new URLSearchParams({
          type: "models",
          downloadable: "true",
          license,
          count: String(PER_LICENSE),
        });
        if (cursors[license]) params.set("cursor", cursors[license]);
        if (words) params.set("q", words.slice(0, 200));
        // A browse shows the most liked first; a search, the best matches.
        else params.set("sort_by", "-likeCount");
        if (category) params.set("categories", category);
        const body = await call(`${API}/search?${params}`, {
          signal: run?.signal,
        });
        const next = body?.cursors?.next;
        return {
          license,
          results: Array.isArray(body?.results) ? body.results : [],
          next: typeof next === "string" && next ? next : null,
        };
      }),
    );
    // One of each license in turn, so no license fills the page alone.
    const items = [];
    const seen = new Set();
    for (let index = 0; index < PER_LICENSE * 2; index++)
      for (const page of pages) {
        const found = page.results[index] && item(page.results[index]);
        if (found && !seen.has(found.id)) {
          seen.add(found.id);
          items.push(found);
        }
      }
    const nexts = Object.fromEntries(
      Object.keys(LICENSES).map((license) => [
        license,
        pages.find((page) => page.license === license)?.next ?? null,
      ]),
    );
    const more = Object.values(nexts).some((next) => next !== null);
    return { items, ...(more ? { next: writeCursor(nexts) } : {}) };
  });

  context.registerCommand("fetch", async ({ id, mediaType }, run) => {
    if (mediaType !== "model" || !UID.test(String(id)))
      throw new Error(`${id} isn't a Sketchfab model`);
    const signal = run?.signal;
    const authorization = await account.authorization();
    if (!authorization) throw new Error(SIGN_IN_NEEDED);
    const model = await call(`${API}/models/${id}`, { signal });
    const name = text(model?.name, 200) ?? id;
    const license = licenseOf(model);
    if (!license)
      throw new Error(
        `${name} is under ${text(model?.license?.label, 100) ?? "a license"} this plugin doesn't add: only CC0, CC BY and CC BY-SA, which allow commercial use and changes`,
      );
    if (model.isDownloadable !== true)
      throw new Error(`${name}'s author doesn't allow downloading it`);
    const downloadOf = (credentials) =>
      call(`${API}/models/${id}/download`, {
        authorization: credentials,
        signal,
      });
    let download;
    try {
      download = await downloadOf(authorization);
    } catch (error) {
      if (error?.status !== 401) throw error;
      // A sign-in Sketchfab ended early is renewed and tried once more.
      const renewed = await account.refused(authorization.kind);
      if (renewed)
        download = await downloadOf(renewed).catch((again) => {
          if (again?.status === 401)
            throw new Error(`Sketchfab no longer accepts your sign-in. ${SIGN_IN_NEEDED}`);
          throw again;
        });
      else throw new Error(
        authorization.kind === "oauth"
          ? `Sketchfab no longer accepts your sign-in. ${SIGN_IN_NEEDED}`
          : "Sketchfab didn't accept the API token in this plugin's Settings. Copy it again from Sketchfab's Settings › Password & API, or sign in.",
      );
    }
    const glb = download?.glb;
    const source = https(glb?.url);
    if (!source) throw new Error(`Sketchfab has no GLB download for ${name}`);
    if (Number.isFinite(glb.size) && glb.size > MAX_BYTES)
      throw new Error(`${name} is larger than the Library's 200 MB`);
    // The download address is signed for a while; it is asked for without the person's credentials.
    const response = await fetch(source, {
      headers: HEADERS,
      ...(signal ? { signal } : {}),
    });
    if (!response.ok || !response.body)
      throw new Error(`Sketchfab's download of ${name} answered ${response.status}`);
    // Adds run one at a time, so every download can be saved under one name.
    const file = "download.glb";
    await saveGlb(response, path.join(context.dataFolder, file));
    return { file, name: fileName(model.name), ...credit(model) };
  });

  context.registerCommand("settingsStatus", (input) =>
    account.status(localeOf(input)),
  );
  context.registerCommand("signIn", async (input) => {
    await account.begin(localeOf(input));
    return account.status(localeOf(input));
  });
  context.registerCommand("cancelSignIn", (input) => {
    account.stop();
    return account.status(localeOf(input));
  });
  context.registerCommand("signOut", async (input) => {
    const configuration = await account.signOut();
    return {
      ...(await account.status(localeOf(input))),
      ...(configuration ? { configuration } : {}),
    };
  });
  context.registerCommand("openTokenPage", async (input) => {
    const locale = localeOf(input);
    return {
      ...(await account.status(locale)),
      link: {
        title: STATUS[locale].tokenPage,
        url: TOKEN_PAGE,
        expiresAt: Date.now() + SIGN_IN_MS,
      },
    };
  });
}
