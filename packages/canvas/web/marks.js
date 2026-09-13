// Place a mark, and show which marks are still pending.
//
// This module owns the parent side of the postMessage channel to
// mark-agent.js (the script injected into every artboard iframe). It never
// reaches into an iframe's document directly — that would defeat the
// sandbox mark-agent.js is built to respect — everything here is either a
// postMessage or a fetch to this canvas server's own /api/marks endpoint.

/** Turn mark mode on or off in every artboard iframe at once. */
function broadcastMarkMode(getArtboardEntries, enabled) {
  for (const { el } of getArtboardEntries().values()) {
    const iframe = el.querySelector("iframe");
    iframe?.contentWindow?.postMessage({ source: "beziera-canvas", type: "set-mark-mode", enabled }, "*");
  }
}

function formatPendingCount(count) {
  if (count === 0) return "No pending marks";
  return `${count} pending mark${count === 1 ? "" : "s"}`;
}

/**
 * Wire up the "Leave a mark" toggle, the comment popover, and the pending
 * marks count. Returns { refreshPendingCount } so canvas.js can re-poll it
 * when a marks-changed socket event arrives (typically clear_marks, called
 * by the agent — not something this tab did itself).
 */
export function initMarks({ getArtboardEntries, worldToScreen }) {
  const toggleBtn = document.getElementById("mark-toggle");
  const countEl = document.getElementById("marks-pending-count");

  let markModeEnabled = false;
  let popover = null;

  function setMarkMode(enabled) {
    markModeEnabled = enabled;
    if (toggleBtn) {
      toggleBtn.textContent = enabled ? "Cancel marking" : "Leave a mark";
      toggleBtn.classList.toggle("active", enabled);
    }
    broadcastMarkMode(getArtboardEntries, enabled);
    if (!enabled) closePopover();
  }

  function closePopover() {
    popover?.remove();
    popover = null;
  }

  function openPopover(artboardId, element) {
    closePopover();
    const entry = getArtboardEntries().get(artboardId);
    if (!entry) return;

    const rect = element.rect ?? { x: 0, y: 0, width: 0, height: 0 };
    // The click coordinates mark-agent.js reports are relative to the
    // artboard iframe's own viewport, which is the same size as the
    // artboard's world-space box (the iframe is scaled visually by the
    // canvas's CSS transform, not resized) — so artboard.x/y plus the
    // click offset is the world-space point, and worldToScreen places the
    // popover under the actual cursor regardless of the current pan/zoom.
    const screenPos = worldToScreen(entry.artboard.x + rect.x, entry.artboard.y + rect.y + rect.height);

    popover = document.createElement("div");
    popover.className = "mark-popover";
    popover.style.left = `${screenPos.x}px`;
    popover.style.top = `${screenPos.y + 8}px`;

    const label = document.createElement("div");
    label.className = "mark-popover-label";
    label.textContent = element.tag + (element.id ? `#${element.id}` : "");
    popover.appendChild(label);

    const textarea = document.createElement("textarea");
    textarea.placeholder = "What's wrong here?";
    popover.appendChild(textarea);

    const actions = document.createElement("div");
    actions.className = "mark-popover-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => closePopover());

    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.textContent = "Leave mark";
    submitBtn.addEventListener("click", () => submitMark(artboardId, element, textarea.value));

    actions.append(cancelBtn, submitBtn);
    popover.appendChild(actions);

    document.body.appendChild(popover);
    textarea.focus();
  }

  async function submitMark(artboardId, element, comment) {
    const trimmed = comment.trim();
    if (!trimmed) return;
    try {
      const response = await fetch("/api/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artboardId, element, comment: trimmed }),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${await response.text()}`);
      }
    } catch (err) {
      console.error("Failed to save mark:", err);
      return;
    }
    closePopover();
    setMarkMode(false);
    await refreshPendingCount();
  }

  async function refreshPendingCount() {
    if (!countEl) return;
    try {
      const response = await fetch("/api/marks", { cache: "no-store" });
      if (!response.ok) return;
      const { marks } = await response.json();
      const pending = marks.filter((mark) => mark.status === "pending").length;
      countEl.textContent = formatPendingCount(pending);
    } catch {
      // marks.json may not exist yet on a design folder with no marks at
      // all — /api/marks already tolerates that server-side, but a network
      // hiccup shouldn't crash the panel either way.
    }
  }

  toggleBtn?.addEventListener("click", () => setMarkMode(!markModeEnabled));

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== "beziera-artboard" || data.type !== "element-selected") return;
    if (!markModeEnabled) return;
    openPopover(data.artboardId, data.element);
  });

  refreshPendingCount();

  return { refreshPendingCount };
}
