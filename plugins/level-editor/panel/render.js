// Draws a map on the panel's canvas, and finds the object under a point.
// Everything is drawn in device pixels with tile edges rounded, so tiles
// meet without seams at any zoom; only what is in view is drawn.
import { FLIP_D, FLIP_H, FLIP_V } from "./tmj.js";

/** `#rrggbb` or Tiled's `#aarrggbb` as a CSS colour. */
export function cssColor(value, fallback) {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(value ?? ""));
  if (!match) return fallback;
  const hex = match[1];
  if (hex.length === 6) return `#${hex}`;
  return `#${hex.slice(2)}${hex.slice(0, 2)}`;
}

const COLLISION = /collision|collide|solid|wall|block/i;

/** The colour an object layer is drawn in: its own `color`, else one by what it seems to be for. */
export function layerColor(layer, theme) {
  return cssColor(layer.color, COLLISION.test(layer.name ?? "") ? theme.collision : theme.objects);
}

/**
 * Draws the scene. `scene` has the canvas size in device pixels (`width`,
 * `height`), `dpr`, the view (`zoom`, `x`, `y`: the map's origin in CSS
 * pixels), the map `doc` and its decoded `tiles`, `tile(gid)` giving what to
 * draw a tile from, `image(path)` for image layers, `theme` colours, `grid`,
 * and `overlay(ctx, toDevice)` for the tool's preview.
 */
export function drawScene(ctx, scene) {
  const { doc, dpr, zoom, theme } = scene;
  const scale = zoom * dpr;
  const ox = scene.x * dpr;
  const oy = scene.y * dpr;
  const tw = doc.tilewidth;
  const th = doc.tileheight;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, scene.width, scene.height);
  ctx.imageSmoothingEnabled = false;

  const bounds = mapBounds(scene);
  const left = Math.round(ox + bounds.x * scale);
  const top = Math.round(oy + bounds.y * scale);
  const right = Math.round(ox + (bounds.x + bounds.width) * scale);
  const bottom = Math.round(oy + (bounds.y + bounds.height) * scale);
  ctx.fillStyle = cssColor(doc.backgroundcolor, theme.background);
  ctx.fillRect(left, top, right - left, bottom - top);

  const view = { left: -ox / scale, top: -oy / scale, right: (scene.width - ox) / scale, bottom: (scene.height - oy) / scale };
  const drawLayers = (layers, opacity, offsetX, offsetY) => {
    for (const layer of layers ?? []) {
      if (layer.visible === false) continue;
      const alpha = opacity * (layer.opacity ?? 1);
      const dx = offsetX + (layer.offsetx ?? 0);
      const dy = offsetY + (layer.offsety ?? 0);
      if (layer.type === "group") drawLayers(layer.layers, alpha, dx, dy);
      else if (layer.type === "tilelayer") drawTileLayer(ctx, scene, layer, alpha, dx, dy, view, scale, ox, oy);
      else if (layer.type === "objectgroup") drawObjectLayer(ctx, scene, layer, alpha, dx, dy, scale, ox, oy);
      else if (layer.type === "imagelayer") drawImageLayer(ctx, scene, layer, alpha, dx, dy, scale, ox, oy);
    }
  };
  drawLayers(doc.layers, 1, 0, 0);
  ctx.globalAlpha = 1;

  if (scene.grid && tw * scale >= 4 && th * scale >= 4) {
    ctx.beginPath();
    const c0 = Math.max(Math.floor((view.left - bounds.x) / tw), 0);
    const c1 = Math.min(Math.ceil((view.right - bounds.x) / tw), bounds.width / tw);
    const r0 = Math.max(Math.floor((view.top - bounds.y) / th), 0);
    const r1 = Math.min(Math.ceil((view.bottom - bounds.y) / th), bounds.height / th);
    for (let c = c0; c <= c1; c++) {
      const x = Math.round(ox + (bounds.x + c * tw) * scale) + 0.5;
      ctx.moveTo(x, Math.max(top, 0));
      ctx.lineTo(x, Math.min(bottom, scene.height));
    }
    for (let r = r0; r <= r1; r++) {
      const y = Math.round(oy + (bounds.y + r * th) * scale) + 0.5;
      ctx.moveTo(Math.max(left, 0), y);
      ctx.lineTo(Math.min(right, scene.width), y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.grid;
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.bounds;
  ctx.strokeRect(left + 0.5, top + 0.5, right - left - 1, bottom - top - 1);

  const toDevice = (wx, wy) => [ox + wx * scale, oy + wy * scale];
  scene.overlay?.(ctx, toDevice, scale);
}

/** The map's extent in pixels; for an infinite map, that of its chunks. */
export function mapBounds({ doc, tiles }) {
  const tw = doc.tilewidth;
  const th = doc.tileheight;
  if (!doc.infinite) return { x: 0, y: 0, width: doc.width * tw, height: doc.height * th };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const state of tiles.values()) {
    for (const chunk of state.chunks ?? []) {
      x0 = Math.min(x0, chunk.x);
      y0 = Math.min(y0, chunk.y);
      x1 = Math.max(x1, chunk.x + chunk.width);
      y1 = Math.max(y1, chunk.y + chunk.height);
    }
  }
  if (x0 === Infinity) return { x: 0, y: 0, width: (doc.width || 16) * tw, height: (doc.height || 16) * th };
  return { x: x0 * tw, y: y0 * th, width: (x1 - x0) * tw, height: (y1 - y0) * th };
}

function drawTileLayer(ctx, scene, layer, alpha, dx, dy, view, scale, ox, oy) {
  const state = scene.tiles.get(layer);
  if (!state) return;
  ctx.globalAlpha = alpha;
  const parts = state.gids ? [{ x: 0, y: 0, width: state.width, height: state.height, gids: state.gids }] : (state.chunks ?? []);
  const { tilewidth: tw, tileheight: th } = scene.doc;
  // Tiles taller or wider than the grid reach into neighbouring cells.
  const pad = scene.tilePad ?? 1;
  for (const part of parts) {
    const c0 = Math.max(0, Math.floor((view.left - dx) / tw) - part.x - pad);
    const c1 = Math.min(part.width - 1, Math.ceil((view.right - dx) / tw) - part.x + pad);
    const r0 = Math.max(0, Math.floor((view.top - dy) / th) - part.y - 1);
    const r1 = Math.min(part.height - 1, Math.ceil((view.bottom - dy) / th) - part.y + pad);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const gid = part.gids[r * part.width + c];
        if (!gid) continue;
        const tile = scene.tile(gid);
        if (!tile) continue;
        const cellX = dx + (part.x + c) * tw;
        const cellY = dy + (part.y + r) * th;
        let x, y, w, h;
        if (tile.grid) {
          [x, y, w, h] = [cellX, cellY, tw, th];
        } else {
          w = tile.width;
          h = tile.height;
          x = cellX + tile.offsetX;
          y = cellY + th - h + tile.offsetY;
        }
        drawTile(ctx, tile, gid, ox + x * scale, oy + y * scale, ox + (x + w) * scale, oy + (y + h) * scale);
      }
    }
  }
}

/** Draws one tile into the device rectangle (x0, y0)–(x1, y1), applying its flip flags. */
export function drawTile(ctx, tile, gid, x0, y0, x1, y1) {
  const left = Math.round(x0);
  const top = Math.round(y0);
  const width = Math.round(x1) - left;
  const height = Math.round(y1) - top;
  if (width <= 0 || height <= 0) return;
  if (!(gid & (FLIP_H | FLIP_V | FLIP_D))) {
    ctx.drawImage(tile.image, tile.sx, tile.sy, tile.sw, tile.sh, left, top, width, height);
    return;
  }
  ctx.save();
  ctx.translate(left + width / 2, top + height / 2);
  ctx.scale(gid & FLIP_H ? -1 : 1, gid & FLIP_V ? -1 : 1);
  // The diagonal flip swaps x and y before the other flips (Tiled's order).
  if (gid & FLIP_D) ctx.transform(0, 1, 1, 0, 0, 0);
  const [w, h] = gid & FLIP_D ? [height, width] : [width, height];
  ctx.drawImage(tile.image, tile.sx, tile.sy, tile.sw, tile.sh, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawImageLayer(ctx, scene, layer, alpha, dx, dy, scale, ox, oy) {
  const image = scene.image(layer.image);
  if (!image) return;
  ctx.globalAlpha = alpha;
  const x = dx + (layer.x ?? 0);
  const y = dy + (layer.y ?? 0);
  ctx.drawImage(image, Math.round(ox + x * scale), Math.round(oy + y * scale), Math.round(image.naturalWidth * scale), Math.round(image.naturalHeight * scale));
}

function drawObjectLayer(ctx, scene, layer, alpha, dx, dy, scale, ox, oy) {
  const color = layerColor(layer, scene.theme);
  const { dpr } = scene;
  const objects = layer.objects ?? [];
  for (const object of objects) {
    if (object.visible === false) continue;
    ctx.globalAlpha = alpha * (object.opacity ?? 1);
    ctx.setTransform(scale, 0, 0, scale, ox + (dx + object.x) * scale, oy + (dy + object.y) * scale);
    if (object.rotation) ctx.rotate((object.rotation * Math.PI) / 180);
    const line = (1.5 * dpr) / scale;
    ctx.lineWidth = line;
    ctx.strokeStyle = color;
    ctx.fillStyle = withAlpha(color, 0.22);
    const width = object.width ?? 0;
    const height = object.height ?? 0;
    if (object.gid) {
      const tile = scene.tile(object.gid);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (tile && !object.rotation) {
        const x = ox + (dx + object.x) * scale;
        const y = oy + (dy + object.y) * scale;
        const w = (width || tile.width) * scale;
        const h = (height || tile.height) * scale;
        drawTile(ctx, tile, object.gid, x, y - h, x + w, y);
      } else {
        ctx.setTransform(scale, 0, 0, scale, ox + (dx + object.x) * scale, oy + (dy + object.y) * scale);
        if (object.rotation) ctx.rotate((object.rotation * Math.PI) / 180);
        if (tile) {
          ctx.scale(object.gid & FLIP_H ? -1 : 1, object.gid & FLIP_V ? -1 : 1);
          ctx.drawImage(tile.image, tile.sx, tile.sy, tile.sw, tile.sh, object.gid & FLIP_H ? -width : 0, object.gid & FLIP_V ? 0 : -height, width, height);
        } else ctx.strokeRect(0, -height, width, height);
      }
    } else if (object.point || (!width && !height && !object.polygon && !object.polyline && !object.text)) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const [x, y] = [ox + (dx + object.x) * scale, oy + (dy + object.y) * scale];
      drawPin(ctx, x, y, color, dpr);
    } else if (object.polygon || object.polyline) {
      const points = object.polygon ?? object.polyline;
      ctx.beginPath();
      points.forEach((point, i) => (i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
      if (object.polygon) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
    } else if (object.ellipse || object.capsule) {
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (object.text) {
      const text = object.text;
      ctx.fillStyle = cssColor(text.color, scene.theme.text);
      ctx.font = `${text.bold ? "bold " : ""}${text.italic ? "italic " : ""}${text.pixelsize ?? 16}px ${text.fontfamily ?? "sans-serif"}`;
      ctx.textBaseline = "top";
      ctx.fillText(String(text.text ?? ""), 0, 0, width || undefined);
    } else {
      ctx.fillRect(0, 0, width, height);
      ctx.strokeRect(line / 2, line / 2, Math.max(0, width - line), Math.max(0, height - line));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const label = object.name || object.type || object.class;
    if (label && scale >= 0.75 * dpr) {
      const [x, y] = [ox + (dx + object.x) * scale, oy + (dy + object.y) * scale];
      const anchorY = object.gid ? y - (height || 0) * scale : y;
      drawLabel(ctx, label, x, anchorY - (object.point ? 17 * dpr : 3 * dpr), scene);
    }
  }
  ctx.globalAlpha = 1;
}

function drawPin(ctx, x, y, color, dpr) {
  const r = 6 * dpr;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - r * 1.3, y - r * 1.6, x - r, y - r * 2.6, x, y - r * 2.6);
  ctx.bezierCurveTo(x + r, y - r * 2.6, x + r * 1.3, y - r * 1.6, x, y);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = dpr;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - r * 1.75, r * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();
}

function drawLabel(ctx, text, x, y, scene) {
  const { dpr, theme } = scene;
  ctx.font = `${11 * dpr}px ${theme.font}`;
  ctx.textBaseline = "bottom";
  const width = ctx.measureText(text).width;
  const pad = 3 * dpr;
  ctx.fillStyle = theme.labelBackground;
  ctx.fillRect(Math.round(x - pad), Math.round(y - 14 * dpr), Math.round(width + pad * 2), Math.round(14 * dpr));
  ctx.fillStyle = theme.labelText;
  ctx.fillText(text, Math.round(x), Math.round(y - 2 * dpr));
}

export function withAlpha(color, alpha) {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (!hex) return color;
  const n = Number.parseInt(hex[1], 16);
  const a = hex[2] ? (Number.parseInt(hex[2], 16) / 255) * alpha : alpha;
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** An object's bounding box in map pixels, ignoring rotation; `pointRadius` is in map pixels. */
export function objectBox(object, pointRadius = 6) {
  const width = object.width ?? 0;
  const height = object.height ?? 0;
  if (object.gid) return { x: object.x, y: object.y - height, width, height };
  if (object.polygon || object.polyline) {
    const points = object.polygon ?? object.polyline;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    return { x: object.x + x0, y: object.y + y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
  }
  if (object.point || (!width && !height && !object.text)) {
    return { x: object.x - pointRadius, y: object.y - pointRadius * 2.6, width: pointRadius * 2, height: pointRadius * 2.6 };
  }
  return { x: object.x, y: object.y, width, height };
}

/** Whether map point (x, y) is on `object`, its rotation taken into account. */
export function hitsObject(object, x, y, pointRadius) {
  let px = x;
  let py = y;
  if (object.rotation && !object.point) {
    const angle = (-object.rotation * Math.PI) / 180;
    const rx = x - object.x;
    const ry = y - object.y;
    px = object.x + rx * Math.cos(angle) - ry * Math.sin(angle);
    py = object.y + rx * Math.sin(angle) + ry * Math.cos(angle);
  }
  const box = objectBox(object, pointRadius);
  const slack = Math.min(pointRadius / 2, 3);
  return px >= box.x - slack && px <= box.x + box.width + slack && py >= box.y - slack && py <= box.y + box.height + slack;
}
