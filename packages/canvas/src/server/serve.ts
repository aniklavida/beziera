import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readDesignJson,
  resolveInsideFolder,
  type DesignFolder,
} from "@beziera/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** The canvas UI's static assets, shipped alongside the compiled server. */
const WEB_DIR = path.resolve(__dirname, "../../web");

const STATIC_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const ARTBOARD_CONTENT_TYPE = "text/html; charset=utf-8";

async function serveFile(
  res: ServerResponse,
  filePath: string,
  contentType: string
): Promise<void> {
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function forbidden(res: ServerResponse): void {
  res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Forbidden");
}

/**
 * Create the canvas HTTP server.
 *
 * It serves three things, and nothing else:
 *  - `/api/design`      the current design.json, as JSON
 *  - `/artboards/*`      the design folder's real artboard HTML files
 *  - everything else     the canvas UI's static assets (index.html, canvas.js, style.css)
 *
 * The design folder is the only thing on disk this server can reach — every
 * artboard path is resolved through resolveInsideFolder, which rejects a
 * path that would escape it. The caller is responsible for binding this
 * server to localhost only.
 */
export function createCanvasHttpServer(folder: DesignFolder): Server {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/api/design") {
      try {
        const design = await readDesignJson(folder.designJsonPath);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-cache",
        });
        res.end(JSON.stringify(design));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Failed to read design.json: ${(err as Error).message}`);
      }
      return;
    }

    if (pathname.startsWith("/artboards/")) {
      const relative = pathname.slice(1); // "artboards/login.html"
      let absolute: string;
      try {
        absolute = resolveInsideFolder(folder, relative);
      } catch {
        forbidden(res);
        return;
      }
      await serveFile(res, absolute, ARTBOARD_CONTENT_TYPE);
      return;
    }

    const staticPath = pathname === "/" ? "/index.html" : pathname;
    const ext = path.extname(staticPath);
    const contentType = STATIC_CONTENT_TYPES[ext];
    if (!contentType) {
      notFound(res);
      return;
    }

    const resolvedStatic = path.resolve(WEB_DIR, `.${staticPath}`);
    const webDirWithSep = WEB_DIR.endsWith(path.sep) ? WEB_DIR : WEB_DIR + path.sep;
    if (resolvedStatic !== WEB_DIR && !resolvedStatic.startsWith(webDirWithSep)) {
      forbidden(res);
      return;
    }
    await serveFile(res, resolvedStatic, contentType);
  });
}
