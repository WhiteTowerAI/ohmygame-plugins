// The tileset palette: one tileset's tiles on a canvas, where a click picks a
// tile and a drag picks a rectangle of them as a stamp.
import { stampOf } from "./tmj.js";
import { drawTile } from "./render.js";

/** Collection tiles are shown in cells this many CSS pixels wide. */
const COLLECTION_CELL = 44;

export class Palette {
  /** `onPick(stamp)` hears each pick; `theme()` gives the colours to draw with. */
  constructor({ onPick, theme }) {
    this.onPick = onPick;
    this.theme = theme;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "palette-canvas";
    this.scroller = document.createElement("div");
    this.scroller.className = "palette-scroll";
    this.scroller.append(this.canvas);
    this.tileset = undefined;
    this.selection = undefined;
    this.hover = undefined;
    this.drag = undefined;
    this.canvas.addEventListener("pointerdown", (event) => this.#down(event));
    this.canvas.addEventListener("pointermove", (event) => this.#move(event));
    this.canvas.addEventListener("pointerup", (event) => this.#up(event));
    this.canvas.addEventListener("pointerleave", () => {
      this.hover = undefined;
      this.draw();
    });
    new ResizeObserver(() => this.draw()).observe(this.scroller);
  }

  /** Shows a runtime tileset (see main.js `loadTilesets`), keeping the selection if it is the same one. */
  show(tileset) {
    const key = (item) => item && `${item.firstgid}:${item.base}:${item.ids.length}`;
    if (key(tileset) !== key(this.tileset)) this.selection = undefined;
    this.tileset = tileset;
    this.draw();
  }

  /** Marks the tile `gid` if it is in this tileset, as when the eyedropper picks it. */
  mark(gid) {
    const tileset = this.tileset;
    this.selection = undefined;
    if (tileset) {
      const at = this.#cellOf(gid - tileset.firstgid);
      if (at) this.selection = { c0: at[0], r0: at[1], c1: at[0], r1: at[1] };
    }
    this.draw();
  }

  clear() {
    this.selection = undefined;
    this.draw();
  }

  /** How the palette lays out its tileset: columns, rows and cell size in CSS pixels. */
  #layout() {
    const tileset = this.tileset;
    const available = Math.max(80, this.scroller.clientWidth - 2);
    if (!tileset) return undefined;
    if (tileset.atlas) {
      const columns = Math.max(1, tileset.columns);
      const rows = Math.ceil(tileset.ids.length / columns);
      let scale = available / (columns * tileset.tilewidth);
      scale = scale >= 1 ? Math.min(Math.floor(scale), 3) : Math.max(scale, 12 / tileset.tilewidth);
      return { columns, rows, cw: tileset.tilewidth * scale, ch: tileset.tileheight * scale };
    }
    const columns = Math.max(1, Math.floor(available / COLLECTION_CELL));
    return { columns, rows: Math.ceil(tileset.ids.length / columns), cw: COLLECTION_CELL, ch: COLLECTION_CELL };
  }

  #cellOf(id) {
    const tileset = this.tileset;
    const layout = this.#layout();
    if (!layout) return undefined;
    const index = tileset.atlas ? id : tileset.ids.indexOf(id);
    if (index < 0 || index >= (tileset.atlas ? tileset.ids.length : Infinity)) return undefined;
    return [index % layout.columns, Math.floor(index / layout.columns)];
  }

  #idAt(column, row, layout) {
    const index = row * layout.columns + column;
    if (column < 0 || row < 0 || column >= layout.columns || index >= this.tileset.ids.length) return undefined;
    return this.tileset.ids[index];
  }

  draw() {
    const tileset = this.tileset;
    const layout = this.#layout();
    const dpr = window.devicePixelRatio || 1;
    const canvas = this.canvas;
    if (!tileset || !layout) {
      canvas.width = canvas.height = 0;
      return;
    }
    const width = Math.ceil(layout.columns * layout.cw);
    const height = Math.max(1, Math.ceil(layout.rows * layout.ch));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = !tileset.atlas;
    const theme = this.theme();
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    tileset.ids.forEach((id, index) => {
      const tile = tileset.tile(id);
      if (!tile) return;
      const column = index % layout.columns;
      const row = Math.floor(index / layout.columns);
      let x = column * layout.cw;
      let y = row * layout.ch;
      let w = layout.cw;
      let h = layout.ch;
      if (!tileset.atlas) {
        // Fit each image in its cell, keeping its shape.
        const fit = Math.min((layout.cw - 4) / tile.width, (layout.ch - 4) / tile.height, 4);
        w = tile.width * fit;
        h = tile.height * fit;
        x += (layout.cw - w) / 2;
        y += (layout.ch - h) / 2;
      }
      drawTile(ctx, tile, 0, x * dpr, y * dpr, (x + w) * dpr, (y + h) * dpr);
    });
    const outline = (rect, color, chosen) => {
      const x0 = Math.round(Math.min(rect.c0, rect.c1) * layout.cw * dpr);
      const y0 = Math.round(Math.min(rect.r0, rect.r1) * layout.ch * dpr);
      const x1 = Math.round((Math.max(rect.c0, rect.c1) + 1) * layout.cw * dpr);
      const y1 = Math.round((Math.max(rect.r0, rect.r1) + 1) * layout.ch * dpr);
      if (chosen) {
        ctx.fillStyle = theme.selectionFill;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      const inset = chosen ? dpr : dpr / 2;
      ctx.lineWidth = chosen ? 2 * dpr : dpr;
      ctx.setLineDash(chosen ? [] : [3 * dpr, 2 * dpr]);
      ctx.strokeStyle = color;
      ctx.strokeRect(x0 + inset, y0 + inset, x1 - x0 - inset * 2, y1 - y0 - inset * 2);
      ctx.setLineDash([]);
    };
    if (this.hover && !this.drag) outline({ c0: this.hover[0], r0: this.hover[1], c1: this.hover[0], r1: this.hover[1] }, theme.hover, false);
    const selection = this.drag ?? this.selection;
    if (selection) outline(selection, theme.selection, true);
  }

  #cellAt(event) {
    const layout = this.#layout();
    const rect = this.canvas.getBoundingClientRect();
    const column = Math.floor((event.clientX - rect.left) / layout.cw);
    const row = Math.floor((event.clientY - rect.top) / layout.ch);
    return [Math.max(0, Math.min(layout.columns - 1, column)), Math.max(0, Math.min(layout.rows - 1, row))];
  }

  #down(event) {
    if (!this.tileset || event.button !== 0) return;
    const [column, row] = this.#cellAt(event);
    if (this.#idAt(column, row, this.#layout()) === undefined) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.drag = { c0: column, r0: row, c1: column, r1: row };
    this.draw();
  }

  #move(event) {
    if (!this.tileset) return;
    const [column, row] = this.#cellAt(event);
    if (this.drag) {
      // A collection's tiles aren't a picture, so only one is picked.
      if (this.tileset.atlas) Object.assign(this.drag, { c1: column, r1: row });
    } else this.hover = [column, row];
    this.draw();
  }

  #up(event) {
    if (!this.drag) return;
    this.canvas.releasePointerCapture?.(event.pointerId);
    const layout = this.#layout();
    const { c0, r0, c1, r1 } = this.drag;
    const left = Math.min(c0, c1);
    const top = Math.min(r0, r1);
    const width = Math.abs(c1 - c0) + 1;
    const height = Math.abs(r1 - r0) + 1;
    const gids = [];
    for (let row = top; row < top + height; row++) {
      for (let column = left; column < left + width; column++) {
        const id = this.#idAt(column, row, layout);
        gids.push(id === undefined ? 0 : this.tileset.firstgid + id);
      }
    }
    this.selection = { c0: left, r0: top, c1: left + width - 1, r1: top + height - 1 };
    this.drag = undefined;
    this.draw();
    if (gids.some(Boolean)) this.onPick(stampOf(width, height, gids));
  }
}
