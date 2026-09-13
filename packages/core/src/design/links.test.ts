import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDesignFolder } from "./folder.js";
import { readDesignJson } from "./design-json.js";
import { linkArtboards } from "./links.js";

async function makeDesignFolder(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-core-links-test-"));
  await fs.mkdir(path.join(root, "artboards"), { recursive: true });
  for (const id of ["login", "dashboard"]) {
    await fs.writeFile(path.join(root, "artboards", `${id}.html`), `<html>${id}</html>`, "utf8");
  }
  await fs.writeFile(
    path.join(root, "design.json"),
    JSON.stringify(
      {
        name: "Test design",
        artboards: [
          { id: "login", file: "artboards/login.html", name: "Sign in", x: 0, y: 0, width: 1, height: 1 },
          { id: "dashboard", file: "artboards/dashboard.html", name: "Dashboard", x: 0, y: 0, width: 1, height: 1 },
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

test("linkArtboards records a link in design.json", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  await linkArtboards(folder, "login", "dashboard");

  const design = await readDesignJson(path.join(root, "design.json"));
  assert.deepEqual(design.links, [{ from: "login", to: "dashboard" }]);
});

test("linkArtboards is a no-op if the same link already exists", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  await linkArtboards(folder, "login", "dashboard");
  await linkArtboards(folder, "login", "dashboard");

  const design = await readDesignJson(path.join(root, "design.json"));
  assert.equal(design.links.length, 1);
});

test("linkArtboards rejects an unknown source or target id", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  await assert.rejects(() => linkArtboards(folder, "nonexistent", "dashboard"));
  await assert.rejects(() => linkArtboards(folder, "login", "nonexistent"));
});

test("linkArtboards rejects linking an artboard to itself", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  await assert.rejects(() => linkArtboards(folder, "login", "login"));
});
