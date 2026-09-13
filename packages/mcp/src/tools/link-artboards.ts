import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { linkArtboards, type DesignFolder } from "@beziera/core";

/**
 * `link_artboards` — record a prototype link between two artboards.
 *
 * This writes into design.json's `links` array, which the canvas schema
 * already defines and has left empty since the canvas landed. Nothing
 * about the canvas needs to change for it to draw what this writes.
 */
export function registerLinkArtboardsTool(server: McpServer, folder: DesignFolder): void {
  server.registerTool(
    "link_artboards",
    {
      title: "Link artboards",
      description:
        "Record a prototype link from one artboard to another in design.json, so the canvas can " +
        "draw the connection. Both ids must already exist.",
      inputSchema: {
        from: z.string().min(1).describe("The source artboard's id."),
        to: z.string().min(1).describe("The destination artboard's id."),
      },
    },
    async ({ from, to }) => {
      await linkArtboards(folder, from, to);
      return {
        content: [{ type: "text" as const, text: `Linked "${from}" -> "${to}".` }],
      };
    }
  );
}
