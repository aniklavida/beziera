import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listArtboards, readDesignJson, type DesignFolder } from "@beziera/core";

/**
 * `list_artboards` — the canvas state as the agent sees it: every artboard's
 * id, file, name, canvas position and size, whether its HTML file exists on
 * disk, and the recorded prototype links between artboards.
 */
export function registerListArtboardsTool(server: McpServer, folder: DesignFolder): void {
  server.registerTool(
    "list_artboards",
    {
      title: "List artboards",
      description:
        "List every artboard in this design folder: id, file, name, canvas position and size, and " +
        "whether its HTML file exists on disk — plus the recorded prototype links between artboards.",
      inputSchema: {},
    },
    async () => {
      const [artboards, design] = await Promise.all([
        listArtboards(folder),
        readDesignJson(folder.designJsonPath),
      ]);

      const payload = {
        name: design.name,
        artboards: artboards.map(({ absolutePath: _absolutePath, ...entry }) => entry),
        links: design.links,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    }
  );
}
