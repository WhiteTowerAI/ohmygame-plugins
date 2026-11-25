import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";

// The Sketchfab Library source's native code, run with a stand-in context and
// a stand-in Sketchfab; its sign-in page on this computer is asked for real.
// official.test.ts checks its package.

type Command = (input: Record<string, unknown>) => Promise<any>;

const realFetch = globalThis.fetch;
const folders: string[] = [];

afterEach(async () => {
  globalThis.fetch = realFetch;
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function activate(plugin: string, configuration: Record<string, unknown> = {}, ...extra: unknown[]) {
  const dataFolder = await mkdtemp(path.join(tmpdir(), `ohmygame-${plugin}-`));
  folders.push(dataFolder);
  const module = await import(pathToFileURL(path.resolve("plugins", plugin, "native/index.mjs")).href);
  const commands: Record<string, Command> = {};
  module.activate({ dataFolder, configuration, registerCommand: (name: string, handler: Command) => (commands[name] = handler) }, ...extra);
  return { module, commands, dataFolder };
}

function stubFetch(answer: (url: string) => Response | Promise<Response>): string[] {
  const requests: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    requests.push(String(url));
    return answer(String(url));
  }) as typeof fetch;
  return requests;
}

describe("sketchfab", () => {
  const BY = { uid: "322a749bcfa841b29dff1e8a1bb74b0b", label: "CC Attribution" };
  const CC0 = { uid: "7c23a1ba438d4306920229c12afcb5f9", label: "CC0 Public Domain" };
  const NC = { uid: "bbfe3f7dbcdd4122b966b85b9786a989", label: "CC Attribution-NonCommercial" };
  const model = (uid: string, license = BY, extra: Record<string, unknown> = {}) => ({
    uid: uid.padEnd(32, "0"),
    name: `Model ${uid}`,
    viewerUrl: `https://sketchfab.com/3d-models/model-${uid.padEnd(32, "0")}`,
    isDownloadable: true,
    isAgeRestricted: false,
    license,
    user: { username: "maker", displayName: "The Maker" },
    archives: { glb: { size: 1000 } },
    thumbnails: {
      images: [
        { url: "https://media.sketchfab.com/1024.jpeg", width: 1024 },
        { url: "https://media.sketchfab.com/200.jpeg", width: 200 },
        { url: "https://media.sketchfab.com/448.jpeg", width: 448 },
      ],
    },
    ...extra,
  });
  // A model's own page names its license by slug and uri, without the uid search results carry.
  const detail = (uid: string, license = BY, slug = "by") => {
    const { license: _, ...rest } = model(uid);
    return { ...rest, license: { uri: `https://api.sketchfab.com/v3/licenses/${license.uid}`, label: license.label, slug } };
  };
  const GLB = Buffer.concat([Buffer.from("glTF"), Buffer.alloc(16)]);
  const local = (url: string) => url.startsWith("http://127.0.0.1:");

  it("browses without an account, a license at a time, keeping only those that allow commercial use and changes", async () => {
    const requests = stubFetch((url) => {
      const license = new URL(url).searchParams.get("license");
      const results = {
        by: [model("a1"), model("a2", BY, { isAgeRestricted: true }), model("a3", BY, { archives: { glb: { size: 300 * 1024 * 1024 } } })],
        cc0: [model("b1", CC0), model("b2", NC)],
        "by-sa": [],
      }[license!];
      return Response.json({ results, cursors: { next: license === "by" ? "8" : null } });
    });
    const { commands } = await activate("sketchfab");
    const found = await commands.search!({ query: "", collection: "characters" });
    assert.deepEqual(found.items.map((item: { id: string }) => item.id), ["a1".padEnd(32, "0"), "b1".padEnd(32, "0")]);
    assert.deepEqual(found.items[1], {
      id: "b1".padEnd(32, "0"),
      name: "Model b1",
      mediaType: "model",
      thumbnail: "https://media.sketchfab.com/448.jpeg",
      embed: `https://sketchfab.com/models/${"b1".padEnd(32, "0")}/embed?autostart=1&ui_theme=dark&dnt=1`,
      author: "The Maker",
      license: "CC0",
      url: `https://sketchfab.com/3d-models/model-${"b1".padEnd(32, "0")}`,
    });
    const asked = requests.map((url) => Object.fromEntries(new URL(url).searchParams));
    assert.deepEqual(asked.map((params) => params.license).sort(), ["by", "by-sa", "cc0"]);
    for (const params of asked) {
      assert.equal(params.downloadable, "true");
      assert.equal(params.categories, "characters-creatures");
      assert.equal(params.sort_by, "-likeCount");
    }

    // The next page asks only the licenses with more.
    requests.length = 0;
    await commands.search!({ query: " sword ", collection: "all", cursor: found.next });
    assert.deepEqual(requests.map((url) => Object.fromEntries(new URL(url).searchParams)), [{ type: "models", downloadable: "true", license: "by", count: "8", cursor: "8", q: "sword" }]);
    await assert.rejects(commands.search!({ query: "", cursor: "not-a-cursor" }), /isn't a Sketchfab page/);
  });

  it("asks to sign in before adding a model, and adds only allowed licenses", async () => {
    const requests = stubFetch(() => Response.json({}));
    const signedOut = await activate("sketchfab");
    await assert.rejects(signedOut.commands.fetch!({ id: "a1".padEnd(32, "0"), mediaType: "model" }), /Sign in to Sketchfab to add models.*Browsing and previews work without an account/);
    assert.deepEqual(requests, []);

    stubFetch(() => Response.json(detail("c1", NC, "by-nc")));
    const { commands } = await activate("sketchfab", { apiToken: "secret-token" });
    await assert.rejects(commands.fetch!({ id: "c1".padEnd(32, "0"), mediaType: "model" }), /under CC Attribution-NonCommercial this plugin doesn't add/);
  });

  it("downloads the GLB with the API token, and keeps who made it and its license", async () => {
    const id = "a1".padEnd(32, "0");
    const calls: { url: string; authorization: string | null }[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const address = String(url);
      calls.push({ url: address, authorization: new Headers(init?.headers).get("Authorization") });
      if (address.endsWith(`/models/${id}`)) return Response.json(detail("a1"));
      if (address.endsWith(`/models/${id}/download`)) return Response.json({ glb: { url: "https://media.sketchfab.com/signed.glb", size: GLB.length } });
      return new Response(GLB);
    }) as typeof fetch;
    const { commands, dataFolder } = await activate("sketchfab", { apiToken: " secret-token " });
    const added = await commands.fetch!({ id, mediaType: "model" });
    assert.deepEqual(added, { file: "download.glb", name: "Model a1.glb", author: "The Maker", license: "CC BY", url: `https://sketchfab.com/3d-models/model-${id}` });
    assert.deepEqual(await readFile(path.join(dataFolder, "download.glb")), GLB);
    // Only the download link is asked with the token.
    assert.deepEqual(calls.map((call) => call.authorization), [null, "Token secret-token", null]);

    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).endsWith(`/models/${id}`)) return Response.json(model("a1"));
      return Response.json({ detail: "Invalid token." }, { status: 401 });
    }) as typeof fetch;
    await assert.rejects(commands.fetch!({ id, mediaType: "model" }), /didn't accept the API token in this plugin's Settings/);
  });

  it("shows whose API token it is, and offers the token page while signed out", async () => {
    let refuse = false;
    const requests = stubFetch(() => (refuse ? Response.json({ detail: "Invalid token." }, { status: 401 }) : Response.json({ username: "maker", displayName: "The Maker" })));
    const signedOut = await activate("sketchfab");
    const none = await signedOut.commands.settingsStatus!({ locale: "en" });
    assert.match(none.message, /Not signed in\. Browsing and previews work without an account/);
    // Without OhMyGame's client ID, only the token is offered.
    assert.deepEqual(none.actions, ["open-token-page"]);
    const page = await signedOut.commands.openTokenPage!({ locale: "zh-CN" });
    assert.equal(page.link.url, "https://sketchfab.com/settings/password");
    assert.equal(page.link.title, "Sketchfab API 令牌");

    const { commands } = await activate("sketchfab", { apiToken: "secret-token" });
    const status = await commands.settingsStatus!({ locale: "en" });
    assert.equal(status.message, "Using the API token of The Maker.");
    await commands.settingsStatus!({ locale: "en" });
    assert.equal(requests.length, 1);
    // Signing out clears the token through Settings.
    const out = await commands.signOut!({ locale: "en" });
    assert.deepEqual(out.configuration, { apiToken: null });
    assert.match(out.message, /Not signed in/);

    refuse = true;
    const wrong = await activate("sketchfab", { apiToken: "wrong" });
    assert.match((await wrong.commands.settingsStatus!({ locale: "en" })).message, /didn't accept the API token/);
  });

  // A stand-in Sketchfab: its token endpoint, `/me`, a model and its download; this computer's sign-in page is asked for real.
  function sketchfabSite(options: { refuseRefresh?: boolean; refuseBearer?: string; issued?: number } = {}) {
    const calls: { url: string; authorization: string | null; body: Record<string, string> }[] = [];
    let issued = options.issued ?? 0;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const address = String(url);
      if (local(address)) return realFetch(url, init);
      const authorization = new Headers(init?.headers).get("Authorization");
      const body = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
      calls.push({ url: address, authorization, body });
      if (address === "https://sketchfab.com/oauth2/token/") {
        if (body.grant_type === "refresh_token" && options.refuseRefresh) return Response.json({ error: "invalid_grant" }, { status: 400 });
        issued += 1;
        return Response.json({ access_token: `oauth-token-${issued}`, refresh_token: `refresh-${issued}`, expires_in: 2592000, token_type: "Bearer" });
      }
      if (authorization && authorization === `Bearer ${options.refuseBearer}`) return Response.json({ detail: "Invalid token." }, { status: 401 });
      if (address.endsWith("/me")) return Response.json({ username: "maker", displayName: "The Maker" });
      if (address.endsWith("/download")) return Response.json({ glb: { url: "https://media.sketchfab.com/signed.glb", size: GLB.length } });
      if (address.includes("/models/")) return Response.json(detail("a1"));
      return new Response(GLB);
    }) as typeof fetch;
    return calls;
  }
  const callback = "http://127.0.0.1:52817/sketchfab/callback";

  it("signs in with Sketchfab through this computer as a public client, then downloads with that account", async () => {
    const id = "a1".padEnd(32, "0");
    const calls = sketchfabSite();
    const { commands, dataFolder } = await activate("sketchfab", {}, { clientId: "test-client" });
    try {
      assert.deepEqual((await commands.settingsStatus!({ locale: "en" })).actions, ["sign-in", "open-token-page"]);
      const waiting = await commands.signIn!({ locale: "en" });
      assert.deepEqual(waiting.actions, ["cancel-sign-in"]);
      const authorize = new URL(waiting.link.url);
      assert.equal(authorize.origin + authorize.pathname, "https://sketchfab.com/oauth2/authorize/");
      const params = Object.fromEntries(authorize.searchParams);
      assert.equal(params.response_type, "code");
      assert.equal(params.client_id, "test-client");
      assert.equal(params.redirect_uri, callback);

      // Another page's visit leaves the sign-in waiting.
      const stray = await fetch(`${callback}?code=stolen&state=another`);
      assert.equal(stray.status, 400);
      assert.match(stray.headers.get("Content-Security-Policy")!, /default-src 'none'/);
      assert.deepEqual((await commands.settingsStatus!({ locale: "en" })).actions, ["cancel-sign-in"]);

      const back = await fetch(`${callback}?code=the-code&state=${params.state}`);
      assert.equal(back.status, 200);
      assert.match(await back.text(), /Signed in\. You can close this tab/);
      // The code is exchanged with the client ID alone: Sketchfab sets up desktop apps without a secret.
      assert.deepEqual(calls.find((call) => call.url.endsWith("/oauth2/token/"))?.body, {
        grant_type: "authorization_code",
        code: "the-code",
        client_id: "test-client",
        redirect_uri: callback,
      });

      const signedIn = await commands.settingsStatus!({ locale: "en" });
      assert.equal(signedIn.message, "Signed in to Sketchfab as The Maker.");
      assert.match(signedIn.detail, /renews the sign-in by itself/);
      assert.deepEqual(signedIn.actions, ["sign-out"]);
      // The account is kept for this person alone, and the sign-in page is gone.
      const saved = path.join(dataFolder, "account.json");
      assert.equal((await stat(saved)).mode & 0o777, 0o600);
      assert.equal(JSON.parse(await readFile(saved, "utf8")).refreshToken, "refresh-1");
      await assert.rejects(fetch(callback));

      await commands.fetch!({ id, mediaType: "model" });
      assert.equal(calls.find((call) => call.url.endsWith("/download"))?.authorization, "Bearer oauth-token-1");

      const out = await commands.signOut!({ locale: "en" });
      assert.equal(out.configuration, undefined);
      assert.match(out.message, /Not signed in/);
      await assert.rejects(commands.fetch!({ id, mediaType: "model" }), /Sign in to Sketchfab/);
    } finally {
      await commands.cancelSignIn!({ locale: "en" });
    }
  });

  it("renews an ended sign-in with its refresh token, and forgets one Sketchfab won't renew", async () => {
    const id = "a1".padEnd(32, "0");
    const ended = { accessToken: "old-token", refreshToken: "refresh-0", expiresAt: 1, username: "maker", displayName: "The Maker" };
    let calls = sketchfabSite();
    const { commands, dataFolder } = await activate("sketchfab", {}, { clientId: "test-client" });
    const saved = path.join(dataFolder, "account.json");
    await writeFile(saved, JSON.stringify(ended));
    // Reading the status renews nothing.
    assert.equal((await commands.settingsStatus!({ locale: "en" })).message, "Signed in to Sketchfab as The Maker.");
    assert.equal(calls.length, 0);
    await commands.fetch!({ id, mediaType: "model" });
    assert.deepEqual(calls[0]!.body, { grant_type: "refresh_token", refresh_token: "refresh-0", client_id: "test-client" });
    assert.equal(calls.find((call) => call.url.endsWith("/download"))?.authorization, "Bearer oauth-token-1");
    assert.equal(JSON.parse(await readFile(saved, "utf8")).accessToken, "oauth-token-1");

    // A token Sketchfab refuses before it ends is renewed once, and the download goes on.
    calls = sketchfabSite({ refuseBearer: "oauth-token-1", issued: 1 });
    await commands.fetch!({ id, mediaType: "model" });
    assert.deepEqual(calls.filter((call) => call.url.endsWith("/download")).map((call) => call.authorization), ["Bearer oauth-token-1", "Bearer oauth-token-2"]);

    await writeFile(saved, JSON.stringify(ended));
    sketchfabSite({ refuseRefresh: true });
    await assert.rejects(commands.fetch!({ id, mediaType: "model" }), /Sign in to Sketchfab to add models/);
    await assert.rejects(stat(saved));
  });

  it("says when sign-in was refused, and cancels a waiting one", async () => {
    sketchfabSite();
    const { commands } = await activate("sketchfab", {}, { clientId: "test-client" });
    const waiting = await commands.signIn!({ locale: "zh-CN" });
    const state = new URL(waiting.link.url).searchParams.get("state");
    const refused = await fetch(`${callback}?error=access_denied&state=${state}`);
    assert.equal(refused.status, 400);
    assert.match(await refused.text(), /登录未完成/);
    assert.match((await commands.settingsStatus!({ locale: "en" })).detail, /didn't finish: you didn't allow OhMyGame/);

    await commands.signIn!({ locale: "en" });
    assert.match((await commands.cancelSignIn!({ locale: "en" })).message, /Not signed in/);
    await assert.rejects(fetch(callback));
  });
});
