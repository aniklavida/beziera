import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openDesignFolder, type DesignFolder } from "@beziera/core";
import { registerListArtboardsTool } from "./tools/list-artboards.js";
import { registerReadArtboardTool } from "./tools/read-artboard.js";
import { registerWriteArtboardTool } from "./tools/write-artboard.js";
import { registerCreateArtboardTool } from "./tools/create-artboard.js";
import { registerLinkArtboardsTool } from "./tools/link-artboards.js";
import { registerScreenshotArtboardTool } from "./tools/screenshot-artboard.js";
import { closeBrowser } from "./render/browser.js";

/**
 * Build the Beziera MCP server for one design folder.
 *
 * One server instance is bound to one design folder for its whole lifetime —
 * the same folder the canvas is pointed at. The design folder is the only
 * channel between the two; nothing here talks to the canvas directly.
 *
 * Six tools: list_artboards, read_artboard, write_artboard, create_artboard,
 * link_artboards and screenshot_artboard. get_pending_marks and clear_marks
 * are a separate card.
 */
export function createBezieraMcpServer(folder: DesignFolder): McpServer {
  const server = new McpServer({
    name: "beziera",
    version: "0.1.0",
  });

  registerListArtboardsTool(server, folder);
  registerReadArtboardTool(server, folder);
  registerWriteArtboardTool(server, folder);
  registerCreateArtboardTool(server, folder);
  registerLinkArtboardsTool(server, folder);
  registerScreenshotArtboardTool(server, folder);

  return server;
}

async function main(): Promise<void> {
  const folderArg = process.argv[2] ?? process.cwd();
  const folder = await openDesignFolder(path.resolve(folderArg));
  const server = createBezieraMcpServer(folder);

  // screenshot_artboard may have launched a Chromium child process that
  // would otherwise hold this process's event loop open after the client
  // disconnects — ARCHITECTURE.md calls a leaked browser process the most
  // likely bug in this product. Closing it here is what lets a natural
  // process exit happen once stdio closes, and the signal handlers cover
  // the case where the client is killed rather than closed cleanly.
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    closeBrowser().catch((err: unknown) => console.error(err));
  };
  server.server.onclose = shutdown;
  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });

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
