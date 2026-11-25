// Packs one official plugin for its GitHub release.
//
//   tsx src/pack-release.ts <plugin folder> <out.zip> [--app DIR]

import { writeFile } from "node:fs/promises";
import { packRelease } from "./pack.ts";

const [folder, out, flag, appRoot] = process.argv.slice(2);
if (!folder || !out || (flag !== undefined && flag !== "--app")) throw new Error("Usage: pack-release.ts <plugin folder> <out.zip> [--app DIR]");
const { archive } = await packRelease(appRoot ?? "app", folder);
await writeFile(out, archive);
