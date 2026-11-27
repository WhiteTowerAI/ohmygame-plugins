import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach } from "vitest";

// Web builds written to a temporary folder for each test, as the app hands
// one to the scan command.

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

export async function build(files: Record<string, string | Buffer>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "launch-check-"));
  folders.push(root);
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  return root;
}

/** Bytes that don't compress, so a file's transfer size is its size. */
export const noise = (bytes: number) => Buffer.from(Array.from({ length: bytes }, (_, index) => (index * 2654435761) >>> 24));

/** What Vite writes with its default `base: "/"`. */
export const viteDefault = {
  "index.html": `<!doctype html>
<html>
  <head>
    <script type="module" crossorigin src="/assets/index-a1b2.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/vendor-c3d4.js">
    <link rel="stylesheet" crossorigin href="/assets/index-e5f6.css">
  </head>
  <body><div id="app"></div></body>
</html>`,
  "assets/index-a1b2.js": `import{P as e}from"./vendor-c3d4.js";const t=()=>import("./level-two-9f8e.js");new e({preload(){this.load.image("hero","/assets/hero-1a2b.png");this.load.audio("theme","assets/theme-77aa.mp3")}});t();`,
  "assets/vendor-c3d4.js": `export class P{constructor(o){this.o=o}}`,
  "assets/level-two-9f8e.js": `export const level={tiles:"assets/tiles-5c5c.png"};`,
  "assets/index-e5f6.css": `@font-face{font-family:Pixel;src:url(/assets/pixel-0000.woff2)}body{background:url(./bg-4444.webp)}`,
  "assets/hero-1a2b.png": noise(2000),
  "assets/theme-77aa.mp3": noise(5000),
  "assets/tiles-5c5c.png": noise(3000),
  "assets/pixel-0000.woff2": noise(1000),
  "assets/bg-4444.webp": noise(4000),
  "assets/unused-old-title.png": noise(6000),
  "assets/index-a1b2.js.map": "{}",
};
