import { createRequire } from "node:module";
import path from "node:path";

/** A ZIP of the given files, written by the zip library the app itself uses. */
export async function zip(files: Record<string, string | Buffer>): Promise<Buffer> {
  const yazl = createRequire(path.resolve(process.env.OHMYGAME_APP ?? "app", "package.json"))("yazl");
  const archive = new yazl.ZipFile();
  for (const [file, content] of Object.entries(files)) archive.addBuffer(Buffer.from(content), file);
  archive.end();
  const chunks: Buffer[] = [];
  for await (const chunk of archive.outputStream as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}
