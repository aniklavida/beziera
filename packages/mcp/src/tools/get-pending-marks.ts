import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPendingMarks, type DesignFolder } from "@beziera/core";

/**
 * `get_pending_marks` — the queue of user feedback left on the canvas that
 * has not been acted on yet.
 *
 * There is no sampling in Claude Code (anthropics/claude-code#1785, still
 * open) and support is uneven across MCP clients generally, so the canvas
 * cannot push a mark to the agent — nothing calls this tool automatically.
 * The bundled skill is what makes the call routine, by instructing the
 * agent to check marks at the start of every turn; absent that instruction,
 * calling it is something a human has to ask for, whether directly or by
 * pasting the command the canvas displays.
 */
export function registerGetPendingMarksTool(server: McpServer, folder: DesignFolder): void {
  server.registerTool(
    "get_pending_marks",
    {
      title: "Get pending marks",
      description:
        "Return the queue of user feedback left on the canvas that has not been acted on yet. Each " +
        "mark names the artboard, a stable reference to the clicked element (a CSS selector, tag, " +
        "id, classes and a short text snippet), and the user's comment. Call this at the start of a " +
        "turn to pick up feedback, act on it, then call clear_marks.",
      inputSchema: {
        artboardId: z
          .string()
          .min(1)
          .optional()
          .describe("Only return marks for this artboard id. Omit for every pending mark."),
      },
    },
    async ({ artboardId }) => {
      const marks = await getPendingMarks(folder);
      const filtered = artboardId ? marks.filter((mark) => mark.artboardId === artboardId) : marks;
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ marks: filtered }, null, 2) }],
      };
    }
  );
}
