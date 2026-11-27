import { describe, expect, it } from "vitest";
// @ts-expect-error The panel's helpers are plain JavaScript.
import { describeValue, findingGroups, fixPrompt, formatBytes } from "../../plugins/launch-check/panel/format.js";
import { report } from "../../plugins/launch-check/src/profiles.ts";
import { scanBuild } from "../../plugins/launch-check/src/scan.ts";
import { build, viteDefault } from "./fixtures.ts";

const TITLES = { ohmygame: "OhMyGame Community", itch: "itch.io", crazygames: "CrazyGames", "youtube-playables": "YouTube Playables", poki: "Poki" };

describe("the panel's helpers", () => {
  it("writes sizes in decimal units", () => {
    expect([999, 1500, 25_000, 2_345_678, 51_000_000, 1_200_000_000].map(formatBytes)).toEqual(["999 B", "1.5 KB", "25 KB", "2.35 MB", "51.0 MB", "1.20 GB"]);
  });

  it("shows a check's value, range and limit", () => {
    expect(describeValue({ check: "initial", value: 30_000_000, upper: 55_000_000, as: "50 MB" })).toBe("30.0 MB – 55.0 MB / 50 MB");
    expect(describeValue({ check: "files", value: 1200, as: "1,000" })).toBe("1,200 / 1,000");
    expect(describeValue({ check: "relativePaths", count: 3 })).toBe("3");
  });

  it("asks the AI, in English, to fix what fails on the platforms the person picked", async () => {
    const result = report(await scanBuild(await build(viteDefault)));
    expect(findingGroups(result.scan).map((group: { kind: string }) => group.kind)).toEqual(["absolute-path", "unreferenced", "source-map"]);

    const prompt = fixPrompt(result, ["itch"], TITLES)!;
    expect(prompt).toContain("for itch.io.");
    expect(prompt).toContain("- itch.io: relative paths only 5");
    expect(prompt).not.toContain("CrazyGames");
    expect(prompt).toContain('Paths that start with "/"');
    expect(prompt).toContain("index.html: /assets/index-a1b2.js");
    expect(prompt).toContain("assets/unused-old-title.png");
    expect(prompt).toMatch(/^[\x20-\x7E\n–]+$/);
  });

  it("asks for nothing when nothing is wrong", () => {
    const clean = {
      scan: { findings: [], omitted: {} },
      profiles: [{ id: "itch", status: "pass", checks: [{ check: "files", status: "pass", level: "required", value: 3, max: 1000 }] }],
    };
    expect(fixPrompt(clean, ["itch"], TITLES)).toBeUndefined();
  });
});
