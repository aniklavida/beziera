import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { initDesignFolder, isPathInsideFolder, openDesignFolder } from "./folder.js";

test("initDesignFolder creates artboards/ and a minimal design.json, then opens cleanly", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-init-folder-test-"));
  const target = path.join(parent, "new-design");

  const folder = await initDesignFolder(target);

  assert.equal(folder.root, target);
  const stat = await fs.stat(path.join(target, "artboards"));
  assert.ok(stat.isDirectory());

  const design = JSON.parse(await fs.readFile(path.join(target, "design.json"), "utf8"));
  assert.deepEqual(design, { name: "new-design", artboards: [], links: [] });

  // And it really is a valid design folder by the same rules any other caller uses.
  await assert.doesNotReject(openDesignFolder(target));
});

test("initDesignFolder accepts an explicit name instead of deriving one from the path", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-init-folder-test-"));
  const target = path.join(parent, "folder-basename-not-used");

  const folder = await initDesignFolder(target, "My Real Design Name");
  const design = JSON.parse(await fs.readFile(path.join(folder.root, "design.json"), "utf8"));
  assert.equal(design.name, "My Real Design Name");
});

test("initDesignFolder refuses to touch a path that already exists", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-init-folder-test-"));
  const target = path.join(parent, "already-here");
  await fs.mkdir(target); // some unrelated existing directory

  await assert.rejects(initDesignFolder(target), /Refusing to initialise/);

  // And it must not have been silently turned into a design folder anyway.
  await assert.rejects(fs.access(path.join(target, "design.json")));
});

test("isPathInsideFolder accepts the root itself and any path under it, rejects a sibling", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-init-folder-test-"));
  const target = path.join(parent, "design");
  const folder = await initDesignFolder(target);

  assert.equal(isPathInsideFolder(folder, folder.root), true);
  assert.equal(isPathInsideFolder(folder, path.join(folder.root, "artboards", "x.html")), true);
  assert.equal(isPathInsideFolder(folder, path.join(parent, "design-sibling", "x.html")), false);
  assert.equal(isPathInsideFolder(folder, path.join(parent, "designer")), false);
});
