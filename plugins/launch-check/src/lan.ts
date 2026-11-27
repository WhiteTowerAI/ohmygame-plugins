import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";

// Serves a web build to phones on the same network, so a person can play it
// on a real device by scanning a QR code. The build is served as it is, at the
// root of the address as OhMyGame Community serves it; only the page a phone
// gets has a small script added, which reports what the phone sees back here.
// Nothing in the project changes.
//
// Anyone on the network could reach the port, so everything needs the token
// the panel's address carries: the first visit sets it as a cookie.

export const ROUTE = "/__launch-check";
const COOKIE = "launch_check";
const MAX_DEVICES = 20;
const MAX_ERRORS = 30;
const MAX_BODY = 64 * 1024;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".map": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".mp4": "video/mp4", ".webm": "video/webm",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".webmanifest": "application/manifest+json",
};

/** What a phone last said, kept per device. */
export interface DeviceReport {
  id: string;
  /** When this computer last heard from it. */
  seenAt: string;
  userAgent?: string;
  viewport?: { width: number; height: number; dpr: number; orientation?: string };
  safeArea?: { top: number; right: number; bottom: number; left: number };
  secureContext?: boolean;
  touch?: boolean;
  fps?: { current: number; low: number };
  loadMs?: number;
  firstFrameMs?: number;
  audio?: string[];
  memoryMb?: number;
  errors: string[];
}

/** Interfaces a phone can't reach: containers, virtual machines and VPN tunnels. */
const VIRTUAL = /docker|^br-|veth|vmnet|vbox|virtualbox|utun|^tun|^tap|wsl|vethernet|hyper-v|zt|tailscale|wg\d/i;

/**
 * The local network address phones can reach: a home or office range first
 * (192.168, then 10, then 172.16–31), on a real adapter rather than a
 * container bridge or VPN, which often come first in the list.
 */
export function lanAddress(interfaces = networkInterfaces()): string | undefined {
  const candidates = Object.entries(interfaces).flatMap(([name, entries]) =>
    (entries ?? []).filter((entry) => entry.family === "IPv4" && !entry.internal).map((entry) => ({ name, address: entry.address })),
  );
  const rank = ({ name, address }: { name: string; address: string }) =>
    (VIRTUAL.test(name) ? 10 : 0) + (address.startsWith("192.168.") ? 0 : address.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(address) ? 2 : 3);
  return candidates.sort((a, b) => rank(a) - rank(b))[0]?.address;
}

/** The page with the report script first in its head, so it hears errors from the game's own scripts. */
export function inject(html: string): string {
  const tag = `<script src="${ROUTE}/overlay.js"></script>`;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return `${html.slice(0, head.index + head[0].length)}${tag}${html.slice(head.index + head[0].length)}`;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? `${doctype[0]}${tag}${html.slice(doctype[0].length)}` : `${tag}${html}`;
}

const text = (value: unknown, max = 300) => (typeof value === "string" ? value.slice(0, max) : undefined);
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined);

/** A report as a phone sent it, kept only in its known shape and sizes. */
export function cleanReport(value: unknown, now = new Date()): DeviceReport | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, any>;
  const id = text(raw.id, 64);
  if (!id || !/^[\w-]+$/.test(id)) return undefined;
  const report: DeviceReport = { id, seenAt: now.toISOString(), errors: [] };
  report.userAgent = text(raw.userAgent, 400);
  if (raw.viewport && typeof raw.viewport === "object") {
    const width = number(raw.viewport.width);
    const height = number(raw.viewport.height);
    const dpr = number(raw.viewport.dpr);
    if (width !== undefined && height !== undefined && dpr !== undefined) report.viewport = { width, height, dpr, orientation: text(raw.viewport.orientation, 40) };
  }
  if (raw.safeArea && typeof raw.safeArea === "object") {
    const sides = ["top", "right", "bottom", "left"].map((side) => number(raw.safeArea[side]) ?? 0);
    report.safeArea = { top: sides[0]!, right: sides[1]!, bottom: sides[2]!, left: sides[3]! };
  }
  if (typeof raw.secureContext === "boolean") report.secureContext = raw.secureContext;
  if (typeof raw.touch === "boolean") report.touch = raw.touch;
  if (raw.fps && typeof raw.fps === "object") {
    const current = number(raw.fps.current);
    const low = number(raw.fps.low);
    if (current !== undefined && low !== undefined) report.fps = { current, low };
  }
  report.loadMs = number(raw.loadMs);
  report.firstFrameMs = number(raw.firstFrameMs);
  report.memoryMb = number(raw.memoryMb);
  if (Array.isArray(raw.audio)) report.audio = raw.audio.slice(0, 10).map((state: unknown) => text(state, 20)).filter((state): state is string => Boolean(state));
  if (Array.isArray(raw.errors)) report.errors = raw.errors.slice(-MAX_ERRORS).map((error: unknown) => text(error)).filter((error): error is string => Boolean(error));
  for (const key of Object.keys(report) as (keyof DeviceReport)[]) if (report[key] === undefined) delete report[key];
  return report;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/** Streams a file; one that fails partway ends the response instead of crashing the plugin's host. */
function pipe(stream: ReturnType<typeof createReadStream>, response: ServerResponse) {
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

const cookieOf = (request: IncomingMessage) =>
  (request.headers.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);

export interface LanOptions {
  /** The build folder to serve, `index.html` at its top. */
  root: string;
  /** The report script phones run. */
  overlay: string;
  /** The address to put in the link; the server listens on every interface. */
  host: string;
  port?: number;
}

export class LanServer {
  readonly token = randomBytes(18).toString("base64url");
  #server: Server | undefined;
  #devices = new Map<string, DeviceReport>();
  #root: string;
  #options: LanOptions;
  url = "";

  constructor(options: LanOptions) {
    this.#options = options;
    this.#root = options.root;
  }

  /** The token from the address or the cookie; a game's own `?t=` cache-buster doesn't hide the cookie. */
  #allowed(request: IncomingMessage, query: URLSearchParams): boolean {
    const expected = Buffer.from(this.token);
    const matches = (given: string | null | undefined) => {
      if (!given) return false;
      const actual = Buffer.from(given);
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    };
    return matches(query.get("t")) || matches(cookieOf(request));
  }

  async start(): Promise<string> {
    this.#root = await realpath(this.#options.root);
    this.#server = createServer((request, response) => {
      this.#handle(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.#server!.once("error", reject);
      this.#server!.listen(this.#options.port ?? 0, "0.0.0.0", () => resolve());
    });
    const { port } = this.#server.address() as AddressInfo;
    this.url = `http://${this.#options.host}:${port}/?t=${this.token}`;
    return this.url;
  }

  async stop(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  get running(): boolean {
    return Boolean(this.#server?.listening);
  }

  devices(): DeviceReport[] {
    return [...this.#devices.values()].sort((a, b) => b.seenAt.localeCompare(a.seenAt));
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://phone");
    const headers = { "cache-control": "no-store" };
    if (!this.#allowed(request, url.searchParams)) {
      response.writeHead(403, { ...headers, "content-type": "text/plain; charset=utf-8" });
      response.end("Open this game from the address in OhMyGame's Launch check panel.");
      return;
    }
    // The first visit carries the token in its address; later requests, the game's own, carry the cookie.
    const cookie = `${COOKIE}=${this.token}; Path=/; SameSite=Lax; HttpOnly`;
    if (url.pathname === `${ROUTE}/overlay.js`) {
      response.writeHead(200, { ...headers, "content-type": TYPES[".js"]! });
      response.end(this.#options.overlay);
      return;
    }
    if (url.pathname === `${ROUTE}/report`) {
      if (request.method !== "POST") {
        response.writeHead(405, headers);
        response.end();
        return;
      }
      let report: DeviceReport | undefined;
      try {
        report = cleanReport(JSON.parse(await readBody(request)));
      } catch {
        report = undefined;
      }
      if (!report) {
        response.writeHead(400, headers);
        response.end();
        return;
      }
      if (this.#devices.has(report.id) || this.#devices.size < MAX_DEVICES) this.#devices.set(report.id, report);
      response.writeHead(204, headers);
      response.end();
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, headers);
      response.end();
      return;
    }
    let relative: string;
    try {
      relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    } catch {
      response.writeHead(400, headers);
      response.end();
      return;
    }
    if (!relative || relative.endsWith("/")) relative += "index.html";
    const file = await this.#resolve(relative);
    if (!file) {
      response.writeHead(404, headers);
      response.end();
      return;
    }
    const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    if (path.basename(file).toLowerCase() === "index.html" && path.dirname(file) === this.#root) {
      const html = inject(await readFile(file, "utf8"));
      response.writeHead(200, { ...headers, "content-type": type, "set-cookie": cookie });
      response.end(request.method === "HEAD" ? undefined : html);
      return;
    }
    const { size } = await stat(file);
    // Safari plays audio and video only from servers that answer ranges.
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        response.writeHead(416, { ...headers, "content-range": `bytes */${size}` });
        response.end();
        return;
      }
      response.writeHead(206, { ...headers, "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
      if (request.method === "HEAD") response.end();
      else pipe(createReadStream(file, { start, end }), response);
      return;
    }
    response.writeHead(200, { ...headers, "content-type": type, "accept-ranges": "bytes", "content-length": size });
    if (request.method === "HEAD") response.end();
    else pipe(createReadStream(file), response);
  }

  /** A file inside the build, never one a link or `..` leads out to. */
  async #resolve(relative: string): Promise<string | undefined> {
    const candidate = path.resolve(this.#root, relative);
    if (candidate !== this.#root && !candidate.startsWith(this.#root + path.sep)) return undefined;
    try {
      const real = await realpath(candidate);
      if (!real.startsWith(this.#root + path.sep)) return undefined;
      return (await stat(real)).isFile() ? real : undefined;
    } catch {
      return undefined;
    }
  }
}
