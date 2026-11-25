// The New map dialog: a Tiled map with a Ground tile layer, an Objects
// layer and an embedded tileset cut from a PNG in the project.
import * as tmj from "./tmj.js";
import { h } from "./dom.js";

let dialog;

/**
 * Shows the New map dialog. `files` are the project's files, for the next
 * free name and the PNGs to cut a tileset from; `created(path)` opens the
 * map once it is written.
 */
export function showNewMapDialog({ host, t, files: entries, created }) {
  const files = new Set(entries.map((entry) => entry.path));
  let n = 1;
  while (files.has(`levels/level-${n}.tmj`)) n++;
  const pngs = entries.filter((entry) => /\.png$/i.test(entry.path)).map((entry) => entry.path).sort((a, b) => a.localeCompare(b));
  const d = t.dialog;
  const field = (label, value, attributes = {}) => h("omg-input", { label, value, ...attributes });
  const fields = {
    file: field(d.file, `levels/level-${n}.tmj`, { hint: d.fileHint }),
    columns: field(d.columns, "30", { type: "number", min: "1", max: "4096", step: "1" }),
    rows: field(d.rows, "20", { type: "number", min: "1", max: "4096", step: "1" }),
    tileWidth: field(d.tileWidth, "16", { type: "number", min: "1", max: "4096", step: "1" }),
    tileHeight: field(d.tileHeight, "16", { type: "number", min: "1", max: "4096", step: "1" }),
    image: h(
      pngs.length > 12 ? "omg-combobox" : "omg-select",
      { label: d.tilesetImage, hint: d.tilesetHint, value: pngs.find((path) => /tile/i.test(tmj.basename(path))) ?? pngs[0] ?? "", placeholder: d.search, "empty-label": d.noImages },
      h("option", { value: "" }, d.noImage),
      pngs.map((path) => h("option", { value: path }, path)),
    ),
  };
  const create = h("omg-button", { variant: "primary", on: { click: () => void createMap({ host, t, fields, files, button: create, created }) } }, d.create);
  dialog?.remove();
  dialog = h(
    "omg-dialog",
    { heading: d.heading, description: d.description, "close-label": d.cancel },
    h("div", { class: "dialog-fields" }, fields.file, h("div", { class: "field-grid" }, fields.columns, fields.rows, fields.tileWidth, fields.tileHeight), fields.image),
    h("omg-button", { slot: "footer", variant: "ghost", on: { click: () => (dialog.open = false) } }, d.cancel),
    h("span", { slot: "footer" }, create),
  );
  document.body.append(dialog);
  dialog.open = true;
  requestAnimationFrame(() => fields.file.focus?.());
}

async function createMap({ host, t, fields, files, button, created }) {
  const d = t.dialog;
  for (const element of Object.values(fields)) element.removeAttribute("error");
  const path = fields.file.value.trim().replace(/^\.?\/+/, "").replaceAll("\\", "/");
  let valid = true;
  if (!/\.(?:tmj|json)$/i.test(path) || path.split("/").some((part) => !part || part === ".." || part.startsWith("."))) {
    fields.file.setAttribute("error", d.badName);
    valid = false;
  } else if (files.has(path)) {
    fields.file.setAttribute("error", d.exists);
    valid = false;
  }
  const numbers = {};
  for (const key of ["columns", "rows", "tileWidth", "tileHeight"]) {
    const value = Number(fields[key].value);
    if (!Number.isInteger(value) || value < 1 || value > 4096) {
      fields[key].setAttribute("error", d.badNumber);
      valid = false;
    }
    numbers[key] = value;
  }
  if (!valid) return;
  button.busy = true;
  try {
    let tileset;
    const imagePath = fields.image.value;
    if (imagePath) {
      let picture;
      try {
        const url = await host.files.url(imagePath);
        picture = new Image();
        picture.src = url;
        await picture.decode();
      } catch {
        fields.image.setAttribute("error", d.imageFailed);
        return;
      }
      if (picture.naturalWidth < numbers.tileWidth || picture.naturalHeight < numbers.tileHeight) {
        fields.image.setAttribute("error", d.imageTooSmall);
        return;
      }
      tileset = {
        name: tmj.basename(imagePath).replace(/\.[^.]+$/, ""),
        image: tmj.relativePath(path, imagePath),
        imagewidth: picture.naturalWidth,
        imageheight: picture.naturalHeight,
      };
    }
    // Something may have been written there since the dialog opened.
    try {
      await host.files.text(path);
      fields.file.setAttribute("error", d.exists);
      return;
    } catch {
      // Free.
    }
    const doc = tmj.createMap({ width: numbers.columns, height: numbers.rows, tilewidth: numbers.tileWidth, tileheight: numbers.tileHeight, tileset });
    await host.files.write(path, tmj.formatJson(doc, tmj.newMapStyle(doc)));
    dialog.open = false;
    await created(path);
  } catch (error) {
    fields.file.setAttribute("error", error instanceof Error ? error.message : String(error));
  } finally {
    button.busy = false;
  }
}
