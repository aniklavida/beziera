import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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

test("the server lists exactly this card's five tools", async () => {
  const root = await makeDesignFolder();
  await withConnectedClient(root, async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "create_artboard",
      "link_artboards",
      "list_artboards",
      "read_artboard",
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
