import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, expect } from "vitest";
const host = path.resolve(process.env.OHMYGAME_APP ?? "app");
const { PluginServices } = await import(
  /* @vite-ignore */ path.join(host, "src/daemon/plugin-services.ts")
);
const { matchesWhen } = await import(
  /* @vite-ignore */ path.join(host, "src/shared/plugin-when.ts")
);
it("offers TapTap management without replacing Maker or the project's engine", async () => {
  const store = await mkdtemp(path.join(tmpdir(), "ohmygame-taptap-store-"));
  const services = new PluginServices({ directory: store });
  await services.ready();
  const added = await services.index.add(path.resolve("plugins/taptap"));
  expect(added.ok).toBe(true);
  const folder = await mkdtemp(path.join(tmpdir(), "ohmygame-taptap-project-"));
  try {
    const entry = services.index.get("ohmygame/taptap")!;
    expect(entry.skills.map((skill: { name: string }) => skill.name)).toEqual([
      "taptap-h5-publish",
    ]);
    expect(entry.manifest.contributes?.projectTypes).toBeUndefined();
    expect(services.onInEveryProject(entry.id)).toBe(false);
    const maker = JSON.parse(
      await readFile(
        "plugins/taptap-maker/.ohmygame-plugin/plugin.json",
        "utf8",
      ),
    );
    expect(maker.contributes.projectTypes[0].id).toBe("maker");
    await writeFile(
      path.join(folder, "ohmygame.json"),
      JSON.stringify({ type: "general" }),
    );
    await services.setProjectPlugin(folder, entry.id, true);
    const commands = await services.commands(folder, "zh-CN");
    const open = commands.find(
      (command: { id: string }) => command.id === "ohmygame/taptap:open",
    )!;
    expect(open.title).toBe("在 TapTap 管理…");
    expect(open.run).toEqual({ openPanel: "taptap" });
    const when = open.slots[0]!.when;
    expect(matchesWhen(when, { values: { "project.type": "general" } })).toBe(
      true,
    );
    expect(
      matchesWhen(when, {
        values: { "project.type": "ohmygame/taptap-maker:maker" },
      }),
    ).toBe(false);
    expect(
      commands.find(
        (command: { id: string }) =>
          command.id === "ohmygame/taptap:release-h5",
      )?.run,
    ).toMatchObject({ skill: "taptap-h5-publish", insert: true });
  } finally {
    await services.close();
    await rm(folder, { recursive: true, force: true });
    await rm(store, { recursive: true, force: true });
  }
});
