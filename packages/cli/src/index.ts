import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { openDesignFolder, initDesignFolder } from "@beziera/core";
import { startCanvasServer, type CanvasServerHandle } from "@beziera/canvas";
import { formatRegistrationMessage, mcpServerConfigObject } from "./registration.js";

interface ParsedArgs {
  readonly folder: string;
  readonly port?: number;
  readonly writeMcpConfigPath?: string;
  readonly open: boolean;
}

const USAGE = `Usage: beziera [folder] [options]

  folder                    Design folder to open (default: the current directory).
                             Created as a new, empty design folder if it does not exist yet.

Options:
  --port <number>           Port for the canvas server (default: 4477, or the next free port).
  --write-mcp-config <path> Also write (or merge into) a .mcp.json-shaped file at <path>,
                             registering this design folder as an MCP server named "beziera".
  --no-open                 Do not open the canvas in a browser automatically; just print the URL.
  --help                    Show this message.
`;

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let folder: string | undefined;
  let port: number | undefined;
  let writeMcpConfigPath: string | undefined;
  let open = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (arg === "--port") {
      port = Number(argv[++i]);
    } else if (arg.startsWith("--port=")) {
      port = Number(arg.slice("--port=".length));
    } else if (arg === "--write-mcp-config") {
      writeMcpConfigPath = argv[++i] ?? ".mcp.json";
    } else if (arg.startsWith("--write-mcp-config=")) {
      writeMcpConfigPath = arg.slice("--write-mcp-config=".length);
    } else if (arg === "--no-open") {
      open = false;
    } else if (!arg.startsWith("-") && folder === undefined) {
      folder = arg;
    } else {
      throw new Error(`Unrecognised argument: ${arg}\n\n${USAGE}`);
    }
  }

  return { folder: folder ?? process.cwd(), port, writeMcpConfigPath, open };
}

/**
 * Best-effort, dependency-free "open the user's default browser" — the OS's
 * own opener command (`open` on macOS, `start` via `cmd` on Windows,
 * `xdg-open` on Linux), spawned and left alone. Never awaited and never
 * lets a failure (no such command, no display, a sandboxed environment)
 * reach the caller: the canvas URL is already printed to the terminal, so a
 * browser that does not open automatically is a smaller inconvenience than
 * a startup that fails because of one.
 */
export function openInBrowser(url: string): void {
  try {
    const child =
      process.platform === "win32"
        ? spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true })
        : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
            stdio: "ignore",
            detached: true,
          });
    child.on("error", () => {
      // No opener available in this environment — nothing to do; the URL
      // printed to the terminal is still there for the user to click or paste.
    });
    child.unref();
  } catch {
    // Same reasoning as above — best-effort only.
  }
}

/**
 * Merge `mcpServers.beziera` into a JSON file shaped like Claude Code's
 * `.mcp.json` or Gemini CLI's `settings.json` — creating the file if it does
 * not exist, or merging into its existing content if it does, rather than
 * overwriting whatever else a user's config already holds.
 *
 * Deliberately narrow: this touches exactly the one path given on the
 * command line, in exactly this one shape. It does not search for or guess
 * at an agent's real configuration file, and it does not attempt Codex's
 * `config.toml` — a user who wants that one pastes the printed snippet by
 * hand. Experimental, not implemented-and-tested: it has not been proven
 * against a real Claude Code or Gemini CLI install actually picking up the
 * result, only that the file it writes is valid, mergeable JSON.
 */
export async function writeMcpConfig(configPath: string, absoluteDesignFolder: string): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    } else {
      throw new Error(`${configPath} does not contain a JSON object at its top level`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const mcpServers =
    existing.mcpServers && typeof existing.mcpServers === "object"
      ? (existing.mcpServers as Record<string, unknown>)
      : {};

  const merged = {
    ...existing,
    mcpServers: {
      ...mcpServers,
      beziera: mcpServerConfigObject(absoluteDesignFolder),
    },
  };

  await fs.mkdir(path.dirname(path.resolve(configPath)), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

async function ensureDesignFolder(absoluteFolder: string): Promise<void> {
  const exists = await fs
    .stat(absoluteFolder)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    await initDesignFolder(absoluteFolder);
    return;
  }
  // Already exists — validate it the same way startCanvasServer will, so a
  // problem is reported once, clearly, rather than surfacing later from
  // deeper inside the canvas server's own startup.
  await openDesignFolder(absoluteFolder);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const absoluteFolder = path.resolve(args.folder);

  await ensureDesignFolder(absoluteFolder);

  const server: CanvasServerHandle = await startCanvasServer(absoluteFolder, args.port);
  console.log(`Beziera canvas running at ${server.url}`);
  console.log(`Design folder: ${absoluteFolder}`);
  console.log("");
  console.log(formatRegistrationMessage(absoluteFolder));

  if (args.open) {
    openInBrowser(server.url);
  }

  if (args.writeMcpConfigPath) {
    await writeMcpConfig(args.writeMcpConfigPath, absoluteFolder);
    console.log("");
    console.log(`Also wrote this registration into ${path.resolve(args.writeMcpConfigPath)}`);
  }

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    server
      .close()
      .catch((err: unknown) => console.error(err))
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Only run when this file is executed directly (`node dist/index.js`, or via
// the `beziera` bin), not when its exports are imported for tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
