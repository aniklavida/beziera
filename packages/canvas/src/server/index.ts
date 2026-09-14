#!/usr/bin/env node
import { openDesignFolder, watchDesignFolder, closeBrowser, isMainModule } from "@beziera/core";
import { createCanvasHttpServer } from "./serve.js";
import { CanvasSocket } from "./socket.js";

export interface CanvasServerHandle {
  readonly url: string;
  close(): Promise<void>;
}

const DEFAULT_PORT = 4477;

/**
 * Start the canvas server for a design folder. Binds to 127.0.0.1 only —
 * the canvas is a local tool, not a hosted one.
 *
 * Wires the file watcher straight to the socket: a change on disk becomes a
 * broadcast, and the one browser-side function that matters
 * (renderArtboards / reloadArtboardElement) decides what actually reloads.
 */
export async function startCanvasServer(
  designFolderPath: string,
  port: number = DEFAULT_PORT
): Promise<CanvasServerHandle> {
  const folder = await openDesignFolder(designFolderPath);
  const httpServer = createCanvasHttpServer(folder);
  const socket = new CanvasSocket(httpServer);
  const watcher = watchDesignFolder(folder, (change) => socket.broadcast(change));

  await new Promise<void>((resolve) => httpServer.listen(port, "127.0.0.1", resolve));

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://127.0.0.1:${actualPort}`;

  return {
    url,
    async close() {
      await watcher.close();
      await socket.close();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve()))
      );
      // A PNG export may have launched the same shared Chromium instance
      // screenshot_artboard uses (see @beziera/core's render/browser.ts).
      // Idempotent when no export ever ran, so this is safe to call
      // unconditionally rather than tracking whether one did.
      await closeBrowser();
    },
  };
}

async function main(): Promise<void> {
  const folderArg = process.argv[2] ?? process.cwd();
  const portArg = process.argv[3] ? Number(process.argv[3]) : undefined;
  const server = await startCanvasServer(folderArg, portArg);
  console.log(`Beziera canvas running at ${server.url}`);
  console.log(`Design folder: ${folderArg}`);

  // Closes the shared Chromium instance an export may have launched (see
  // startCanvasServer's close() above) before this process actually exits —
  // without this, Ctrl+C leaves that child process behind rather than
  // tearing it down through the one module responsible for its lifecycle.
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close().catch((err: unknown) => console.error(err));
  };
  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
}

// Only run when this file is executed directly (`node dist/server/index.js <folder>`,
// or via the `beziera-canvas` bin — including through npm's bin symlink, which
// isMainModule handles correctly and a plain import.meta.url comparison does
// not; see its own comment), not when imported as a library from the CLI or
// elsewhere — packages/cli imports startCanvasServer from this exact module,
// so a guard that fired on every import would start a second, argv-driven
// canvas server underneath the CLI's own one.
if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
