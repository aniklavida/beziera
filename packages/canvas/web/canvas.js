import {
  createArtboardElement,
  positionArtboardElement,
  reloadArtboardElement,
} from "./artboard.js";
import { initMarks } from "./marks.js";
import { initCommandPanel } from "./command.js";

const viewport = document.getElementById("viewport");
const world = document.getElementById("world");
const linksGroup = document.getElementById("links-group");

const SVG_NS = "http://www.w3.org/2000/svg";

let scale = 1;
let originX = 0;
let originY = 0;

/** artboard id -> { el, artboard } for every artboard currently on the canvas. */
const elementsById = new Map();

function applyTransform() {
  world.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;
}

function screenToWorld(clientX, clientY) {
  return { x: (clientX - originX) / scale, y: (clientY - originY) / scale };
}

/** Inverse of screenToWorld — where a world-space point (e.g. a click inside an artboard, translated into artboard-relative + artboard.x/y) lands on screen right now. */
export function worldToScreen(worldX, worldY) {
  return { x: originX + worldX * scale, y: originY + worldY * scale };
}

/** The live artboard-id -> { el, artboard } map, read-only for callers outside this module (marks.js needs it to find an artboard's iframe and canvas position). */
export function getArtboardEntries() {
  return elementsById;
}

function zoomAt(clientX, clientY, factor) {
  const before = screenToWorld(clientX, clientY);
  scale = Math.min(4, Math.max(0.1, scale * factor));
  const after = screenToWorld(clientX, clientY);
  originX += (after.x - before.x) * scale;
  originY += (after.y - before.y) * scale;
  applyTransform();
}

viewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      // Trackpad pinch is reported as a wheel event with ctrlKey set.
      const factor = Math.exp(-event.deltaY * 0.01);
      zoomAt(event.clientX, event.clientY, factor);
    } else {
      originX -= event.deltaX;
      originY -= event.deltaY;
      applyTransform();
    }
  },
  { passive: false }
);

let dragging = false;
let dragStart = null;

viewport.addEventListener("mousedown", (event) => {
  // Only start a pan from empty canvas space — an artboard is its own
  // document and handles its own mouse events.
  if (event.target !== viewport && event.target !== world) return;
  dragging = true;
  dragStart = { x: event.clientX, y: event.clientY, originX, originY };
  viewport.classList.add("dragging");
});

window.addEventListener("mousemove", (event) => {
  if (!dragging || !dragStart) return;
  originX = dragStart.originX + (event.clientX - dragStart.x);
  originY = dragStart.originY + (event.clientY - dragStart.y);
  applyTransform();
});

window.addEventListener("mouseup", () => {
  dragging = false;
  dragStart = null;
  viewport.classList.remove("dragging");
});

/** Reconcile the DOM with a fresh design.json: add, move/resize and remove artboards. */
export function renderArtboards(design) {
  const seen = new Set();
  for (const artboard of design.artboards) {
    seen.add(artboard.id);
    const existing = elementsById.get(artboard.id);
    if (!existing) {
      const el = createArtboardElement(artboard);
      world.appendChild(el);
      elementsById.set(artboard.id, { el, artboard });
      continue;
    }
    positionArtboardElement(existing.el, artboard);
    existing.artboard = artboard;
  }
  for (const [id, existing] of elementsById) {
    if (!seen.has(id)) {
      existing.el.remove();
      elementsById.delete(id);
    }
  }
  renderLinks(design);
}

/**
 * Draw the prototype links design.json records as lines from one artboard's
 * right edge to another's left edge, in the same world-space coordinates as
 * the artboards themselves — the SVG lives inside #world, so it pans and
 * zooms with everything else for free, with no coordinate transform of its
 * own to keep in sync.
 *
 * This is display only. The link itself already works with no help from
 * this function: an artboard's own `<a href="other.html">` navigates its
 * iframe regardless of whether design.json ever heard about it. What this
 * draws is the record link_artboards made, so the user can see the flow
 * without having to open every artboard and follow its hrefs by hand.
 */
function renderLinks(design) {
  if (!linksGroup) return;
  linksGroup.replaceChildren();
  if (!design.links || design.links.length === 0) return;

  const byId = new Map(design.artboards.map((artboard) => [artboard.id, artboard]));
  for (const link of design.links) {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (!from || !to) continue; // design.json can outlive an artboard it once named

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("class", "link-line");
    line.setAttribute("x1", String(from.x + from.width));
    line.setAttribute("y1", String(from.y + from.height / 2));
    line.setAttribute("x2", String(to.x));
    line.setAttribute("y2", String(to.y + to.height / 2));
    line.setAttribute("marker-end", "url(#link-arrow)");
    linksGroup.appendChild(line);
  }
}

async function loadDesign() {
  const response = await fetch("/api/design", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load design.json: ${response.status}`);
  }
  return response.json();
}

/**
 * Reload only the artboard(s) whose file just changed on disk. A design.json
 * change re-fetches and reconciles instead — it may have added, moved or
 * removed artboards, but renderArtboards() only touches what actually
 * changed, so an unrelated artboard's iframe still never reloads.
 */
async function handleChange(change) {
  if (change.type === "design-changed") {
    const design = await loadDesign();
    renderArtboards(design);
    return;
  }
  if (change.type === "marks-changed") {
    // marks.json changed — most often clear_marks, called by the agent on
    // its own turn. The pending count on the canvas should reflect that
    // without the user having to reload the page.
    marks.refreshPendingCount();
    return;
  }
  for (const { el, artboard } of elementsById.values()) {
    if (artboard.file === change.file) {
      reloadArtboardElement(el, artboard);
    }
  }
}

function connectSocket() {
  const socket = new WebSocket(`ws://${location.host}/ws`);
  socket.addEventListener("message", (event) => {
    const change = JSON.parse(event.data);
    handleChange(change).catch((err) => console.error(err));
  });
  socket.addEventListener("close", () => {
    // The canvas server may have restarted; keep trying so hot reload comes
    // back on its own rather than leaving the page silently stale.
    setTimeout(connectSocket, 1000);
  });
}

let marks;

async function main() {
  applyTransform();
  const design = await loadDesign();
  renderArtboards(design);
  marks = initMarks({ getArtboardEntries, worldToScreen });
  initCommandPanel();
  connectSocket();
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:24px;color:#b00020">${String(err)}</pre>`;
});
