import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createArtboard, type DesignFolder } from "@beziera/core";

/**
 * `create_artboard` — write a new artboards/<id>.html and register it in
 * design.json in one step, so the file and the record never disagree.
 *
 * Path safety is not the id's charset — it is resolveInsideFolder, called
 * inside @beziera/core's createArtboard on the path the id resolves to.
 * An id crafted to escape the design folder (e.g. containing "../") is
 * refused there, not trusted here just because it looks like a plain name.
 */
export function registerCreateArtboardTool(server: McpServer, folder: DesignFolder): void {
  server.registerTool(
    "create_artboard",
    {
      title: "Create artboard",
      description:
        "Create a new artboard: writes artboards/<id>.html and registers it in design.json so it " +
        "appears on the canvas. Fails if the id is already taken.",
      inputSchema: {
        id: z.string().min(1).describe('A short, unique id, e.g. "checkout". Becomes the filename.'),
        name: z.string().min(1).describe("The display name shown on the canvas."),
        html: z
          .string()
          .min(1)
          .describe("The complete, standalone HTML document for the new artboard."),
        x: z.number().default(0).describe("Canvas x position."),
        y: z.number().default(0).describe("Canvas y position."),
        width: z.number().positive().default(480).describe("Canvas width in pixels."),
        height: z.number().positive().default(640).describe("Canvas height in pixels."),
      },
    },
    async ({ id, name, html, x, y, width, height }) => {
      const entry = await createArtboard(folder, { id, name, html, x, y, width, height });
      return {
        content: [
          { type: "text" as const, text: `Created artboard "${entry.id}" at ${entry.file}.` },
        ],
      };
    }
  );
}
