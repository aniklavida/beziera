# Changelog

All notable changes to Beziera are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Product specification, architecture, folder structure, roadmap and release checklist.
- Contributor and agent instructions.
- The web canvas: pan and zoom over a multi-artboard surface, artboards rendered in sandboxed iframes, and a file watcher with hot reload. A worked example design folder ships alongside it.
- The MCP server, with eight tools — the complete v1 surface: `list_artboards`, `read_artboard`, `write_artboard`, `create_artboard`, `link_artboards`, `screenshot_artboard`, `get_pending_marks`, and `clear_marks`.
- `marks.json`: click an element on the canvas (inside its sandboxed iframe, over `postMessage` — the iframe's opaque origin is unchanged), leave a comment, and it queues as a mark. The canvas shows how many are pending and displays the exact command to paste into an agent, since the canvas has no way to trigger one itself.
- The `/design` skill: one tool-neutral procedure (checking pending marks at the start of every turn, then write → render → look → fix after touching an artboard), with thin per-host pointers for Claude Code, Gemini CLI and Cursor. Every other AGENTS.md-native tool reads the procedure directly.
- Prototype links: the canvas draws the connection `link_artboards` records between two artboards, and a plain `<a href>` inside one sandboxed iframe still navigates it — the sandboxed iframe navigates itself the same way any iframe does, unchanged by this.
- Animation preview: a CSS animation already runs the moment an artboard's iframe loads, since it is a real page. A "Replay" button next to each artboard restarts it without reloading the iframe, over the same `postMessage` channel marks use.
- Export: PNG (reusing the exact capture path `screenshot_artboard` uses) and self-contained HTML (local images, fonts, a linked stylesheet and a linked script inlined so the file opens from disk with no other file and no network request), from two buttons per artboard on the canvas. Both are also written into `exports/` inside the design folder.
- `npx beziera [folder]`: creates the folder as a new, empty design folder if it does not exist yet, starts the canvas, opens it in the browser, and prints the MCP registration for Claude Code, Codex and Gemini CLI. `--write-mcp-config` merges that registration into a `.mcp.json`-shaped file directly; `--no-open` skips the automatic browser launch. Verified end to end from a clean install: packed with `npm pack`, installed into a fresh temporary `HOME` and npm cache, and run from there — including the MCP server's own `beziera-mcp` bin, confirmed against a real MCP client.

The MCP server has not yet been verified registered inside an actual Claude Code, Codex or Gemini CLI install — only against the MCP SDK's own client, and against `npx beziera`'s own clean-install check above. There is no release.
