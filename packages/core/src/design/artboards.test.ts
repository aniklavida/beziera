import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDesignFolder } from "./folder.js";
import { readDesignJson, writeDesignJson } from "./design-json.js";
import { listArtboards, readArtboardHtml, writeArtboardHtml, createArtboard } from "./artboards.js";

/** Build a throwaway design folder on disk: artboards/login.html plus design.json. */
async function makeDesignFolder(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-core-test-"));
  await fs.mkdir(path.join(root, "artboards"), { recursive: true });
  await fs.writeFile(
    path.join(root, "artboards", "login.html"),
    "<!doctype html><html><body>login</body></html>",
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

test("listArtboards reports each entry cross-checked against disk", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  const artboards = await listArtboards(folder);

  assert.equal(artboards.length, 1);
  assert.equal(artboards[0].id, "login");
  assert.equal(artboards[0].exists, true);
});

test("readArtboardHtml returns the file's contents by id", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  const html = await readArtboardHtml(folder, "login");

  assert.match(html, /login/);
});

test("readArtboardHtml throws for an unknown id", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  await assert.rejects(() => readArtboardHtml(folder, "nonexistent"));
});

test("writeArtboardHtml replaces an existing artboard's file", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  await writeArtboardHtml(folder, "login", "<!doctype html><html><body>v2</body></html>");

  const html = await fs.readFile(path.join(root, "artboards", "login.html"), "utf8");
  assert.match(html, /v2/);
});

test("writeArtboardHtml throws for an unknown id", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  await assert.rejects(() => writeArtboardHtml(folder, "nonexistent", "<html></html>"));
});

test("writeArtboardHtml refuses a design.json entry whose file escapes the folder", async () => {
  const root = await makeDesignFolder();
  // Simulate a design.json that has been tampered with (or a future bug
  // elsewhere) rather than trusting that every recorded file is inside the
  // folder — resolveInsideFolder is what actually stops this.
  await writeDesignJson(path.join(root, "design.json"), {
    name: "Test design",
    artboards: [
      { id: "escapee", file: "../outside.html", name: "Escapee", x: 0, y: 0, width: 1, height: 1 },
    ],
    links: [],
  });
  const folder = await openDesignFolder(root);

  await assert.rejects(() => writeArtboardHtml(folder, "escapee", "<html></html>"), /escapes design folder/);
});

test("createArtboard writes the file and registers it in design.json", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  const entry = await createArtboard(folder, {
    id: "checkout",
    name: "Checkout",
    html: "<!doctype html><html><body>checkout</body></html>",
    x: 10,
    y: 20,
    width: 400,
    height: 500,
  });

  assert.equal(entry.file, "artboards/checkout.html");

  const html = await fs.readFile(path.join(root, "artboards", "checkout.html"), "utf8");
  assert.match(html, /checkout/);

  const design = await readDesignJson(path.join(root, "design.json"));
  assert.ok(design.artboards.some((a) => a.id === "checkout"));
});

test("createArtboard rejects an id that is already registered", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  await assert.rejects(() =>
    createArtboard(folder, { id: "login", name: "dup", html: "<html></html>", x: 0, y: 0, width: 1, height: 1 })
  );
});

test("createArtboard refuses an id that would escape the design folder", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  await assert.rejects(
    () =>
      createArtboard(folder, {
        id: "../../evil",
        name: "evil",
        html: "<html>evil</html>",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      }),
    /escapes design folder/
  );

  // And it must not have written anything outside the folder.
  const escapedPath = path.resolve(root, "..", "..", "evil.html");
  await assert.rejects(() => fs.access(escapedPath));
});
