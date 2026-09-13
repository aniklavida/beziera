import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readArtboardHtml, type DesignFolder } from "@beziera/core";

/** `read_artboard` — the HTML of one artboard, exactly as it is on disk. */
export function registerReadArtboardTool(server: McpServer, folder: DesignFolder): void {
  server.registerTool(
    "read_artboard",
    {
      title: "Read artboard",
      description: "Return the complete HTML of one artboard by id, exactly as it is on disk.",
      inputSchema: {
        id: z.string().min(1).describe("The artboard's id, as listed by list_artboards."),
      },
    },
    async ({ id }) => {
      const html = await readArtboardHtml(folder, id);
      return { content: [{ type: "text" as const, text: html }] };
    }
  );
}
