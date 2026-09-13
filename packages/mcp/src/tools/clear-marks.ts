import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clearMarks, type DesignFolder } from "@beziera/core";

/**
 * `clear_marks` — acknowledge marks once they have been acted on, so they
 * leave the pending queue the canvas shows.
 */
export function registerClearMarksTool(server: McpServer, folder: DesignFolder): void {
  server.registerTool(
    "clear_marks",
    {
      title: "Clear marks",
      description:
        "Acknowledge marks once they have been acted on, so they leave the pending queue the canvas " +
        "shows. Pass specific mark ids (from get_pending_marks) to acknowledge only those; omit ids " +
        "to clear every pending mark.",
      inputSchema: {
        ids: z
          .array(z.string().min(1))
          .optional()
          .describe("Mark ids to clear, from get_pending_marks. Omit to clear every pending mark."),
      },
    },
    async ({ ids }) => {
      const cleared = await clearMarks(folder, ids);
      return {
        content: [
          {
            type: "text" as const,
            text: `Cleared ${cleared.length} mark${cleared.length === 1 ? "" : "s"}.`,
          },
        ],
      };
    }
  );
}
