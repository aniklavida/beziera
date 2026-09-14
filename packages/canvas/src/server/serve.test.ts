import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { openDesignFolder, closeBrowser } from "@beziera/core";
import { createCanvasHttpServer, injectMarkAgent, injectPreviewAgent } from "./serve.js";

// Export tests below launch the same shared Chromium instance
// screenshot_artboard uses (via @beziera/core). Closing it once, after every
// test in this file has run, avoids leaving that child process behind —
// the same concern mcp/server.test.ts already covers for the MCP server.
test.after(async () => {
  await closeBrowser();
});

async function makeDesignFolder(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-canvas-test-"));
  await fs.mkdir(path.join(root, "artboards"), { recursive: true });
  await fs.writeFile(
    path.join(root, "artboards", "login.html"),
    "<!doctype html><html><body><button id=\"go\">Go</button></body></html>",
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "design.json"),
    JSON.stringify(
      {
        name: "Test design",
        artboards: [
          { id: "login", file: "artboards/login.html", name: "Sign in", x: 0, y: 0, width: 480, height: 640 },
        ],
        links: [],
      },
      null,
      2
    ),
    "utf8"
  );
  return root;
}

/** Start createCanvasHttpServer's HTTP server directly on an ephemeral port, without the file watcher or socket — this is an HTTP-shape test, not a full startCanvasServer integration test. */
async function withServer(root: string, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const folder = await openDesignFolder(root);
  const server = createCanvasHttpServer(folder);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test("injectMarkAgent inserts the agent script and the artboard id before </body>", () => {
  const html = "<!doctype html><html><body><h1>Hi</h1></body></html>";
  const injected = injectMarkAgent(html, "login");

  assert.match(injected, /window\.__BEZIERA_ARTBOARD_ID__="login";/);
  assert.match(injected, /<script src="\/mark-agent\.js"><\/script>/);
  // Must land before </body>, not after it.
  assert.ok(injected.indexOf("mark-agent.js") < injected.indexOf("</body>"));
});

test("injectMarkAgent appends the script when the document has no </body>", () => {
  const html = "<div>no real document here</div>";
  const injected = injectMarkAgent(html, "fragment");

  assert.match(injected, /window\.__BEZIERA_ARTBOARD_ID__="fragment";/);
  assert.ok(injected.startsWith(html));
});

test("injectPreviewAgent inserts the preview agent's script tag before </body>", () => {
  const html = "<!doctype html><html><body><h1>Hi</h1></body></html>";
  const injected = injectPreviewAgent(html);

  assert.match(injected, /<script src="\/preview-agent\.js"><\/script>/);
  assert.ok(injected.indexOf("preview-agent.js") < injected.indexOf("</body>"));
});

test("injectPreviewAgent appends the script when the document has no </body>", () => {
  const html = "<div>no real document here</div>";
  const injected = injectPreviewAgent(html);

  assert.match(injected, /<script src="\/preview-agent\.js">/);
  assert.ok(injected.startsWith(html));
});

test("GET /artboards/<file> serves the artboard with both agents injected, for a registered artboard", async () => {
  const root = await makeDesignFolder();
  await withServer(root, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/artboards/login.html`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /id="go"/); // the artboard's own content is untouched
    assert.match(body, /window\.__BEZIERA_ARTBOARD_ID__="login";/);
    assert.match(body, /<script src="\/mark-agent\.js">/);
    assert.match(body, /<script src="\/preview-agent\.js">/);
  });
});

test("GET /artboards/<file> carries a Content-Security-Policy that closes off the network", async () => {
  const root = await makeDesignFolder();
  await withServer(root, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/artboards/login.html`);
    const csp = response.headers.get("Content-Security-Policy");

    assert.ok(csp, "expected every artboard response to carry a Content-Security-Policy header");
    // connect-src is what actually matters here — it is the directive that
    // covers fetch, XHR, EventSource and WebSocket alike. A real browser
    // exercise of this (does a WebSocket from inside the iframe actually
    // fail to connect) lives in preview.browser.test.ts; this just pins the
    // header the browser test depends on actually being sent.
    assert.match(csp!, /connect-src 'none'/);
  });
});

test("GET /api/marks returns an empty queue before any mark exists", async () => {
  const root = await makeDesignFolder();
  await withServer(root, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/marks`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload, { marks: [] });
  });
});

test("POST /api/marks then GET /api/marks round-trips a mark left on the canvas", async () => {
  const root = await makeDesignFolder();
  await withServer(root, async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/marks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artboardId: "login",
        element: { selector: "body > button#go", tag: "button", id: "go", classes: [], text: "Go" },
        comment: "This button should be centred",
      }),
    });
    assert.equal(created.status, 201);
    const mark = (await created.json()) as { id: string; status: string; comment: string };
    assert.equal(mark.status, "pending");
    assert.equal(mark.comment, "This button should be centred");

    const listed = await fetch(`${baseUrl}/api/marks`);
    const payload = (await listed.json()) as { marks: Array<{ id: string }> };
    assert.equal(payload.marks.length, 1);
    assert.equal(payload.marks[0].id, mark.id);

    // And it is really on disk, in the design folder marks.json describes —
    // not only reachable through this one server instance.
    const onDisk = JSON.parse(await fs.readFile(path.join(root, "marks.json"), "utf8"));
    assert.equal(onDisk.marks.length, 1);
  });
});

test("POST /api/marks rejects a body missing a required field", async () => {
  const root = await makeDesignFolder();
  await withServer(root, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/marks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artboardId: "login" /* no element, no comment */ }),
    });
    assert.equal(response.status, 400);

    const listed = await fetch(`${baseUrl}/api/marks`);
    assert.deepEqual(await listed.json(), { marks: [] });
  });
});

test("/api/marks rejects methods other than GET and POST", async () => {
  const root = await makeDesignFolder();
  await withServer(root, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/marks`, { method: "DELETE" });
    assert.equal(response.status, 405);
  });
});

// A real, valid 1x1 PNG, referenced by a local <img> — the export tests
// below need a design folder with an actual local asset to prove the
// self-contained HTML export inlines it, not just that it copies the HTML.
const LOCAL_IMAGE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function makeDesignFolderWithLocalImage(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-canvas-export-test-"));
  await fs.mkdir(path.join(root, "artboards"), { recursive: true });
  await fs.writeFile(path.join(root, "artboards", "logo.png"), LOCAL_IMAGE_PNG);
  await fs.writeFile(
    path.join(root, "artboards", "login.html"),
    '<!doctype html><html><body><img src="logo.png" alt="logo"></body></html>',
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "design.json"),
    JSON.stringify(
      {
        name: "Test design",
        artboards: [
          { id: "login", file: "artboards/login.html", name: "Sign in", x: 0, y: 0, width: 480, height: 640 },
        ],
        links: [],
      },
      null,
      2
    ),
    "utf8"
  );
  return root;
}

test("GET /export/<id>/png renders the artboard and returns a downloadable PNG", async () => {
  const root = await makeDesignFolderWithLocalImage();
  await withServer(root, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/export/login/png`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/png");
    assert.match(response.headers.get("Content-Disposition") ?? "", /attachment; filename="login\.png"/);

    const png = Buffer.from(await response.arrayBuffer());
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "must be a real PNG");

    // Also persisted to exports/ inside the design folder, not only streamed
    // back over HTTP — a durable local copy the user can find again.
    const onDisk = await fs.readFile(path.join(root, "exports", "login.png"));
    assert.deepEqual(onDisk, png);
  });
});

test("GET /export/<id>/html returns a self-contained document with the local image inlined", async () => {
  const root = await makeDesignFolderWithLocalImage();
  await withServer(root, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/export/login/html`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type") ?? "", /text\/html/);
    assert.match(response.headers.get("Content-Disposition") ?? "", /attachment; filename="login\.html"/);

    const html = await response.text();
    assert.ok(
      html.includes(`data:image/png;base64,${LOCAL_IMAGE_PNG.toString("base64")}`),
      "the local <img> must be inlined as a data URI"
    );
    assert.ok(!html.includes('src="logo.png"'), "the original relative src must not remain");

    const onDisk = await fs.readFile(path.join(root, "exports", "login.html"), "utf8");
    assert.equal(onDisk, html);
  });
});

test("GET /export/<unknown>/png and /export/<unknown>/html both 404", async () => {
  const root = await makeDesignFolderWithLocalImage();
  await withServer(root, async (baseUrl) => {
    const png = await fetch(`${baseUrl}/export/nonexistent/png`);
    assert.equal(png.status, 404);
    const html = await fetch(`${baseUrl}/export/nonexistent/html`);
    assert.equal(html.status, 404);
  });
});

test("GET /export/<id>/<unsupported-format> 404s rather than guessing", async () => {
  const root = await makeDesignFolderWithLocalImage();
  await withServer(root, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/export/login/pdf`);
    assert.equal(response.status, 404);
  });
});

test("/export/<id>/png rejects methods other than GET", async () => {
  const root = await makeDesignFolderWithLocalImage();
  await withServer(root, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/export/login/png`, { method: "POST" });
    assert.equal(response.status, 405);
  });
});
