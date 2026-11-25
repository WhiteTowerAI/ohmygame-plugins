// Small DOM helpers and the panel's icons.

/** An element with attributes and children; `on` maps events to listeners, `props` sets properties. */
export function h(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "on") for (const [type, listener] of Object.entries(value)) node.addEventListener(type, listener);
    else if (key === "props") Object.assign(node, value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? "" : String(value));
  }
  node.append(...children.flat().filter((child) => child !== undefined && child !== null && child !== false));
  return node;
}

// 16 × 16 strokes in currentColor.
const PATHS = {
  brush: "M10.5 2.5l3 3-6.5 6.5-3-3zM4 9.5l2.5 2.5c-.5 1.8-2 2.5-4 2.5.3-1.6.4-3.8 1.5-5z",
  eraser: "M9.5 2.5l4 4-6.5 6.5H4.5l-2-2a1 1 0 010-1.4zM6.5 5.5l4 4M7 13.5h6.5",
  fill: "M3 7.5l5-5 5.5 5.5-5 5-5.5-5.5zM3 7.5h10M14 11c0 1-.5 2-1 2s-1-1-1-2l1-1.5z",
  eyedropper: "M11.5 2a2 2 0 012.5 2.5l-2 2-2.5-2.5zM9.5 4l2.5 2.5M10.5 5.5L4 12v2h2l6.5-6.5",
  rect: "M2.5 3.5h11v9h-11z",
  point: "M8 14.5s-4.5-4.3-4.5-7.5a4.5 4.5 0 019 0c0 3.2-4.5 7.5-4.5 7.5zM8 8.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  select: "M3.5 2.5l9 5-4 1-2 4z",
  undo: "M5.5 3.5L2.5 6.5l3 3M2.5 6.5h7a4 4 0 010 8H7",
  redo: "M10.5 3.5l3 3-3 3M13.5 6.5h-7a4 4 0 000 8H9",
  zoomIn: "M7 12a5 5 0 100-10 5 5 0 000 10zM14 14l-3.5-3.5M7 4.5v5M4.5 7h5",
  zoomOut: "M7 12a5 5 0 100-10 5 5 0 000 10zM14 14l-3.5-3.5M4.5 7h5",
  fit: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10",
  grid: "M2.5 2.5h11v11h-11zM6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11",
  plus: "M8 3v10M3 8h10",
  eye: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 100-4 2 2 0 000 4z",
  eyeOff: "M2 2l12 12M6.6 6.6a2 2 0 002.8 2.8M4.3 4.4C2.6 5.6 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1.3 0 2.4-.4 3.4-1M7 3.6c.3 0 .7-.1 1-.1 4 0 6.5 4.5 6.5 4.5s-.5 1-1.5 2",
  up: "M8 13V3M4 7l4-4 4 4",
  down: "M8 3v10M4 9l4 4 4-4",
  trash: "M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9",
  tileLayer: "M2.5 2.5h5v5h-5zM8.5 2.5h5v5h-5zM2.5 8.5h5v5h-5zM8.5 8.5h5v5h-5z",
  objectLayer: "M3 3.5h6v5H3zM11.5 13a2 2 0 100-4 2 2 0 000 4zM3 11.5h4",
  group: "M2 4.5h4.5l1.5 1.5h6v7H2z",
  image: "M2.5 3h11v10h-11zM2.5 11l3.5-3.5 3 3 2-2 2.5 2.5M10.5 6.5a1 1 0 100-2 1 1 0 000 2z",
  close: "M4 4l8 8M12 4l-8 8",
  lock: "M4.5 7.5h7v6h-7zM6 7.5V5.5a2 2 0 014 0v2",
};

/** An icon by name, hidden from screen readers (its control has the name). */
export function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.3");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", PATHS[name] ?? "");
  svg.append(path);
  return svg;
}

/** An icon-only button with a tooltip; `pressed` marks a chosen tool or toggle. */
export function iconButton(name, label, onClick, { pressed, disabled, variant = "ghost" } = {}) {
  const button = h(
    "omg-button",
    {
      variant,
      class: "icon-button",
      "aria-label": label,
      "aria-pressed": pressed === undefined ? undefined : String(pressed),
      "data-pressed": pressed ? "" : undefined,
      disabled,
      on: { click: onClick },
    },
    icon(name),
  );
  return h("omg-tooltip", { content: label }, button);
}
