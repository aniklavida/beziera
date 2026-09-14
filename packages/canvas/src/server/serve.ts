import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readDesignJson,
  resolveInsideFolder,
  readMarksJson,
  addMark,
  NewMarkSchema,
  getBrowser,
  captureHtmlFile,
  inlineArtboardHtml,
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

/** Find the id design.json records for a given artboard file, e.g. "artboards/login.html". */
async function findArtboardIdForFile(
  folder: DesignFolder,
  relativeFile: string
): Promise<string | null> {
  try {
    const design = await readDesignJson(folder.designJsonPath);
    return design.artboards.find((a) => a.file === relativeFile)?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Inject mark-agent.js into an artboard's HTML before its closing </body>
 * tag (or append it if the document has none), along with one inline line
 * naming the artboard id. This is the only thing the canvas server changes
 * about an artboard's own HTML — the injected script runs inside the same
 * sandboxed iframe as the artboard itself (see artboard.js), so it is bound
 * by exactly the same "allow-scripts", opaque-origin restrictions.
 */
export function injectMarkAgent(html: string, artboardId: string): string {
  const snippet =
    `\n<script>window.__BEZIERA_ARTBOARD_ID__=${JSON.stringify(artboardId)};</script>\n` +
    `<script src="/mark-agent.js"></script>\n`;
  const closeBodyIndex = html.toLowerCase().lastIndexOf("</body>");
  if (closeBodyIndex === -1) {
    return html + snippet;
  }
  return html.slice(0, closeBodyIndex) + snippet + html.slice(closeBodyIndex);
}

/**
 * Inject preview-agent.js the same way injectMarkAgent injects mark-agent.js
 * — before </body>, or appended if there is none. Kept as its own function
 * and its own script tag rather than folded into mark-agent.js: marks and
 * animation replay are two unrelated jobs, and mark-agent.js's existing
 * tests already pin its exact output, which a second, unrelated concern
 * would only complicate.
 */
export function injectPreviewAgent(html: string): string {
  const snippet = `\n<script src="/preview-agent.js"></script>\n`;
  const closeBodyIndex = html.toLowerCase().lastIndexOf("</body>");
  if (closeBodyIndex === -1) {
    return html + snippet;
  }
  return html.slice(0, closeBodyIndex) + snippet + html.slice(closeBodyIndex);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length > 0 ? JSON.parse(raw) : {};
}

/**
 * GET returns the current marks.json (an empty queue if the file does not
 * exist yet — readMarksJson already tolerates that). POST appends one new
 * mark, which is how the canvas turns a click-and-comment into a row in
 * marks.json; there is no MCP tool for creating a mark, only for reading
 * and clearing one, since a mark always starts as a click on the canvas.
 */
async function handleMarksRoute(
  req: IncomingMessage,
  res: ServerResponse,
  folder: DesignFolder
): Promise<void> {
  if (req.method === "GET") {
    try {
      const marksFile = await readMarksJson(folder.marksJsonPath);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(JSON.stringify(marksFile));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Failed to read marks.json: ${(err as Error).message}`);
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const input = NewMarkSchema.parse(body);
      const mark = await addMark(folder, input);
      res.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(mark));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Invalid mark: ${(err as Error).message}`);
    }
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, POST" });
  res.end("Method not allowed");
}

/** Find one artboard's design.json entry by id, or null if no such artboard is registered. */
async function findArtboardById(
  folder: DesignFolder,
  id: string
): Promise<{ id: string; file: string } | null> {
  const design = await readDesignJson(folder.designJsonPath);
  return design.artboards.find((a) => a.id === id) ?? null;
}

/**
 * Every export is also written to `<design folder>/exports/`, alongside the
 * copy served as a download — a durable local record a user can find again
 * without re-clicking the button, in the one place this product ever writes
 * outside `artboards/`, `design.json` and `marks.json`. Never read back by
 * anything else here; re-exporting just overwrites the file with the
 * artboard's current state.
 */
async function persistExport(folder: DesignFolder, filename: string, body: Buffer): Promise<void> {
  const exportsDir = path.join(folder.root, "exports");
  await fs.mkdir(exportsDir, { recursive: true });
  await fs.writeFile(path.join(exportsDir, filename), body);
}

/**
 * `GET /export/<id>/png` and `GET /export/<id>/html` — the two export
 * formats v1 ships. PNG reuses the exact capture path `screenshot_artboard`
 * uses (same headless, network-blocked, sandboxed render, now shared through
 * `@beziera/core`); HTML inlines the artboard's local assets so the result
 * opens from disk with no other file and no network request. Both are
 * user-triggered from the canvas — there is no MCP tool for either, since
 * export is something a person does by clicking a button, not something an
 * agent calls mid-turn.
 */
async function handleExportRoute(
  res: ServerResponse,
  folder: DesignFolder,
  id: string,
  format: "png" | "html"
): Promise<void> {
  const artboard = await findArtboardById(folder, id);
  if (!artboard) {
    notFound(res);
    return;
  }

  let absolutePath: string;
  try {
    absolutePath = resolveInsideFolder(folder, artboard.file);
  } catch {
    notFound(res);
    return;
  }

  try {
    if (format === "png") {
      const browser = await getBrowser();
      const captured = await captureHtmlFile(browser, absolutePath);
      await persistExport(folder, `${id}.png`, captured.png);
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${id}.png"`,
        "Cache-Control": "no-cache",
      });
      res.end(captured.png);
    } else {
      const inlined = await inlineArtboardHtml(folder, absolutePath);
      const body = Buffer.from(inlined.html, "utf8");
      await persistExport(folder, `${id}.html`, body);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${id}.html"`,
        "Cache-Control": "no-cache",
      });
      res.end(body);
    }
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Export failed: ${(err as Error).message}`);
  }
}

/**
 * Content-Security-Policy applied to every artboard response — the same
 * "cannot reach the network" restriction the MCP server's screenshot
 * capture already enforces, applied here too so an artboard rendered live
 * in the canvas can't reach it either. `default-src 'none'` closes
 * everything by default; the directives after it name exactly what a
 * self-contained artboard (plus the two scripts this server injects into
 * it) actually uses — inline scripts and styles, the injected same-origin
 * scripts, and data:/blob: assets an artboard inlines rather than fetches.
 * `connect-src 'none'` is the one that matters most: it closes fetch, XHR,
 * EventSource and WebSocket alike, all of which a plain HTTP route block
 * (the mechanism capture.ts uses) cannot reach at all in a live browser tab.
 *
 * The iframe's sandbox deliberately omits `allow-same-origin`, so its
 * security origin is opaque and the `'self'` keyword could never match
 * inside it — this names the request's actual host explicitly instead,
 * which CSP matches against the resource's own URL regardless of that
 * opaque origin.
 */
function artboardContentSecurityPolicy(host: string | undefined): string {
  const ownOrigin = host ? `http://${host}` : "'none'";
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${ownOrigin}`,
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "connect-src 'none'",
  ].join("; ");
}

async function serveArtboardHtml(
  res: ServerResponse,
  filePath: string,
  artboardId: string,
  host: string | undefined
): Promise<void> {
  try {
    const html = await fs.readFile(filePath, "utf8");
    const withAgents = injectPreviewAgent(injectMarkAgent(html, artboardId));
    res.writeHead(200, {
      "Content-Type": ARTBOARD_CONTENT_TYPE,
      "Cache-Control": "no-cache",
      "Content-Security-Policy": artboardContentSecurityPolicy(host),
    });
    res.end(withAgents);
  } catch {
    notFound(res);
  }
}

/**
 * Serve an artboard file that design.json no longer (or does not yet)
 * register, unmodified apart from the same network-closing CSP every other
 * artboard response carries — this file still renders in the same
 * sandboxed iframe as a registered one, so it needs the same policy even
 * though it gets neither injected agent script.
 */
async function serveArtboardFileAsIs(
  res: ServerResponse,
  filePath: string,
  host: string | undefined
): Promise<void> {
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": ARTBOARD_CONTENT_TYPE,
      "Cache-Control": "no-cache",
      "Content-Security-Policy": artboardContentSecurityPolicy(host),
    });
    res.end(body);
  } catch {
    notFound(res);
  }
}

/**
 * Create the canvas HTTP server.
 *
 * It serves five things, and nothing else:
 *  - `/api/design`      the current design.json, as JSON
 *  - `/api/marks`        GET the current marks.json; POST a new mark from the canvas
 *  - `/artboards/*`      the design folder's real artboard HTML files, with
 *                        mark-agent.js injected so an artboard can be
 *                        clicked into a mark (see injectMarkAgent below),
 *                        and preview-agent.js so a "Replay" click can
 *                        restart its CSS animations (see injectPreviewAgent)
 *  - `/export/<id>/png`  and `/export/<id>/html` — download one artboard as
 *                        a screenshot or a self-contained HTML file (see
 *                        handleExportRoute below); also written to
 *                        `exports/` in the design folder
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

    if (pathname === "/api/marks") {
      await handleMarksRoute(req, res, folder);
      return;
    }

    if (pathname.startsWith("/export/")) {
      if (req.method !== "GET") {
        res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET" });
        res.end("Method not allowed");
        return;
      }
      const [id, format] = pathname.slice("/export/".length).split("/");
      if (!id || (format !== "png" && format !== "html")) {
        notFound(res);
        return;
      }
      await handleExportRoute(res, folder, decodeURIComponent(id), format);
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
      const artboardId = await findArtboardIdForFile(folder, relative);
      if (artboardId) {
        await serveArtboardHtml(res, absolute, artboardId, req.headers.host);
      } else {
        // Not (or no longer) registered in design.json — serve it as-is
        // rather than guess which artboard a mark on it would belong to.
        await serveArtboardFileAsIs(res, absolute, req.headers.host);
      }
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
