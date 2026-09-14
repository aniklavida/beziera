import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = path.resolve(__dirname, "index.js");

/**
 * Every one of this product's three `bin` entry points must start with a
 * `#!/usr/bin/env node` shebang. Without it, npm's own bin-linking still
 * happily creates `node_modules/.bin/beziera` (and `beziera-mcp`,
 * `beziera-canvas`) as an executable symlink — but invoking it (the way
 * `npx beziera` and the printed `npx --package=@beziera/mcp beziera-mcp`
 * registration both do) hands the file to the OS's default shell, not
 * Node, since nothing tells the OS which interpreter to use. Every other
 * test in this repository invokes these entry points via
 * `node dist/x.js <args>` directly, which never exercises that path — this
 * one exists because the clean-install check (`npm pack`, install the
 * tarball into a fresh temp HOME with a clean npm cache, run it) is what
 * actually caught the gap, and a shebang, once fixed, does not un-fix
 * itself, but a careless edit to one of these three files' first line could
 * still reintroduce it.
 */
test("running the CLI through a symlink to it — exactly what npm's own bin linking does — still runs main()", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-cli-symlink-test-"));
  const linkedEntry = path.join(dir, "beziera-via-symlink");
  await fs.symlink(CLI_ENTRY, linkedEntry);
  const designFolder = path.join(dir, "design");

  const child = spawn(process.execPath, [linkedEntry, designFolder, "--port", "0", "--no-open"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => lines.push(...chunk.toString("utf8").split("\n")));
  child.stderr.on("data", (chunk: Buffer) => lines.push(...chunk.toString("utf8").split("\n")));

  try {
    // If main() never ran (the bug isMainModule exists to fix), this times
    // out with no output at all rather than failing on a specific assertion
    // — which is exactly the silent failure the clean-install check found.
    await waitForLine(() => lines, /Beziera canvas running at/);
    await assert.doesNotReject(fs.access(path.join(designFolder, "design.json")));
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
});

test("every published bin entry point (beziera, beziera-mcp, beziera-canvas) starts with a node shebang", async () => {
  const monorepoRoot = path.resolve(__dirname, "..", "..", "..");
  const binFiles = [
    path.resolve(__dirname, "index.js"), // this package's own dist/index.js
    path.join(monorepoRoot, "packages", "mcp", "dist", "server.js"),
    path.join(monorepoRoot, "packages", "canvas", "dist", "server", "index.js"),
  ];
  for (const binFile of binFiles) {
    const firstLine = (await fs.readFile(binFile, "utf8")).split("\n")[0];
    assert.equal(
      firstLine,
      "#!/usr/bin/env node",
      `${binFile} must start with a node shebang so npx/npm's bin symlink runs it as Node, not as a shell script`
    );
  }
});

/**
 * The one test in this package that actually runs the built `beziera`
 * entry point as a child process, the way `npx beziera` really would —
 * everything else here (registration.test.ts, index.test.ts) tests the pure
 * functions underneath it. This is what proves "one command starts the
 * canvas" is true of the real binary, not only of the pieces it is made of.
 */
async function waitForLine(
  readLines: () => string[],
  pattern: RegExp,
  timeoutMs = 10_000
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = readLines().find((line) => pattern.test(line));
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for output matching ${pattern}. Seen so far:\n${readLines().join("\n")}`);
}

test("running the built CLI against a new folder creates a design folder, serves the canvas, and prints registration for all three hosts", async () => {
  const parentDir = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-cli-e2e-"));
  const designFolder = path.join(parentDir, "new-design");

  const child = spawn(process.execPath, [CLI_ENTRY, designFolder, "--port", "0", "--no-open"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const lines: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    lines.push(...chunk.toString("utf8").split("\n"));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    lines.push(...chunk.toString("utf8").split("\n"));
  });

  try {
    const runningLine = await waitForLine(() => lines, /Beziera canvas running at (http:\/\/\S+)/);
    const url = runningLine.match(/Beziera canvas running at (http:\/\/\S+)/)?.[1];
    assert.ok(url, "expected the printed line to carry a real URL");

    // The design folder must exist on disk now, created because it did not before.
    const designJson = JSON.parse(await fs.readFile(path.join(designFolder, "design.json"), "utf8"));
    assert.deepEqual(designJson, { name: "new-design", artboards: [], links: [] });
    await assert.doesNotReject(fs.access(path.join(designFolder, "artboards")));

    // The canvas server it started is really listening and serving this folder.
    const response = await fetch(`${url}/api/design`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), designJson);

    await waitForLine(() => lines, /Claude Code \(\.mcp\.json\)/);
    await waitForLine(() => lines, /Gemini CLI \(settings\.json\)/);
    await waitForLine(() => lines, /Codex \(config\.toml\)/);
    await waitForLine(() => lines, /--package=@beziera\/mcp/);
  } finally {
    child.kill("SIGTERM");
    const exitedInTime = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 5_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    assert.ok(exitedInTime, "the CLI process must exit on SIGTERM rather than hang");
  }
});

test("--write-mcp-config writes the registration to the given file, in addition to starting the canvas", async () => {
  const parentDir = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-cli-e2e-"));
  const designFolder = path.join(parentDir, "new-design");
  const configPath = path.join(parentDir, ".mcp.json");

  const child = spawn(
    process.execPath,
    [CLI_ENTRY, designFolder, "--port", "0", "--no-open", "--write-mcp-config", configPath],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  const lines: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => lines.push(...chunk.toString("utf8").split("\n")));
  child.stderr.on("data", (chunk: Buffer) => lines.push(...chunk.toString("utf8").split("\n")));

  try {
    await waitForLine(() => lines, /Beziera canvas running at/);
    await waitForLine(() => lines, new RegExp(`Also wrote this registration into ${configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const written = JSON.parse(await fs.readFile(configPath, "utf8"));
    assert.equal(written.mcpServers.beziera.command, "npx");
    assert.ok(written.mcpServers.beziera.args.includes(designFolder));
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
});
