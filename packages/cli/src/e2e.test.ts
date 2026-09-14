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
