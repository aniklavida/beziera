import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mcpLaunchArgs,
  mcpServerConfigObject,
  buildRegistrationSnippets,
  formatRegistrationMessage,
} from "./registration.js";

const FOLDER = "/srv/my-design";

test("mcpLaunchArgs names the package and bin explicitly, not a bare npx guess", () => {
  const args = mcpLaunchArgs(FOLDER);
  assert.deepEqual(args, ["--yes", "--package=@beziera/mcp", "beziera-mcp", FOLDER]);
});

test("mcpServerConfigObject is the same command+args shape both JSON hosts read", () => {
  const config = mcpServerConfigObject(FOLDER);
  assert.equal(config.command, "npx");
  assert.deepEqual(config.args, ["--yes", "--package=@beziera/mcp", "beziera-mcp", FOLDER]);
});

test("the JSON snippet is valid JSON naming a beziera server under mcpServers", () => {
  const { json } = buildRegistrationSnippets(FOLDER);
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed, {
    mcpServers: {
      beziera: { command: "npx", args: ["--yes", "--package=@beziera/mcp", "beziera-mcp", FOLDER] },
    },
  });
});

test("the TOML snippet names the same server under [mcp_servers.beziera]", () => {
  const { toml } = buildRegistrationSnippets(FOLDER);
  assert.match(toml, /^\[mcp_servers\.beziera\]/);
  assert.match(toml, /command = "npx"/);
  assert.ok(toml.includes(JSON.stringify(FOLDER)), "the design folder path must appear, quoted, in args");
});

test("formatRegistrationMessage mentions all three target hosts by name", () => {
  const message = formatRegistrationMessage(FOLDER);
  assert.match(message, /Claude Code/);
  assert.match(message, /Gemini CLI/);
  assert.match(message, /Codex/);
});
