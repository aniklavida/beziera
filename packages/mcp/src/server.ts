import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openDesignFolder, type DesignFolder } from "@beziera/core";
import { registerListArtboardsTool } from "./tools/list-artboards.js";
import { registerReadArtboardTool } from "./tools/read-artboard.js";

/**
 * Build the Beziera MCP server for one design folder.
 *
 * One server instance is bound to one design folder for its whole lifetime —
 * the same folder the canvas is pointed at. The design folder is the only
 * channel between the two; nothing here talks to the canvas directly.
 *
 * This commit adds the two read tools. write_artboard, create_artboard and
 * link_artboards follow in later commits; screenshot_artboard,
 * get_pending_marks and clear_marks are separate cards.
 */
export function createBezieraMcpServer(folder: DesignFolder): McpServer {
  const server = new McpServer({
    name: "beziera",
    version: "0.1.0",
  });

  registerListArtboardsTool(server, folder);
  registerReadArtboardTool(server, folder);

  return server;
}

async function main(): Promise<void> {
  const folderArg = process.argv[2] ?? process.cwd();
  const folder = await openDesignFolder(path.resolve(folderArg));
  const server = createBezieraMcpServer(folder);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run when this file is executed directly (`node dist/server.js <folder>`,
// or via the `beziera-mcp` bin), not when imported as a library for tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // stdout is the JSON-RPC channel for this transport — startup failures
    // must go to stderr, never stdout.
    console.error(err);
    process.exitCode = 1;
  });
}
