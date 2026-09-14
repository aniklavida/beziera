#!/usr/bin/env node
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openDesignFolder, closeBrowser, isMainModule, type DesignFolder } from "@beziera/core";
import { registerListArtboardsTool } from "./tools/list-artboards.js";
import { registerReadArtboardTool } from "./tools/read-artboard.js";
import { registerWriteArtboardTool } from "./tools/write-artboard.js";
import { registerCreateArtboardTool } from "./tools/create-artboard.js";
import { registerLinkArtboardsTool } from "./tools/link-artboards.js";
import { registerScreenshotArtboardTool } from "./tools/screenshot-artboard.js";
import { registerGetPendingMarksTool } from "./tools/get-pending-marks.js";
import { registerClearMarksTool } from "./tools/clear-marks.js";

/**
 * Build the Beziera MCP server for one design folder.
 *
 * One server instance is bound to one design folder for its whole lifetime —
 * the same folder the canvas is pointed at. The design folder is the only
 * channel between the two; nothing here talks to the canvas directly.
 *
 * Eight tools — the complete v1 surface: list_artboards, read_artboard,
 * write_artboard, create_artboard, link_artboards, screenshot_artboard,
 * get_pending_marks and clear_marks. There is no tool to create a mark —
 * a mark always starts as a click on the canvas, not a call from the agent.
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
  registerGetPendingMarksTool(server, folder);
  registerClearMarksTool(server, folder);

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
// or via the `beziera-mcp` bin — including through npm's bin symlink, which
// isMainModule handles correctly and a plain import.meta.url comparison
// does not; see its own comment), not when imported as a library for tests.
if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    // stdout is the JSON-RPC channel for this transport — startup failures
    // must go to stderr, never stdout.
    console.error(err);
    process.exitCode = 1;
  });
}
