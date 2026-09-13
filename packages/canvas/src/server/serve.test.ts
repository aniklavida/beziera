import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { openDesignFolder } from "@beziera/core";
import { createCanvasHttpServer, injectMarkAgent } from "./serve.js";

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

test("GET /artboards/<file> serves the artboard with the mark agent injected, for a registered artboard", async () => {
  const root = await makeDesignFolder();
  await withServer(root, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/artboards/login.html`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /id="go"/); // the artboard's own content is untouched
    assert.match(body, /window\.__BEZIERA_ARTBOARD_ID__="login";/);
    assert.match(body, /<script src="\/mark-agent\.js">/);
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
