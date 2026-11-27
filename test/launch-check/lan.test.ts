import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activate, LAN_PREFIX, NO_NETWORK } from "../../plugins/launch-check/src/index.ts";
import { cleanReport, inject, LanServer, lanAddress, ROUTE } from "../../plugins/launch-check/src/lan.ts";
import { build, noise, viteDefault } from "./fixtures.ts";

const servers: LanServer[] = [];
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function serve(files: Record<string, string | Buffer> = viteDefault) {
  const server = new LanServer({ root: await build(files), overlay: "/* overlay */", host: "127.0.0.1" });
  servers.push(server);
  const url = await server.start();
  const base = new URL(url);
  const cookie = `launch_check=${server.token}`;
  const get = (pathname: string, init: RequestInit = {}) => fetch(new URL(pathname, base), { ...init, headers: { cookie, ...(init.headers ?? {}) } });
  return { server, url, base, get };
}

describe("serving a build to phones", () => {
  it("picks a private network address, and none without a network", () => {
    const entry = (address: string, internal = false) => ({ address, family: "IPv4", internal, netmask: "", mac: "", cidr: null });
    expect(lanAddress({ lo: [entry("127.0.0.1", true)], eth: [entry("203.0.113.5"), entry("192.168.1.20")] } as never)).toBe("192.168.1.20");
    expect(lanAddress({ lo: [entry("127.0.0.1", true)] } as never)).toBeUndefined();
    // A container bridge or VPN often comes first; phones can't reach it.
    expect(lanAddress({ docker0: [entry("172.17.0.1")], utun3: [entry("10.8.0.2")], en0: [entry("192.168.1.20")] } as never)).toBe("192.168.1.20");
    expect(lanAddress({ docker0: [entry("172.17.0.1")], wlan0: [entry("10.0.0.7")] } as never)).toBe("10.0.0.7");
  });

  it("puts the report script first in the page's head", () => {
    expect(inject('<!doctype html><html><head lang="en"><script src="a.js"></script></head>')).toBe(
      `<!doctype html><html><head lang="en"><script src="${ROUTE}/overlay.js"></script><script src="a.js"></script></head>`,
    );
    expect(inject("<!DOCTYPE html><body>x</body>")).toBe(`<!DOCTYPE html><script src="${ROUTE}/overlay.js"></script><body>x</body>`);
  });

  it("serves the page with the token, sets it as a cookie, and refuses without it", async () => {
    const { url, base } = await serve();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?t=[\w-]{24}$/);
    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(page.headers.get("set-cookie")).toMatch(/^launch_check=[\w-]+; Path=\/; SameSite=Lax; HttpOnly$/);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(await page.text()).toContain(`<head><script src="${ROUTE}/overlay.js"></script>\n    <meta name="viewport"`);
    expect((await fetch(new URL("/", base))).status).toBe(403);
    expect((await fetch(new URL("/?t=wrong", base))).status).toBe(403);
  });

  it("serves the game's files as they are, at the root, absolute paths included", async () => {
    const { get } = await serve();
    const script = await get("/assets/index-a1b2.js");
    expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(await script.text()).toBe(viteDefault["assets/index-a1b2.js"]);
    expect((await get("/assets/missing.png")).status).toBe(404);
    // A game's own cache-buster named t doesn't hide the cookie.
    expect((await get("/assets/hero-1a2b.png?t=1690000")).status).toBe(200);
    expect((await get("/assets/index-a1b2.js", { method: "POST" })).status).toBe(405);
  });

  it("answers byte ranges, as Safari asks for audio", async () => {
    const { get } = await serve({ "index.html": "", "theme.mp3": noise(1000) });
    const part = await get("/theme.mp3", { headers: { range: "bytes=10-19" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 10-19/1000");
    expect((await part.arrayBuffer()).byteLength).toBe(10);
    const tail = await get("/theme.mp3", { headers: { range: "bytes=-100" } });
    expect(tail.headers.get("content-range")).toBe("bytes 900-999/1000");
    expect((await get("/theme.mp3", { headers: { range: "bytes=5000-" } })).status).toBe(416);
  });

  it("never serves a file outside the build", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "launch-outside-"));
    folders.push(outside);
    await writeFile(path.join(outside, "secret.txt"), "secret");
    const root = await build({ "index.html": "" });
    await symlink(path.join(outside, "secret.txt"), path.join(root, "link.txt"));
    const server = new LanServer({ root, overlay: "", host: "127.0.0.1" });
    servers.push(server);
    const base = new URL(await server.start());
    const get = (pathname: string) => fetch(new URL(pathname, base), { headers: { cookie: `launch_check=${server.token}` } });
    expect((await get("/link.txt")).status).toBe(404);
    expect((await get("/..%2f..%2fetc%2fpasswd")).status).toBe(404);
  });

  it("keeps what each phone reports, cleaned, and refuses anything else", async () => {
    const { server, get } = await serve();
    const send = (body: unknown) => get(`${ROUTE}/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await send({ id: "phone1", userAgent: "iPhone", fps: { current: 58, low: 31 }, errors: ["a", 3, "b"], extra: "dropped" })).status).toBe(204);
    expect((await send({ id: "../bad" })).status).toBe(400);
    expect((await get(`${ROUTE}/report`, { method: "POST", body: "not json" })).status).toBe(400);
    const [device] = server.devices();
    expect(device).toMatchObject({ id: "phone1", userAgent: "iPhone", fps: { current: 58, low: 31 }, errors: ["a", "b"] });
    expect(device).not.toHaveProperty("extra");
    expect((await get(`${ROUTE}/overlay.js`)).status).toBe(200);
  });

  it("cleans reports to their known shape and sizes", () => {
    const report = cleanReport({ id: "x1", errors: Array.from({ length: 40 }, (_, index) => `e${index}`), audio: ["running", 1], viewport: { width: 390, height: 844, dpr: 3 } }, new Date("2026-11-27T00:00:00Z"))!;
    expect(report.errors).toHaveLength(30);
    expect(report.errors[0]).toBe("e10");
    expect(report.audio).toEqual(["running"]);
    expect(report.seenAt).toBe("2026-11-27T00:00:00.000Z");
    expect(cleanReport(null)).toBeUndefined();
  });

  it("stops listening when stopped", async () => {
    const { server, url } = await serve();
    await server.stop();
    expect(server.running).toBe(false);
    await expect(fetch(url)).rejects.toThrow();
  });
});

describe("the lan commands", () => {
  type Handler = (input: unknown, call: unknown) => unknown;
  async function plugin(host: string | null = "127.0.0.1") {
    const commands = new Map<string, Handler>();
    const dataFolder = await mkdtemp(path.join(tmpdir(), "launch-data-"));
    folders.push(dataFolder);
    activate(
      { project: { folder: "/projects/one" }, dataFolder, registerCommand: (name: string, handler: Handler) => (commands.set(name, handler), { dispose() {} }), onDispose() {} } as never,
      { host: () => host ?? undefined },
    );
    return (name: string, call: Record<string, unknown> = {}) => commands.get(name)!(undefined, { signal: new AbortController().signal, progress() {}, ...call }) as Promise<any>;
  }

  it("serves until stopped, says the address in its progress, and reports the phones", async () => {
    const run = await plugin();
    const progress = vi.fn();
    const served = run("lan", { build: { folder: await build(viteDefault) }, progress });
    await vi.waitFor(() => expect(progress).toHaveBeenCalled());
    const message: string = progress.mock.calls[0]![0];
    expect(message.startsWith(LAN_PREFIX)).toBe(true);
    const url = message.slice(LAN_PREFIX.length);
    const status = await run("lanStatus");
    expect(status).toMatchObject({ running: true, url, devices: [] });
    const page = await (await fetch(url)).text();
    expect(page).toContain(`${ROUTE}/overlay.js`);
    const overlay = await (await fetch(new URL(`${ROUTE}/overlay.js?t=${new URL(url).searchParams.get("t")}`, url))).text();
    expect(overlay).toBe(await readFile(path.resolve("plugins/launch-check/overlay/overlay.js"), "utf8"));
    await run("lanStop");
    expect(await served).toEqual({ devices: [] });
    expect((await run("lanStatus")).running).toBe(false);
    await expect(fetch(url)).rejects.toThrow();
  });

  it("stops when its call is cancelled", async () => {
    const run = await plugin();
    const controller = new AbortController();
    const progress = vi.fn();
    const served = run("lan", { build: { folder: await build(viteDefault) }, progress, signal: controller.signal });
    await vi.waitFor(() => expect(progress).toHaveBeenCalled());
    controller.abort();
    await served;
    expect((await run("lanStatus")).running).toBe(false);
  });

  it("says why it can't serve: no build, or no network", async () => {
    await expect((await plugin())("lan")).rejects.toThrow(/couldn't build the game/);
    await expect((await plugin(null))("lan", { build: { folder: await build(viteDefault) } })).rejects.toThrow(NO_NETWORK);
  });
});
