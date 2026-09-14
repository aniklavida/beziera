import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { isMainModule } from "./is-main-module.js";

test("isMainModule is true for the running script's own import.meta.url", () => {
  // This very test file, executed by node --test, satisfies the check
  // against its own compiled module URL — the ordinary, non-symlinked case.
  assert.equal(isMainModule(import.meta.url), true);
});

test("isMainModule is false for an unrelated URL", () => {
  assert.equal(isMainModule("file:///not/the/running/script.js"), false);
});

test("isMainModule is false when process.argv[1] cannot be resolved", () => {
  const original = process.argv[1];
  process.argv[1] = "/definitely/does/not/exist/anywhere.js";
  try {
    assert.equal(isMainModule(import.meta.url), false);
  } finally {
    process.argv[1] = original;
  }
});

/**
 * The case this function exists for: a real child process, launched through
 * a symlink to its actual file — precisely the shape of `node_modules/.bin/x`,
 * which is how `npx` and every plain `node_modules/.bin` invocation runs a
 * published package's bin. The naive `import.meta.url === file://${argv[1]}`
 * check is provably false here (see this function's own module comment);
 * this proves the fixed version is provably true.
 */
test("isMainModule is true when the script is invoked through a symlink to itself, not its real path", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-is-main-module-test-"));
  const realFile = path.join(dir, "real-entry.mjs");
  const symlinkFile = path.join(dir, "linked-entry.mjs");

  const isMainModuleUrl = new URL("./is-main-module.js", import.meta.url).href;
  await fs.writeFile(
    realFile,
    `import { isMainModule } from ${JSON.stringify(isMainModuleUrl)};\n` +
      `console.log(JSON.stringify({ isMain: isMainModule(import.meta.url) }));\n`,
    "utf8"
  );
  await fs.symlink(realFile, symlinkFile);

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [symlinkFile], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString("utf8")));
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `exit ${code}`))));
  });

  assert.deepEqual(JSON.parse(stdout.trim()), { isMain: true });
});
