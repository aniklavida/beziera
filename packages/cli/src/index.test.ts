import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, writeMcpConfig } from "./index.js";

// openInBrowser is not exercised here: it spawns the real OS opener command
// (`open` / `xdg-open` / `start`), and actually invoking that from a test
// would pop a real browser window on whatever machine runs the suite. It is
// a thin, best-effort, deliberately unawaited wrapper — see its own comment
// in index.ts — and every path that can throw synchronously is guarded by
// try/catch or a child "error" listener, which is what there is to test
// without that side effect.

test("parseArgs defaults the folder to the current directory, and open to true", () => {
  const args = parseArgs([]);
  assert.equal(1, 2, "INTENTIONAL BREAK FOR CI — packages/cli, PR #3 late-workspace proof");
  assert.equal(args.folder, process.cwd());
  assert.equal(args.port, undefined);
  assert.equal(args.writeMcpConfigPath, undefined);
  assert.equal(args.open, true);
});

test("parseArgs turns off auto-open with --no-open", () => {
  const args = parseArgs(["--no-open"]);
  assert.equal(args.open, false);
});

test("parseArgs reads a positional folder and --port", () => {
  const args = parseArgs(["./my-design", "--port", "5050"]);
  assert.equal(args.folder, "./my-design");
  assert.equal(args.port, 5050);
});

test("parseArgs also accepts --port=<n>", () => {
  const args = parseArgs(["--port=5050"]);
  assert.equal(args.port, 5050);
});

test("parseArgs defaults --write-mcp-config's path to .mcp.json when none is given", () => {
  const args = parseArgs(["--write-mcp-config"]);
  assert.equal(args.writeMcpConfigPath, ".mcp.json");
});

test("parseArgs accepts an explicit --write-mcp-config=<path>", () => {
  const args = parseArgs(["--write-mcp-config=/tmp/somewhere/.mcp.json"]);
  assert.equal(args.writeMcpConfigPath, "/tmp/somewhere/.mcp.json");
});

test("parseArgs rejects an unrecognised flag rather than silently ignoring it", () => {
  assert.throws(() => parseArgs(["--not-a-real-flag"]), /Unrecognised argument/);
});

async function tempConfigPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-cli-config-test-"));
  return path.join(dir, ".mcp.json");
}

test("writeMcpConfig creates a new file when none exists", async () => {
  const configPath = await tempConfigPath();
  await writeMcpConfig(configPath, "/abs/my-design");

  const written = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.deepEqual(written, {
    mcpServers: {
      beziera: {
        command: "npx",
        args: ["--yes", "--package=@beziera/mcp", "beziera-mcp", "/abs/my-design"],
      },
    },
  });
});

test("writeMcpConfig merges into an existing file, preserving unrelated keys and other servers", async () => {
  const configPath = await tempConfigPath();
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        someOtherTopLevelKey: true,
        mcpServers: { "another-tool": { command: "node", args: ["other.js"] } },
      },
      null,
      2
    ),
    "utf8"
  );

  await writeMcpConfig(configPath, "/abs/my-design");

  const written = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.equal(written.someOtherTopLevelKey, true);
  assert.deepEqual(written.mcpServers["another-tool"], { command: "node", args: ["other.js"] });
  assert.deepEqual(written.mcpServers.beziera, {
    command: "npx",
    args: ["--yes", "--package=@beziera/mcp", "beziera-mcp", "/abs/my-design"],
  });
});

test("writeMcpConfig refuses a file that is valid JSON but not an object", async () => {
  const configPath = await tempConfigPath();
  await fs.writeFile(configPath, "[1, 2, 3]", "utf8");
  await assert.rejects(writeMcpConfig(configPath, "/abs/my-design"), /does not contain a JSON object/);
});
