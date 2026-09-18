/**
 * The MCP registration a user pastes into their agent — the thing this
 * package exists to print. Every host launches the same command the same
 * way: `npx --package=@beziera/mcp beziera-mcp <absolute design folder>`,
 * so the agent never needs `@beziera/mcp` installed ahead of time and always
 * runs the version paired with whatever `beziera` version started this
 * canvas.
 *
 * `--package=@beziera/mcp beziera-mcp` (rather than plain `npx beziera-mcp`)
 * is deliberate: npx only infers a bin name from a bare package specifier
 * when the package's name and its one bin entry happen to match, and
 * `@beziera/mcp`'s bin is named `beziera-mcp`, not `mcp` or `@beziera/mcp`.
 * The explicit form works regardless of that heuristic.
 */
export function mcpLaunchArgs(absoluteDesignFolder: string): readonly string[] {
  return ["--yes", "--package=@beziera/mcp", "beziera-mcp", absoluteDesignFolder];
}

export interface McpRegistrationSnippets {
  /** `.mcp.json`-shaped JSON — Claude Code and Gemini CLI both read this shape. */
  readonly json: string;
  /** Codex's `config.toml` shape, under `[mcp_servers.beziera]`. */
  readonly toml: string;
}

/** The `mcpServers.beziera` object both JSON-configured hosts share, as a plain value (for --write-mcp-config). */
export function mcpServerConfigObject(absoluteDesignFolder: string): {
  command: string;
  args: string[];
} {
  return { command: "npx", args: [...mcpLaunchArgs(absoluteDesignFolder)] };
}

function jsonSnippet(absoluteDesignFolder: string): string {
  return JSON.stringify(
    { mcpServers: { beziera: mcpServerConfigObject(absoluteDesignFolder) } },
    null,
    2
  );
}

function tomlSnippet(absoluteDesignFolder: string): string {
  const args = mcpLaunchArgs(absoluteDesignFolder)
    .map((arg) => JSON.stringify(arg))
    .join(", ");
  return `[mcp_servers.beziera]\ncommand = "npx"\nargs = [${args}]`;
}

export function buildRegistrationSnippets(absoluteDesignFolder: string): McpRegistrationSnippets {
  return {
    json: jsonSnippet(absoluteDesignFolder),
    toml: tomlSnippet(absoluteDesignFolder),
  };
}

/**
 * The full paste-ready block this CLI prints to the terminal: what to add,
 * where, for each of the three hosts the product targets. Registering the
 * server is still a manual step in the agent's own config — nothing here
 * (or anywhere in this product) edits Claude Code's, Codex's or Gemini
 * CLI's configuration on its own unless --write-mcp-config is passed, and
 * even then only for the one JSON-shaped file named on the command line.
 */
export function formatRegistrationMessage(absoluteDesignFolder: string): string {
  const { json, toml } = buildRegistrationSnippets(absoluteDesignFolder);
  return [
    "Add this design folder to your coding agent's MCP servers:",
    "",
    "Claude Code (.mcp.json) and Gemini CLI (settings.json):",
    json,
    "",
    "Codex (config.toml):",
    toml,
    "",
    "The folder now contains agent instructions. In Claude Code, start with:",
    "  /design",
    "",
    "Or say something like:",
    '  "Design a login screen for this app."',
  ].join("\n");
}
