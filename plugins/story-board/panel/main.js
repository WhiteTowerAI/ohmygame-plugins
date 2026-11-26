// The Story Board: cards on a canvas joined by arrows, kept in
// story-board/board.json, with where each card sits in story-board/layout.json.
// OhMyGame's <omg-canvas> draws and handles the canvas as the app's own
// canvases do; this page keeps the board and changes it.
import { connect } from "/_ohmygame/plugin-ui.js";
import { TEXT } from "./i18n.js";

const host = await connect();
const t = TEXT[host.locale] ?? TEXT.en;
document.documentElement.lang = host.locale;

const BOARD = "story-board/board.json";
const LAYOUT = "story-board/layout.json";
const BOARD_VERSION = 1;
const GRID = 10;
const CARD_WIDTH = 440;
const CARD_HEIGHT = 28 + 248;
// Solar's text and gallery icons, as the app's canvas nodes mark a text node or a picture.
const TEXT_ICON = '<path d="M12 7H10C9.05719 7 8.58579 7 8.29289 7.32544C8 7.65087 8 8.17466 8 9.22222V9.75M12 7H14C14.9428 7 15.4142 7 15.7071 7.32544C16 7.65087 16 8.17466 16 9.22222V9.75M12 7V17M9.5 17H15" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z"/>';
const PICTURE_ICON = '<path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z"/><circle cx="16" cy="8" r="2"/><path d="M2 12.5001L3.75159 10.9675C4.66286 10.1702 6.03628 10.2159 6.89249 11.0721L11.1822 15.3618C11.8694 16.0491 12.9512 16.1428 13.7464 15.5839L14.0446 15.3744C15.1888 14.5702 16.7369 14.6634 17.7765 15.599L21 18.5001" stroke-linecap="round"/>';
const PLUS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 12L20 12"/><path d="M12.0204 4L12.0205 20.0003"/></svg>';

const state = {
  /** `loading`, `error`, or `ready`; a project without a board shows an empty one. */
  status: "loading",
  error: "",
  board: undefined,
  /** Where each card sits, by id, in canvas units. */
  positions: {},
  /** The text of each file as last read or written, so the board's own writes aren't read back as changes. */
  disk: { board: undefined, layout: undefined },
  /** Card pictures, by project path. */
  pictures: new Map(),
  /** The card whose text is being written on the canvas, which a redraw leaves alone. */
  writing: undefined,
  /** The board and layout before each of the person's changes, and the changes undone, for ⌘Z and ⇧⌘Z. */
  undo: [],
  redo: [],
  /** Cards copied with ⌘C, with the arrows between them and where they sat. */
  clipboard: undefined,
};
const HISTORY_LIMIT = 100;
const MOD = /mac/i.test(navigator.platform) ? "⌘" : "Ctrl+";
const PICTURE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

// ---------------------------------------------------------------------------
// The page's fixed parts.

const app = document.getElementById("app");
const canvas = el("omg-canvas", {
  label: t.board,
  "select-label": t.select,
  "pan-label": t.pan,
  "fit-label": t.fit,
  "zoom-in-label": t.zoomIn,
  "zoom-out-label": t.zoomOut,
  "zoom-reset-label": t.resetZoom,
  "cut-label": t.disconnect,
});
const addButton = el("button", { type: "button", slot: "tools", "aria-label": t.add, "data-tooltip": t.add });
addButton.innerHTML = PLUS;
addButton.addEventListener("click", () => {
  const { x, y, zoom } = canvas.viewport;
  void addCard({ x: (canvas.clientWidth / 2 - x) / zoom - CARD_WIDTH / 2, y: (canvas.clientHeight / 2 - y) / zoom - CARD_HEIGHT / 2 });
});

// ---------------------------------------------------------------------------
// Reading and writing the board.

async function reload() {
  let boardText;
  try {
    boardText = await host.files.text(BOARD);
  } catch (cause) {
    if (!missing(cause)) {
      if (state.status === "ready") return;
      state.status = "error";
      state.error = String(cause?.message ?? cause);
      return render();
    }
    // No board yet: an empty one, written when the first card is added.
    boardText = "";
  }
  if (boardText !== state.disk.board) {
    try {
      const value = boardText ? JSON.parse(boardText) : {};
      // A board from a later version of this plugin: show it, but don't write over what this one can't read.
      if (Number.isInteger(value?.version) && value.version > BOARD_VERSION) throw new Error(t.newerBoard);
      state.board = normalise(value);
      if (state.disk.board !== undefined) { state.undo = []; state.redo = []; }
      state.status = "ready";
      state.disk.board = boardText;
    } catch (cause) {
      state.status = "error";
      state.error = `${t.unreadable}: ${cause?.message ?? cause}`;
      return render();
    }
  }
  let layoutText;
  try { layoutText = await host.files.text(LAYOUT); } catch { layoutText = undefined; }
  if (layoutText !== undefined && layoutText !== state.disk.layout) {
    try {
      const nodes = JSON.parse(layoutText).nodes;
      state.positions = nodes && typeof nodes === "object" ? nodes : {};
      state.disk.layout = layoutText;
    } catch { /* A broken layout only loses where cards sit. */ }
  }
  placeNewCards();
  await loadPictures();
  render();
}

function missing(cause) {
  return /not found|ENOENT|no such|doesn't exist|does not exist|404/i.test(String(cause?.message ?? cause));
}

/**
 * The board as this page works with it, whatever the file left out or got
 * wrong: cards need an id, arrows need two cards that are there.
 */
function normalise(value) {
  const board = value && typeof value === "object" ? value : {};
  const seen = new Set();
  const nodes = (Array.isArray(board.nodes) ? board.nodes : []).filter((item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const edges = (Array.isArray(board.edges) ? board.edges : []).filter((item) => item && typeof item === "object" && seen.has(item.from) && seen.has(item.to));
  const ids = new Set();
  for (const edge of edges) {
    if (typeof edge.id !== "string" || !edge.id || ids.has(edge.id)) edge.id = uniqueId(`${edge.from}-${edge.to}`, ids);
    ids.add(edge.id);
  }
  return { ...board, version: BOARD_VERSION, nodes, edges };
}

/** The board as it is written: only the fields the format has, each of the type it says. */
function serialise(board) {
  const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const files = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : undefined);
  const clean = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length)));
  return {
    version: BOARD_VERSION,
    nodes: board.nodes.map((card) => clean({ id: card.id, title: text(card.title) ?? card.id, tag: text(card.tag), summary: text(card.summary), image: text(card.image), files: files(card.files) })),
    edges: board.edges.map((edge) => clean({ id: edge.id, from: edge.from, to: edge.to, label: text(edge.label), when: text(edge.when) })),
  };
}

async function saveBoard() {
  const text = `${JSON.stringify(serialise(state.board), null, 2)}\n`;
  // A change of where cards sit only, undone or redone, leaves the board as it is.
  if (text === state.disk.board) return updateContext();
  state.disk.board = text;
  try {
    await host.files.write(BOARD, text);
  } catch (cause) {
    // Refused, such as while the Agent works: show the board as it is on disk again.
    toast(/agent|busy|working|wait/i.test(String(cause?.message)) ? t.busy : String(cause?.message ?? cause), "danger");
    state.disk.board = undefined;
    await reload();
  }
  updateContext();
}

let layoutTimer;
function saveLayout() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(async () => {
    const nodes = {};
    for (const card of state.board?.nodes ?? []) if (state.positions[card.id]) nodes[card.id] = state.positions[card.id];
    const text = `${JSON.stringify({ version: 1, nodes }, null, 2)}\n`;
    if (text === state.disk.layout) return;
    state.disk.layout = text;
    try { await host.files.write(LAYOUT, text); } catch (cause) { toast(String(cause?.message ?? cause), "danger"); }
  }, 300);
}

/** Cards the layout doesn't place yet go one column right of the cards that lead to them, below what's there. */
function placeNewCards() {
  const unplaced = state.board.nodes.filter((card) => !validPosition(state.positions[card.id]));
  if (!unplaced.length) return;
  const depth = depths();
  for (const card of unplaced) {
    const x = (depth.get(card.id) ?? 0) * (CARD_WIDTH + 160);
    const below = state.board.nodes
      .filter((other) => other !== card && validPosition(state.positions[other.id]) && Math.abs(state.positions[other.id].x - x) < CARD_WIDTH)
      .map((other) => state.positions[other.id].y + CARD_HEIGHT + 80);
    state.positions[card.id] = snap({ x, y: below.length ? Math.max(...below) : 0 });
  }
  saveLayout();
}

function validPosition(at) {
  return at && Number.isFinite(at.x) && Number.isFinite(at.y);
}

/** How many arrows each card is from a card nothing leads to. */
function depths() {
  const { nodes, edges } = state.board;
  const roots = nodes.filter((card) => !edges.some((edge) => edge.to === card.id)).map((card) => card.id);
  const depth = new Map(roots.map((id) => [id, 0]));
  const queue = [...roots];
  while (queue.length) {
    const from = queue.shift();
    for (const edge of edges) if (edge.from === from && !depth.has(edge.to)) { depth.set(edge.to, depth.get(from) + 1); queue.push(edge.to); }
  }
  return depth;
}

async function loadPictures() {
  await Promise.all(state.board.nodes.map(async (card) => {
    if (typeof card.image !== "string" || !card.image || state.pictures.has(card.image)) return;
    try { state.pictures.set(card.image, await host.files.url(card.image)); } catch { state.pictures.set(card.image, ""); }
  }));
}

// ---------------------------------------------------------------------------
// Drawing.

function render() {
  if (state.status === "loading") return app.replaceChildren(el("omg-empty", { heading: t.loading }));
  if (state.status === "error") return app.replaceChildren(el("div", { class: "empty" }, el("omg-empty", { heading: state.error })));
  if (!canvas.isConnected) app.replaceChildren(canvas);
  const cards = new Map([...canvas.querySelectorAll("omg-canvas-node")].map((element) => [element.nodeId, element]));
  const wanted = state.board.nodes.map((card) => {
    const element = cards.get(card.id) ?? el("omg-canvas-node", { "node-id": card.id, renamable: true, "rename-label": t.rename });
    drawCard(element, card);
    return element;
  });
  // Keep the elements cards already have, so a redraw doesn't lose a double-click's target.
  for (const [id, element] of cards) if (!node(id)) element.remove();
  for (const element of wanted) if (element.parentElement !== canvas) canvas.append(element);
  if (!addButton.isConnected) canvas.append(addButton);
  // A named arrow leaves from its row; one without a name from the card's + port.
  canvas.edges = state.board.edges.map((edge) => ({ id: edge.id, from: edge.from, ...(edge.label ? { exit: edge.id } : {}), to: edge.to }));
}

function drawCard(element, card) {
  const at = state.positions[card.id] ?? { x: 0, y: 0 };
  element.setAttribute("x", String(at.x));
  element.setAttribute("y", String(at.y));
  element.setAttribute("heading", card.title || card.id);
  // A row for each named arrow it starts, with its condition; an arrow without a name shows only as its line.
  element.exits = state.board.edges.filter((edge) => edge.from === card.id && edge.label).map((edge) => ({
    id: edge.id,
    label: edge.label,
    ...(edge.when ? { note: edge.when } : {}),
  }));
  if (state.writing === card.id) return;
  const picture = card.image ? state.pictures.get(card.image) : "";
  const content = picture
    ? el("img", { src: picture, alt: "", draggable: "false", title: card.summary })
    : card.summary ? el("p", { class: "summary" }, card.summary) : undefined;
  // A card with nothing on it shows its buttons; one with a picture or text shows them on hover.
  const actions = el("div", { class: `card-actions${content ? "" : " is-empty"}` },
    action(picture ? t.changePicture : t.addPicture, () => choosePicture(card.id)),
    picture ? undefined : action(card.summary ? t.editText : t.addText, () => writeText(element, card)));
  const badges = el("span", { slot: "badges", class: "badges" });
  if (card.tag) badges.append(el("span", { class: "badge" }, String(card.tag)));
  const mark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [name, value] of Object.entries({ slot: "icon", class: `card-icon ${picture ? "is-picture" : "is-text"}`, width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "aria-hidden": "true" })) mark.setAttribute(name, value);
  mark.innerHTML = picture ? PICTURE_ICON : TEXT_ICON;
  element.replaceChildren(...[mark, content, actions, badges].filter(Boolean));
}

/** A button on a card: pressing it is the button's, not a drag or a pick on the canvas. */
function action(label, run) {
  const button = el("button", { type: "button", class: "card-action" }, label);
  for (const type of ["pointerdown", "dblclick", "contextmenu"]) button.addEventListener(type, (event) => event.stopPropagation());
  button.addEventListener("click", (event) => { event.stopPropagation(); run(); });
  return button;
}

// ---------------------------------------------------------------------------
// What the person does on the canvas.

canvas.addEventListener("omg-move", ({ detail }) => {
  record();
  for (const { node: id, x, y } of detail.nodes) state.positions[id] = { x, y };
  saveLayout();
});

canvas.addEventListener("omg-connect", async ({ detail }) => {
  const { from, to } = detail;
  if (state.board.edges.some((edge) => edge.from === from && edge.to === to)) return;
  const id = uniqueId(`${from}-${to}`, state.board.edges.map((edge) => edge.id));
  record();
  state.board.edges.push({ id, from, to });
  render();
  canvas.selection = { nodes: [], edges: [id] };
  await saveBoard();
});

canvas.addEventListener("omg-selection-change", () => updateContext());
canvas.addEventListener("omg-delete", ({ detail }) => void remove(detail));
canvas.addEventListener("omg-rename", async ({ detail }) => {
  const card = node(detail.node);
  if (!card) return;
  record();
  card.title = detail.heading;
  render();
  await saveBoard();
});
canvas.addEventListener("omg-exit-rename", async ({ detail }) => {
  const edge = state.board.edges.find((each) => each.id === detail.exit);
  if (!edge) return;
  record();
  if (detail.label) edge.label = detail.label;
  else delete edge.label;
  render();
  await saveBoard();
});
canvas.addEventListener("omg-undo", () => void step(state.undo, state.redo));
canvas.addEventListener("omg-redo", () => void step(state.redo, state.undo));
canvas.addEventListener("omg-duplicate", ({ detail }) => void duplicate(detail.nodes));
canvas.addEventListener("omg-copy", ({ detail }) => copy(detail.nodes));
canvas.addEventListener("omg-paste", ({ detail }) => void paste(detail));

// A double-click names the new card's middle; a card's + port names where it goes, and the card it joins.
canvas.addEventListener("omg-add", ({ detail }) => {
  if (detail.from || detail.to) return void addCard({ x: detail.x, y: detail.y }, { from: detail.from, to: detail.to });
  void addCard({ x: detail.x - CARD_WIDTH / 2, y: detail.y - 28 });
});

canvas.addEventListener("omg-context-menu", ({ detail }) => {
  const remove = { value: "delete", label: t.delete, icon: "delete", shortcut: MOD === "⌘" ? "⌫" : "Del", danger: true, separator: true };
  if (detail.node) {
    if (node(detail.node)?.image) detail.items.push({ value: "remove-picture", label: t.removePicture, icon: "picture" });
    detail.items.push(
      { value: "copy", label: t.copy, icon: "copy", shortcut: `${MOD}C`, separator: true },
      { value: "duplicate", label: t.duplicate, icon: "duplicate", shortcut: `${MOD}D` },
      remove,
    );
  } else if (detail.edge) {
    detail.items.push({ ...remove, label: t.disconnect, icon: "cut", separator: false });
  } else {
    detail.items.push({ value: "add", label: t.addHere, icon: "add" });
    if (state.clipboard) detail.items.push({ value: "paste", label: t.paste, icon: "copy", shortcut: `${MOD}V` });
    detail.items.push({ value: "fit", label: t.fit, icon: "fit", separator: true });
  }
});

canvas.addEventListener("omg-menu-select", ({ detail }) => {
  const { value } = detail;
  if (value === "remove-picture") return removePicture(detail.node);
  if (value === "copy") return copy(canvas.selection.nodes);
  if (value === "duplicate") return duplicate(canvas.selection.nodes.map((id) => ({ node: id, ...offset(id) })));
  if (value === "paste") return paste(detail);
  if (value === "delete") return remove(canvas.selection);
  if (value === "add") return addCard({ x: detail.x - CARD_WIDTH / 2, y: detail.y - 28 });
  if (value === "fit") return canvas.fit();
});

// ---------------------------------------------------------------------------
// Writing a card's text where it shows.

function writeText(element, card) {
  state.writing = card.id;
  const input = el("textarea", { class: "summary-input", rows: "4", maxlength: "500", "aria-label": card.title || card.id });
  input.value = card.summary ?? "";
  // While writing, the text box's pointer, wheel and keys are its own, not the canvas's.
  for (const type of ["pointerdown", "dblclick", "contextmenu", "wheel", "keyup", "paste"]) input.addEventListener(type, (event) => event.stopPropagation());
  let done = false;
  const finish = async (keep) => {
    if (done) return;
    done = true;
    state.writing = undefined;
    const value = input.value.trim();
    const changed = keep && value !== (card.summary ?? "");
    if (changed) {
      record();
      if (value) card.summary = value;
      else delete card.summary;
    }
    render();
    canvas.focus({ preventScroll: true });
    if (changed) await saveBoard();
  };
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void finish(true); }
    else if (event.key === "Escape") void finish(false);
  });
  input.addEventListener("blur", () => void finish(true));
  element.replaceChildren(input, ...element.querySelectorAll("[slot]"));
  input.focus();
  input.select();
}

// ---------------------------------------------------------------------------
// Pictures, chosen with the system's file chooser.

const pictureInput = el("input", { type: "file", accept: Object.keys(PICTURE_TYPES).join(","), hidden: true });
document.body.append(pictureInput);
let choosingFor;
function choosePicture(id) {
  choosingFor = id;
  pictureInput.value = "";
  pictureInput.click();
}
pictureInput.addEventListener("change", () => {
  const file = pictureInput.files?.[0];
  if (!file) return;
  if (!PICTURE_TYPES[file.type]) return toast(t.pictureType, "danger");
  void setPicture(node(choosingFor), file);
});

/** Keeps a picture in the project, next to the board, and shows it on the card. */
async function setPicture(card, file) {
  if (!card) return;
  const id = card.id;
  const path = `story-board/images/${id}-${Date.now().toString(36)}.${PICTURE_TYPES[file.type]}`;
  try {
    await host.files.write(path, file);
  } catch (cause) {
    return toast(/agent|busy|working|wait/i.test(String(cause?.message)) ? t.busy : `${t.pictureFailed}: ${cause?.message ?? cause}`, "danger");
  }
  // The card as the board has it now: hearing of the new file may have read the board again meanwhile.
  const current = node(id);
  if (!current) return;
  record();
  current.image = path;
  // Saved before it's shown, so the board has the picture whatever happens to the page next.
  await saveBoard();
  await loadPictures();
  render();
}

/** Takes the picture off the card; the file stays in the project. */
async function removePicture(id) {
  const card = node(id);
  if (!card?.image) return;
  record();
  delete card.image;
  render();
  await saveBoard();
}

// ---------------------------------------------------------------------------
// Changing the board.

/** Adds a card at `at`; `join` names a card it follows (`from`) or leads to (`to`), with an arrow between them. */
async function addCard(at, join = {}) {
  const id = uniqueId("card", state.board.nodes.map((card) => card.id));
  record();
  state.board.nodes.push({ id, title: t.newCard });
  state.positions[id] = snap(at);
  const from = join.from && node(join.from) ? join.from : join.to && node(join.to) ? id : undefined;
  const to = join.from && node(join.from) ? id : join.to && node(join.to) ? join.to : undefined;
  if (from && to) state.board.edges.push({ id: uniqueId(`${from}-${to}`, state.board.edges.map((edge) => edge.id)), from, to });
  render();
  canvas.selection = { nodes: [id], edges: [] };
  await saveBoard();
  saveLayout();
  return id;
}

async function remove({ nodes, edges }) {
  if (!nodes.length && !edges.length) return;
  record();
  const gone = new Set(nodes);
  state.board.nodes = state.board.nodes.filter((card) => !gone.has(card.id));
  state.board.edges = state.board.edges.filter((edge) => !edges.includes(edge.id) && !gone.has(edge.from) && !gone.has(edge.to));
  for (const id of gone) delete state.positions[id];
  if (gone.size) saveLayout();
  render();
  await saveBoard();
}

/** Copies of cards, each where `at` says, with copies of the arrows between them; the copies are picked. */
async function duplicate(at) {
  const cards = at.map(({ node: id }) => node(id)).filter(Boolean);
  if (!cards.length) return;
  record();
  const made = place(cards.map((card) => structuredClone(card)), state.board.edges.filter((edge) => cards.some((card) => card.id === edge.from) && cards.some((card) => card.id === edge.to)).map((edge) => structuredClone(edge)), (id) => at.find((each) => each.node === id));
  render();
  canvas.selection = { nodes: made, edges: [] };
  await saveBoard();
  saveLayout();
}

function copy(ids) {
  const cards = ids.map(node).filter(Boolean);
  if (!cards.length) return;
  const picked = new Set(cards.map((card) => card.id));
  state.clipboard = {
    cards: structuredClone(cards),
    edges: structuredClone(state.board.edges.filter((edge) => picked.has(edge.from) && picked.has(edge.to))),
    positions: Object.fromEntries(cards.map((card) => [card.id, { ...(state.positions[card.id] ?? { x: 0, y: 0 }) }])),
  };
}

/** The copied cards, their top left at `at`. */
async function paste(at) {
  const copied = state.clipboard;
  if (!copied?.cards.length) return;
  const left = Math.min(...Object.values(copied.positions).map((each) => each.x));
  const top = Math.min(...Object.values(copied.positions).map((each) => each.y));
  record();
  const made = place(structuredClone(copied.cards), structuredClone(copied.edges), (id) => ({ x: at.x + copied.positions[id].x - left, y: at.y + copied.positions[id].y - top }));
  render();
  canvas.selection = { nodes: made, edges: [] };
  await saveBoard();
  saveLayout();
}

/** Puts copies of cards and their arrows on the board under new ids, each where `where` says; returns the new ids. */
function place(cards, edges, where) {
  const ids = new Map();
  const taken = state.board.nodes.map((card) => card.id);
  for (const card of cards) {
    const id = uniqueId(card.id, [...taken, ...ids.values()]);
    ids.set(card.id, id);
    state.positions[id] = snap(where(card.id));
    state.board.nodes.push({ ...card, id });
  }
  for (const edge of edges) {
    const from = ids.get(edge.from), to = ids.get(edge.to);
    state.board.edges.push({ ...edge, id: uniqueId(`${from}-${to}`, state.board.edges.map((each) => each.id)), from, to });
  }
  return [...ids.values()];
}

/** Where a duplicate of a card goes: down and to the right of it. */
function offset(id) {
  const at = state.positions[id] ?? { x: 0, y: 0 };
  return { x: at.x + 40, y: at.y + 40 };
}

// ---------------------------------------------------------------------------
// Undo and redo, of the person's own changes on this page.

/** Remembers the board as it is, before a change. */
function record() {
  state.undo.push(snapshot());
  if (state.undo.length > HISTORY_LIMIT) state.undo.shift();
  state.redo = [];
}

function snapshot() {
  return { board: structuredClone(state.board), positions: structuredClone(state.positions) };
}

/** Goes back to the board `from` last kept, keeping the board as it is in `to`. */
async function step(from, to) {
  const before = from.pop();
  if (!before || state.writing) return;
  to.push(snapshot());
  state.board = before.board;
  state.positions = before.positions;
  const ids = new Set(state.board.nodes.map((card) => card.id));
  canvas.selection = { nodes: canvas.selection.nodes.filter((id) => ids.has(id)), edges: [] };
  await loadPictures();
  render();
  await saveBoard();
  saveLayout();
}

// ---------------------------------------------------------------------------
// The Agent.

/** Tells the Agent which cards the author has picked, for their next message. */
function updateContext() {
  const cards = canvas.selection.nodes.map(node).filter(Boolean);
  if (!cards.length) return void host.context.clear().catch(() => {});
  const ids = new Set(cards.map((card) => card.id));
  const edges = state.board.edges.filter((edge) => ids.has(edge.from) || ids.has(edge.to));
  const label = cards.length === 1 ? `Card: ${cards[0].title || cards[0].id}` : `${cards.length} cards`;
  void host.context.set({
    label: label.slice(0, 120),
    text: `The author has picked ${cards.length === 1 ? "this card" : "these cards"} on the Story Board (${BOARD}).\n\nCards:\n${JSON.stringify(cards, null, 2)}\n\nArrows from or to them:\n${JSON.stringify(edges, null, 2)}`.slice(0, 8000),
  }).catch(() => {});
}

function toast(message, tone = "default") {
  return host.request("ui.toast", { message, tone }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Small helpers.

function node(id) {
  return state.board?.nodes.find((card) => card.id === id);
}

function snap({ x, y }) {
  return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID };
}

function uniqueId(base, taken) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function el(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    element.setAttribute(name, value === true ? "" : String(value));
  }
  element.append(...children.filter((child) => child !== undefined && child !== null && child !== ""));
  return element;
}

// ---------------------------------------------------------------------------
// Start, once everything above is defined.

await reload();
host.on("files", ({ paths }) => {
  if (!paths || paths.some((file) => file.startsWith("story-board/") || state.pictures.has(file))) void reload();
});
