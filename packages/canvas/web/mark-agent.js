// Runs INSIDE an artboard's sandboxed iframe (sandbox="allow-scripts" only,
// deliberately no "allow-same-origin" — see artboard.js). That gives this
// script's document an opaque origin: it cannot reach window.parent.document,
// cannot read the canvas page's DOM, and cannot touch the real localhost
// origin's storage. This script never tries to. Its only channel to the
// parent canvas is window.postMessage, which works across an opaque origin
// by design — that is what makes it possible to add click-to-select here
// without weakening the sandbox at all.
//
// The canvas server injects this file into every served artboard (see
// injectMarkAgent in packages/canvas/src/server/serve.ts) along with one
// inline line setting window.__BEZIERA_ARTBOARD_ID__, so a selection can be
// reported without this script ever reading design.json itself.
(function () {
  "use strict";

  var artboardId = window.__BEZIERA_ARTBOARD_ID__ || null;
  var markModeEnabled = false;
  var hoverEl = null;
  var hoverPrevOutline = "";
  var HOVER_OUTLINE = "2px solid #6d5efc";

  function clearHover() {
    if (hoverEl) {
      hoverEl.style.outline = hoverPrevOutline;
      hoverEl = null;
      hoverPrevOutline = "";
    }
  }

  function setHover(el) {
    if (el === hoverEl) return;
    clearHover();
    if (!el || el === document.documentElement || el === document.body) return;
    hoverEl = el;
    hoverPrevOutline = el.style.outline || "";
    el.style.outline = HOVER_OUTLINE;
  }

  /**
   * Build a CSS selector path from the document root down to el. An artboard
   * is a static, agent-authored HTML file rather than a live application
   * with a reshuffling DOM, so a structural path (id if present, otherwise
   * tag + position among same-tag siblings) is a stable reference to the
   * same element across reloads of the same file.
   */
  function computeSelector(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(part + "#" + node.id);
        break;
      }
      var parent = node.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (child) {
          return child.tagName === node.tagName;
        });
        if (siblings.length > 1) {
          part += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
        }
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }

  /** The full element reference sent to the parent: enough for an agent to find and describe the element without a screenshot. */
  function describeElement(el) {
    var rect = el.getBoundingClientRect();
    var classes =
      el.className && typeof el.className === "string"
        ? el.className.trim().split(/\s+/).filter(Boolean)
        : [];
    var text = (el.textContent || "").trim().slice(0, 120);
    return {
      selector: computeSelector(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: classes,
      text: text || undefined,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }

  function onMouseMove(event) {
    if (!markModeEnabled) return;
    setHover(event.target);
  }

  function onClick(event) {
    if (!markModeEnabled) return;
    // Mark mode replaces normal interaction for this click — a link inside
    // the artboard must not navigate the frame away while the user is
    // trying to point at it.
    event.preventDefault();
    event.stopPropagation();
    var element = describeElement(event.target);
    clearHover();
    window.parent.postMessage(
      { source: "beziera-artboard", type: "element-selected", artboardId: artboardId, element: element },
      "*"
    );
  }

  // Capture phase so a mark can be left on any element, including one that
  // would otherwise handle or stop the event itself (a link, a button).
  window.addEventListener("mousemove", onMouseMove, true);
  window.addEventListener("click", onClick, true);

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.source !== "beziera-canvas" || data.type !== "set-mark-mode") return;
    markModeEnabled = !!data.enabled;
    if (!markModeEnabled) clearHover();
  });
})();
