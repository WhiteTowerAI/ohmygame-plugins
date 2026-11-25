// Packs a plugin folder as a release archive: a ZIP of the files `npm pack`
// would publish (the app's own `publishedFiles`), at the top of the archive,
// written by the zip library the app uses.

import { lstat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function packRelease(appRoot: string, folder: string): Promise<{ archive: Buffer; files: string[] }> {
  const { publishedFiles } = await import(pathToFileURL(path.resolve(appRoot, "src/daemon/plugin-pack.ts")).href);
  const files: string[] = await publishedFiles(folder);
  const yazl = createRequire(path.resolve(appRoot, "package.json"))("yazl");
  const zip = new yazl.ZipFile();
  // A fixed date, so packing the same files gives the same archive.
  for (const file of files) {
    const at = path.join(folder, ...file.split("/"));
    // The app keeps a file executable when its entry says so, as npm's tarballs did.
    const executable = ((await lstat(at)).mode & 0o111) !== 0;
    zip.addFile(at, file, { mtime: new Date(Date.UTC(2026, 0, 1)), mode: executable ? 0o100755 : 0o100644 });
  }
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream as AsyncIterable<Buffer>) chunks.push(chunk);
  return { archive: Buffer.concat(chunks), files };
}
