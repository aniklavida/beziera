import { test } from "node:test";
import assert from "node:assert/strict";
assert.equal(1, 2, "INTENTIONAL BREAK FOR CI");
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openDesignFolder, addMark } from "@beziera/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, "server.js");

/**
 * Build a throwaway design folder — login, dashboard and settings, mirroring
 * the shape of examples/ without touching the repository's own example.
 */
async function makeDesignFolder(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-mcp-test-"));
  await fs.mkdir(path.join(root, "artboards"), { recursive: true });
  for (const id of ["login", "dashboard", "settings"]) {
    await fs.writeFile(path.join(root, "artboards", `${id}.html`), `<!doctype html><html><body>${id}</body></html>`, "utf8");
  }
  await fs.writeFile(
    path.join(root, "design.json"),
    JSON.stringify(
      {
        name: "Test design",
        artboards: [
          { id: "login", file: "artboards/login.html", name: "Sign in", x: 0, y: 0, width: 480, height: 640 },
          { id: "dashboard", file: "artboards/dashboard.html", name: "Dashboard", x: 640, y: 0, width: 1160, height: 760 },
          { id: "settings", file: "artboards/settings.html", name: "Settings", x: 2000, y: 0, width: 560, height: 700 },
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

/**
 * Add a mark to a design folder exactly the way the canvas does (there is
 * no MCP tool for creating one — get_pending_marks and clear_marks are the
 * whole MCP surface for marks, so a test of them has to seed marks.json
 * some other way).
 */
async function seedMark(root: string, artboardId: string, comment: string): Promise<string> {
  const folder = await openDesignFolder(root);
  const mark = await addMark(folder, {
    artboardId,
    element: { selector: "body > button#go", tag: "button", id: "go", classes: [], text: "Go" },
    comment,
  });
  return mark.id;
}

/** Connect a real MCP client to the built server over stdio, for one test. */
async function withConnectedClient(
  designFolder: string,
  run: (client: Client) => Promise<void>
): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, designFolder],
  });
  const client = new Client({ name: "beziera-mcp-test-client", version: "0.0.1" });
  await client.connect(transport);
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const first = (result.content as Array<{ type: string; text?: string }>)[0];
  assert.equal(first?.type, "text");
  return first.text ?? "";
}

test("the server lists all eight tools of the v1 surface", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "clear_marks",
      "create_artboard",
      "get_pending_marks",
      "link_artboards",
      "list_artboards",
      "read_artboard",
      "screenshot_artboard",
      "write_artboard",
    ]);
  });
});

test("list_artboards reports the example's three artboards", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const result = await client.callTool({ name: "list_artboards", arguments: {} });
    const payload = JSON.parse(textOf(result));
    assert.equal(payload.artboards.length, 3);
    assert.deepEqual(
      payload.artboards.map((a: { id: string }) => a.id).sort(),
      ["dashboard", "login", "settings"]
    );
  });
});

test("read_artboard returns one artboard's HTML", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const result = await client.callTool({ name: "read_artboard", arguments: { id: "login" } });
    assert.match(textOf(result), /login/);
  });
});

test("create_artboard then write_artboard round-trip through the same file", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const created = await client.callTool({
      name: "create_artboard",
      arguments: {
        id: "checkout",
        name: "Checkout",
        html: "<!doctype html><html><body>v1</body></html>",
        x: 10,
        y: 10,
        width: 400,
        height: 500,
      },
    });
    assert.equal(created.isError, undefined);

    const written = await client.callTool({
      name: "write_artboard",
      arguments: { id: "checkout", html: "<!doctype html><html><body>v2</body></html>" },
    });
    assert.equal(written.isError, undefined);

    const read = await client.callTool({ name: "read_artboard", arguments: { id: "checkout" } });
    assert.match(textOf(read), /v2/);

    const list = await client.callTool({ name: "list_artboards", arguments: {} });
    const payload = JSON.parse(textOf(list));
    assert.ok(payload.artboards.some((a: { id: string }) => a.id === "checkout"));
  });
});

test("link_artboards records a link the canvas schema already defines", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const linked = await client.callTool({
      name: "link_artboards",
      arguments: { from: "login", to: "dashboard" },
    });
    assert.equal(linked.isError, undefined);

    const list = await client.callTool({ name: "list_artboards", arguments: {} });
    const payload = JSON.parse(textOf(list));
    assert.deepEqual(payload.links, [{ from: "login", to: "dashboard" }]);
  });
});

test("create_artboard refuses an id crafted to escape the design folder", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const result = await client.callTool({
      name: "create_artboard",
      arguments: { id: "../../evil", name: "evil", html: "<html>evil</html>" },
    });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /escapes design folder/);

    // Confirm nothing was actually written outside the design folder.
    const escapedPath = path.resolve(root, "..", "..", "evil.html");
    await assert.rejects(() => fs.access(escapedPath));
  });
});

test("write_artboard and read_artboard reject an unknown id", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const read = await client.callTool({ name: "read_artboard", arguments: { id: "nonexistent" } });
    assert.equal(read.isError, true);

    const written = await client.callTool({
      name: "write_artboard",
      arguments: { id: "nonexistent", html: "<html></html>" },
    });
    assert.equal(written.isError, true);
  });
});

function imageOf(result: Awaited<ReturnType<Client["callTool"]>>): { data: string; mimeType: string } {
  const image = (result.content as Array<{ type: string; data?: string; mimeType?: string }>).find(
    (block) => block.type === "image"
  );
  assert.ok(image, "expected an image content block");
  assert.equal(image.mimeType, "image/png");
  return { data: image.data ?? "", mimeType: image.mimeType ?? "" };
}

/** Like textOf, but for a tool (e.g. screenshot_artboard) whose text block isn't first. */
function textBlockOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const text = (result.content as Array<{ type: string; text?: string }>).find(
    (block) => block.type === "text"
  );
  assert.ok(text, "expected a text content block");
  return text.text ?? "";
}

test("screenshot_artboard returns a real, correctly sized PNG at the desktop viewport", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const result = await client.callTool({ name: "screenshot_artboard", arguments: { id: "login" } });
    assert.equal(result.isError, undefined);

    const image = imageOf(result);
    const png = Buffer.from(image.data, "base64");
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "must be a real PNG");
    assert.ok(png.length > 1_000, `expected a non-trivial image, got ${png.length} bytes`);

    const width = png.readUInt32BE(16);
    assert.equal(width, 1280, "default viewport is desktop, 1280px wide");

    const summary = textBlockOf(result);
    assert.match(summary, /desktop viewport: 1280x\d+px/);
    assert.match(summary, /\d+ms/);
  });
});

test("screenshot_artboard honours the mobile viewport", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const result = await client.callTool({
      name: "screenshot_artboard",
      arguments: { id: "login", viewport: "mobile" },
    });
    assert.equal(result.isError, undefined);

    const png = Buffer.from(imageOf(result).data, "base64");
    const width = png.readUInt32BE(16);
    assert.equal(width, 390, "mobile viewport is 390px wide");
  });
});

test("screenshot_artboard rejects an unknown artboard id", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const result = await client.callTool({
      name: "screenshot_artboard",
      arguments: { id: "nonexistent" },
    });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /Unknown or missing artboard/);
  });
});

test("screenshot_artboard is fast enough to call every turn, and the server leaves no process behind", async () => {
  const root = await makeDesignFolder();
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER_ENTRY, root] });
  const client = new Client({ name: "beziera-mcp-test-client", version: "0.0.1" });
  await client.connect(transport);

  const started = Date.now();
  const result = await client.callTool({ name: "screenshot_artboard", arguments: { id: "dashboard" } });
  const elapsedMs = Date.now() - started;
  assert.equal(result.isError, undefined);
  // Generous bound for a cold-process capture (browser launch included) on
  // a loaded CI machine — this is the number that matters: slow enough to
  // skip is the failure mode, not "not literally instant".
  assert.ok(elapsedMs < 10_000, `cold capture took ${elapsedMs}ms, expected well under 10s`);

  // The MCP SDK's transport type doesn't publish the child process, but the
  // Node child_process handle is reachable off it for this one check: after
  // the client closes, the server process must exit on its own rather than
  // being kept alive by a leaked Chromium child.
  const childProcess = (transport as unknown as { _process?: { pid?: number } })._process;
  const pid = childProcess?.pid;
  await client.close();

  if (pid !== undefined) {
    const exitedInTime = await new Promise<boolean>((resolve) => {
      const deadline = Date.now() + 5_000;
      const poll = (): void => {
        try {
          process.kill(pid, 0);
        } catch {
          resolve(true);
          return;
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(poll, 100);
      };
      poll();
    });
    assert.ok(exitedInTime, "the server process must exit on its own after the client disconnects");
  }
});

test("get_pending_marks returns an empty queue for a design folder with no marks.json yet", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const result = await client.callTool({ name: "get_pending_marks", arguments: {} });
    assert.equal(result.isError, undefined);
    const payload = JSON.parse(textOf(result));
    assert.deepEqual(payload.marks, []);
  });
});

test("get_pending_marks reports marks left on the canvas, with a stable element reference", async () => {
  const root = await makeDesignFolder();
  await seedMark(root, "login", "The button is too small");

  await withConnectedClient(root, async (client) => {
    const result = await client.callTool({ name: "get_pending_marks", arguments: {} });
    const payload = JSON.parse(textOf(result));

    assert.equal(payload.marks.length, 1);
    const [mark] = payload.marks;
    assert.equal(mark.artboardId, "login");
    assert.equal(mark.comment, "The button is too small");
    assert.equal(mark.status, "pending");
    assert.equal(mark.element.selector, "body > button#go");
    assert.equal(mark.element.tag, "button");
  });
});

test("get_pending_marks filters by artboardId when given one", async () => {
  const root = await makeDesignFolder();
  await seedMark(root, "login", "On the login screen");
  await seedMark(root, "dashboard", "On the dashboard");

  await withConnectedClient(root, async (client) => {
    const result = await client.callTool({
      name: "get_pending_marks",
      arguments: { artboardId: "dashboard" },
    });
    const payload = JSON.parse(textOf(result));
    assert.equal(payload.marks.length, 1);
    assert.equal(payload.marks[0].comment, "On the dashboard");
  });
});

test("clear_marks with no ids clears every pending mark, and get_pending_marks confirms it", async () => {
  const root = await makeDesignFolder();
  await seedMark(root, "login", "First");
  await seedMark(root, "login", "Second");

  await withConnectedClient(root, async (client) => {
    const cleared = await client.callTool({ name: "clear_marks", arguments: {} });
    assert.equal(cleared.isError, undefined);
    assert.match(textOf(cleared), /Cleared 2 marks/);

    const after = await client.callTool({ name: "get_pending_marks", arguments: {} });
    assert.deepEqual(JSON.parse(textOf(after)).marks, []);
  });
});

test("clear_marks with a specific id clears only that mark", async () => {
  const root = await makeDesignFolder();
  const firstId = await seedMark(root, "login", "First");
  await seedMark(root, "login", "Second");

  await withConnectedClient(root, async (client) => {
    const cleared = await client.callTool({ name: "clear_marks", arguments: { ids: [firstId] } });
    assert.match(textOf(cleared), /Cleared 1 mark\./);

    const after = await client.callTool({ name: "get_pending_marks", arguments: {} });
    const payload = JSON.parse(textOf(after));
    assert.equal(payload.marks.length, 1);
    assert.equal(payload.marks[0].comment, "Second");
  });
});

test("the full mark round trip: leave a mark, get it pending, clear it, confirm it is gone", async () => {
  const root = await makeDesignFolder();
  const markId = await seedMark(root, "dashboard", "Sidebar overlaps the content on mobile");

  await withConnectedClient(root, async (client) => {
    const pendingBefore = JSON.parse(
      textOf(await client.callTool({ name: "get_pending_marks", arguments: {} }))
    );
    assert.equal(pendingBefore.marks.length, 1);
    assert.equal(pendingBefore.marks[0].id, markId);

    await client.callTool({ name: "clear_marks", arguments: { ids: [markId] } });

    const pendingAfter = JSON.parse(
      textOf(await client.callTool({ name: "get_pending_marks", arguments: {} }))
    );
    assert.deepEqual(pendingAfter.marks, []);
  });
});
