import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeArtboardHtml, type DesignFolder } from "@beziera/core";

/**
 * `write_artboard` — replace one existing artboard's HTML by id.
 *
 * The design folder is the only channel back to the canvas: writing the
 * file is the whole act, and the canvas's own file watcher is what makes
 * the change visible. Nothing here talks to the canvas directly.
 */
export function registerWriteArtboardTool(server: McpServer, folder: DesignFolder): void {
  server.registerTool(
    "write_artboard",
    {
      title: "Write artboard",
      description:
        "Replace one existing artboard's HTML by id. The artboard must already exist — use " +
        "create_artboard for a new one. The canvas hot-reloads the change on its own.",
      inputSchema: {
        id: z.string().min(1).describe("The artboard's id, as listed by list_artboards."),
        html: z.string().min(1).describe("The complete, standalone HTML document to write."),
      },
    },
    async ({ id, html }) => {
      await writeArtboardHtml(folder, id, html);
      return {
        content: [{ type: "text" as const, text: `Wrote artboard "${id}".` }],
      };
    }
  );
}
