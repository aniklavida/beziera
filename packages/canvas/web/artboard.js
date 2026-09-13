// Every artboard iframe in the canvas is created here, and only here, so the
// sandbox attribute cannot be forgotten by some future call site.
//
// "allow-scripts" only — deliberately without "allow-same-origin". Without
// allow-same-origin the browser gives the framed document an opaque origin
// regardless of the URL it loaded from, so a script inside an artboard
// cannot reach window.parent, cannot read the canvas page's DOM, and cannot
// touch the real localhost origin's storage or cookies. A plain
// <a href="other.html"> inside the frame still navigates that frame, which
// is the whole point of HTML-native prototypes: it costs nothing extra.
const ARTBOARD_SANDBOX = "allow-scripts";

/** Build the URL an artboard's iframe loads from, optionally cache-busted for a reload. */
export function artboardSrc(artboard, cacheBust) {
  const base = `/${artboard.file}`;
  return cacheBust ? `${base}?t=${cacheBust}` : base;
}

/** Create the DOM element for one artboard: a positioned card with a sandboxed iframe inside. */
export function createArtboardElement(artboard) {
  const el = document.createElement("div");
  el.className = "artboard";
  el.dataset.artboardId = artboard.id;
  positionArtboardElement(el, artboard);

  const label = document.createElement("div");
  label.className = "artboard-label";
  label.textContent = artboard.name;
  el.appendChild(label);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", ARTBOARD_SANDBOX);
  iframe.src = artboardSrc(artboard);
  el.appendChild(iframe);

  return el;
}

/** Move/resize an existing artboard element without touching its iframe. */
export function positionArtboardElement(el, artboard) {
  el.style.left = `${artboard.x}px`;
  el.style.top = `${artboard.y}px`;
  el.style.width = `${artboard.width}px`;
  el.style.height = `${artboard.height}px`;
}

/** Reload only this artboard's iframe by resetting its src. Nothing else on the canvas reloads. */
export function reloadArtboardElement(el, artboard) {
  const iframe = el.querySelector("iframe");
  iframe.src = artboardSrc(artboard, Date.now());
}
