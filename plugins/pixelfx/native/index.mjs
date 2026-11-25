// Pixel Effects' native code: a tool that renders and checks an effect
// without the panel, and the Library tab of built-in effects.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BUILTINS,
  checkLoaded,
  EXPORT_DIR,
  fileName,
  findEffect,
  renderSheet,
  renderThumbnail,
  searchBuiltins,
  sheetConfig,
  SOURCE_URL,
} from "./render.mjs";

const PAGE_SIZE = 30;
const AUTHOR = "pixelfx (Patch, Hugo Duprez)";
const LICENSE = "MIT";

export function activate(context) {
  const folder = context.project?.folder;
  const thumbnails = new Map();

  if (folder) {
    context.registerTool("render_effect", async ({ effect, source, flip, seed }) => {
      const found = await findEffect(effect, source, folder);
      const check = checkLoaded(found);
      const result = { effect, source: found.source, ...(found.path ? { path: found.path } : {}), check };
      if (!found.fx || !check.ok) return { ...result, rendered: false };
      const sheet = renderSheet(found.fx, sheetConfig(found.fx, { flip, seed }));
      const name = fileName(found.fx);
      await mkdir(path.join(folder, EXPORT_DIR), { recursive: true });
      await writeFile(path.join(folder, EXPORT_DIR, `${name}.png`), sheet.png);
      await writeFile(path.join(folder, EXPORT_DIR, `${name}.json`), `${JSON.stringify(sheet.json, null, 2)}\n`);
      return {
        ...result,
        rendered: true,
        saved: [`${EXPORT_DIR}/${name}.png`, `${EXPORT_DIR}/${name}.json`],
        frames: sheet.frames,
        columns: sheet.columns,
        rows: sheet.rows,
        size: [sheet.width, sheet.height],
      };
    });
  }

  context.registerCommand("searchEffects", async ({ query, cursor }) => {
    const found = searchBuiltins(query);
    const start = /^\d+$/.test(String(cursor ?? "")) ? Number(cursor) : 0;
    const page = found.slice(start, start + PAGE_SIZE);
    return {
      items: page.map((fx) => {
        if (!thumbnails.has(fx.id)) thumbnails.set(fx.id, renderThumbnail(fx));
        const thumbnail = thumbnails.get(fx.id);
        return {
          id: fx.id,
          name: fx.meta.name,
          mediaType: "image",
          ...(thumbnail ? { thumbnail: `data:image/png;base64,${thumbnail.png.toString("base64")}` } : {}),
          author: AUTHOR,
          license: LICENSE,
          url: SOURCE_URL,
        };
      }),
      ...(start + PAGE_SIZE < found.length ? { next: String(start + PAGE_SIZE) } : {}),
    };
  });

  context.registerCommand("fetchEffect", async ({ id }) => {
    const fx = BUILTINS.find((item) => item.id === id);
    if (!fx) throw new Error(`${id} isn't a built-in effect`);
    // Adds run one at a time, so every sheet can be saved under one name.
    await writeFile(path.join(context.dataFolder, "sheet.png"), renderSheet(fx).png);
    return { file: "sheet.png", name: `${fileName(fx)}.png` };
  });
}
