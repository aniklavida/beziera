import { openDesignFolder } from "@beziera/core";
import { createCanvasHttpServer } from "./serve.js";

export interface CanvasServerHandle {
  readonly url: string;
  close(): Promise<void>;
}

const DEFAULT_PORT = 4477;

/**
 * Start the canvas server for a design folder. Binds to 127.0.0.1 only —
 * the canvas is a local tool, not a hosted one.
 */
export async function startCanvasServer(
  designFolderPath: string,
  port: number = DEFAULT_PORT
): Promise<CanvasServerHandle> {
  const folder = await openDesignFolder(designFolderPath);
  const httpServer = createCanvasHttpServer(folder);

  await new Promise<void>((resolve) => httpServer.listen(port, "127.0.0.1", resolve));

  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://127.0.0.1:${actualPort}`;

  return {
    url,
    async close() {
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve()))
      );
    },
  };
}

async function main(): Promise<void> {
  const folderArg = process.argv[2] ?? process.cwd();
  const portArg = process.argv[3] ? Number(process.argv[3]) : undefined;
  const server = await startCanvasServer(folderArg, portArg);
  console.log(`Beziera canvas running at ${server.url}`);
  console.log(`Design folder: ${folderArg}`);
}

// Only run when this file is executed directly (`node dist/server/index.js <folder>`),
// not when imported as a library from the CLI or elsewhere.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
