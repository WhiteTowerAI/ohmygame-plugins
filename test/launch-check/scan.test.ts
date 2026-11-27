import { describe, expect, it } from "vitest";
import { builtNames, cssRefs, htmlRefs, resolveRef, scanBuild } from "../../plugins/launch-check/src/scan.ts";
import { build, noise, viteDefault } from "./fixtures.ts";

const kinds = (scan: Awaited<ReturnType<typeof scanBuild>>, kind: string) =>
  scan.findings.filter((finding) => finding.kind === kind).map((finding) => `${finding.file} → ${finding.target}`);

describe("reading references", () => {
  it("resolves relative, absolute, external and package references", () => {
    expect(resolveRef("assets/a.js", "./b.js", { code: true })).toEqual({ type: "local", path: "assets/b.js", absolute: false });
    expect(resolveRef("assets/a.css", "../img/x.png?v=2#y")).toEqual({ type: "local", path: "img/x.png", absolute: false });
    expect(resolveRef("index.html", "/assets/a.js")).toEqual({ type: "local", path: "assets/a.js", absolute: true });
    expect(resolveRef("index.html", "assets/my%20file.png")).toEqual({ type: "local", path: "assets/my file.png", absolute: false });
    expect(resolveRef("index.html", "//cdn.jsdelivr.net/x.js")).toMatchObject({ type: "external", host: "cdn.jsdelivr.net", secure: true });
    expect(resolveRef("index.html", "http://example.com/x.js")).toMatchObject({ type: "external", secure: false });
    expect(resolveRef("a.js", "phaser", { code: true })).toEqual({ type: "bare", name: "phaser" });
    expect(resolveRef("index.html", "../../etc/passwd")).toEqual({ type: "outside" });
    for (const ignored of ["data:image/png;base64,AA", "blob:x", "#top", "mailto:a@b.c", ""]) expect(resolveRef("index.html", ignored).type).toBe("ignored");
  });

  it("reads what a page loads, connects to and runs inline", () => {
    const refs = htmlRefs(`<!-- <script src="old.js"></script> -->
      <link rel="preconnect" href="https://fonts.gstatic.com"><link rel=stylesheet href='a.css'>
      <link rel="canonical" href="https://example.com/"><link rel="icon" href="favicon.png">
      <script type="module">import "./main.js";</script><script src="lib.js" defer></script>
      <img src="logo.png" srcset="logo@2x.png 2x, logo@3x.png 3x"><style>body{background:url(bg.png)}</style>`);
    expect(refs.loads).toEqual([
      { ref: "lib.js", kind: "script" },
      { ref: "a.css", kind: "style" },
      { ref: "favicon.png", kind: "asset" },
      { ref: "logo.png", kind: "asset" },
      { ref: "logo@2x.png", kind: "asset" },
      { ref: "logo@3x.png", kind: "asset" },
    ]);
    expect(refs.connects).toEqual(["https://fonts.gstatic.com"]);
    expect(refs.inlineScripts).toEqual(['import "./main.js";']);
    expect(refs.inlineStyles).toEqual(["body{background:url(bg.png)}"]);
  });

  it("reads a style sheet's imports and urls, not its comments", () => {
    expect(cssRefs(`/* url(no.png) */ @import "base.css"; @import url('theme.css'); a{b:url( "x.png" ) url(y.svg#i)}`)).toEqual([
      "base.css",
      "theme.css",
      "x.png",
      "y.svg#i",
    ]);
  });
});

describe("scanning a web build", () => {
  it("splits Vite's default build into what loads first, later and never", async () => {
    const scan = await scanBuild(await build(viteDefault));
    expect(scan.hasIndex).toBe(true);
    expect(scan.files).toBe(12);
    expect(scan.entry.files).toEqual([
      "assets/bg-4444.webp",
      "assets/index-a1b2.js",
      "assets/index-e5f6.css",
      "assets/pixel-0000.woff2",
      "assets/vendor-c3d4.js",
      "index.html",
    ]);
    expect(scan.named.files).toEqual(["assets/hero-1a2b.png", "assets/theme-77aa.mp3"]);
    expect(scan.lazy.files).toEqual(["assets/level-two-9f8e.js", "assets/tiles-5c5c.png"]);
    expect(scan.unreferenced.files).toEqual(["assets/unused-old-title.png"]);
    expect(kinds(scan, "source-map")).toEqual(["assets/index-a1b2.js.map → assets/index-a1b2.js.map"]);
    // Vite's base "/" makes every path absolute, in the page, the styles and the code.
    expect(kinds(scan, "absolute-path")).toEqual([
      "index.html → /assets/index-a1b2.js",
      "index.html → /assets/vendor-c3d4.js",
      "index.html → /assets/index-e5f6.css",
      "assets/index-a1b2.js → /assets/hero-1a2b.png",
      "assets/index-e5f6.css → /assets/pixel-0000.woff2",
    ]);
    expect(scan.largest[0]).toEqual({ path: "assets/unused-old-title.png", bytes: 6000 });
    // Media counts as it is; text as a host compresses it.
    expect(scan.entry.transfer).toBeLessThan(scan.entry.bytes);
    expect(scan.named.transfer).toBe(7000);
  });

  it("finds nothing to fix in a relative build", async () => {
    const scan = await scanBuild(
      await build({
        "index.html": `<script type="module" src="./assets/main.js"></script>`,
        "assets/main.js": `import "./util.js"; fetch("data/level.json");`,
        "assets/util.js": `export {}`,
        "data/level.json": `{"tiles":"img/tiles.png"}`,
        "img/tiles.png": noise(100),
      }),
    );
    expect(scan.findings).toEqual([]);
    expect(scan.named.files).toEqual(["data/level.json", "img/tiles.png"]);
  });

  it("finds fonts and libraries from other sites, and plain http", async () => {
    const scan = await scanBuild(
      await build({
        "index.html": `<link rel="preconnect" href="https://fonts.gstatic.com">
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P">
          <script src="http://example.com/sdk.js"></script><script src="main.js"></script>`,
        "main.js": `const lib = "https://cdn.jsdelivr.net/npm/howler@2/dist/howler.min.js"; // see https://example.org/docs`,
      }),
    );
    expect(scan.externalHosts).toEqual(["cdn.jsdelivr.net", "example.com", "fonts.googleapis.com", "fonts.gstatic.com"]);
    expect(kinds(scan, "insecure-request")).toEqual(["index.html → http://example.com/sdk.js"]);
    expect(kinds(scan, "external-request")).toEqual([
      "index.html → https://fonts.googleapis.com/css2?family=Press+Start+2P",
      "index.html → https://fonts.gstatic.com",
      "main.js → cdn.jsdelivr.net",
    ]);
  });

  it("finds missing files, capitals that differ and package imports", async () => {
    const scan = await scanBuild(
      await build({
        "index.html": `<script type="module" src="Main.js"></script><img src="gone.png"><script type="module">import "phaser";</script>`,
        "main.js": `import "./missing.js";`,
      }),
    );
    expect(kinds(scan, "case-mismatch")).toEqual(["index.html → Main.js → main.js"]);
    expect(kinds(scan, "missing-file")).toEqual(["index.html → gone.png"]);
    expect(kinds(scan, "bare-import")).toEqual(["index.html → phaser"]);
  });

  it("counts files a game names without the extension, or builds from a template or a joined string", async () => {
    const scan = await scanBuild(
      await build({
        "index.html": `<script src="game.js"></script>`,
        "game.js": [
          `this.load.image("goblin");`,
          `for (let n = 1; n < 3; n++) this.load.image("enemy-" + n + ".png");`,
          "this.load.audio(`sfx/hit-${n}.wav`);",
          // Too little fixed text to name anything: it mustn't make every file look used.
          "fetch(`${dir}/${file}`); const a = \"x\" + y;",
        ].join("\n"),
        "goblin.png": noise(10),
        "enemy-1.png": noise(10),
        "sfx/hit-2.wav": noise(10),
        "sfx/old-theme.wav": noise(10),
        "title.png": noise(10),
      }),
    );
    expect(scan.named.files).toEqual(["enemy-1.png", "goblin.png", "sfx/hit-2.wav"]);
    // A name built from nothing fixed can't be read without running the game; the panel says so.
    expect(scan.unreferenced.files).toEqual(["sfx/old-theme.wav", "title.png"]);
  });

  it("reads built names from templates and joined strings", () => {
    const { patterns, prefixes } = builtNames("a(`assets/enemy-${i}.png`); b(`${base}ui/btn-${n}`); c(`${a}/${b}.png`); d('level-' + n); e('.png' + x)");
    expect(patterns.map(String)).toEqual([String(/(?:^|\/)assets\/enemy-[^/]*\.png$/), String(/(?:^|\/)[^/]*ui\/btn-[^/]*$/)]);
    expect(prefixes).toEqual(["level-"]);
  });

  it("says a build without index.html can't be played, and keeps at most 50 findings of a kind", async () => {
    const files: Record<string, string> = { "game/index.htm": "" };
    for (let index = 0; index < 60; index += 1) files[`unused-${index}.png`] = "x";
    const scan = await scanBuild(await build(files));
    expect(scan.hasIndex).toBe(false);
    expect(kinds(scan, "unreferenced")).toHaveLength(50);
    // 60 images and the page in a subfolder, which nothing names either.
    expect(scan.omitted).toEqual({ unreferenced: 11 });
  });

  it("measures the longest path", async () => {
    const deep = `${"a".repeat(120)}/${"b".repeat(120)}.json`;
    const scan = await scanBuild(await build({ "index.html": "", [deep]: "{}" }));
    expect(scan.longestPath).toEqual({ path: deep, length: 246 });
  });
});
