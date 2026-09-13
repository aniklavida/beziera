// The paste-ready command panel.
//
// Claude Code does not support MCP sampling (anthropics/claude-code#1785),
// so this canvas has no way to push a mark to the user's agent — the agent
// pulls, and the user triggers it. This text is the softener on the canvas
// side: the user should never have to compose the sentence that tells their
// agent to look at its marks, only paste one.
const PASTE_COMMAND =
  "Check Beziera's pending design marks: call get_pending_marks, address each one, take a " +
  "screenshot to confirm the fix, then call clear_marks.";

export function initCommandPanel() {
  const textEl = document.getElementById("command-text");
  const copyBtn = document.getElementById("command-copy");
  if (!textEl || !copyBtn) return;

  textEl.textContent = PASTE_COMMAND;

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(PASTE_COMMAND);
      copyBtn.textContent = "Copied";
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context).
      // The command is still visible and selectable by hand.
      copyBtn.textContent = "Select & copy";
    }
    setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
  });
}

export { PASTE_COMMAND };
