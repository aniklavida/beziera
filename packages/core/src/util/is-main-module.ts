import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Whether the module at `importMetaUrl` is the script Node was actually
 * asked to run — the standard `import.meta.url === file://${process.argv[1]}`
 * check, done correctly.
 *
 * The naive version of that check breaks for exactly the case that matters
 * most for a published CLI: **running the file through a symlink**, which
 * is what every one of `npm`'s own `bin` entries is. Node resolves
 * `import.meta.url` through the symlink to the file's real path, but
 * `process.argv[1]` keeps whatever path was actually typed or resolved by
 * the shell — the symlink path itself, unresolved. `node_modules/.bin/beziera`
 * (and `beziera-mcp`, `beziera-canvas`) are exactly such symlinks, so the
 * naive comparison silently returns false every time `npx beziera` — or the
 * MCP registration this product itself prints, `npx --package=@beziera/mcp
 * beziera-mcp` — actually runs it. Found by this product's own clean-install
 * check (`npm pack`, install the tarball into a fresh environment, run the
 * real bin): every other test in this codebase invokes these entry points
 * as `node dist/x.js`, a real path, which never exercises the symlink case
 * at all.
 *
 * Resolving `process.argv[1]` through `realpathSync` before comparing puts
 * both sides on the same footing. If `process.argv[1]` cannot be resolved
 * (already an unusual state for a running process), this returns `false`
 * rather than throwing — a script that fails to detect it is the entry
 * point simply does not run its `main()`, which is the safe direction to
 * fail in for something that would otherwise start a server or open a file.
 */
export function isMainModule(importMetaUrl: string): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return importMetaUrl === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false;
  }
}
