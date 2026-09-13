# Changelog

All notable changes to Beziera are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Product specification, architecture, folder structure, roadmap and release checklist.
- Contributor and agent instructions.
- The web canvas: pan and zoom over a multi-artboard surface, artboards rendered in sandboxed iframes, and a file watcher with hot reload. A worked example design folder ships alongside it.
- The MCP server, with eight tools — the complete v1 surface: `list_artboards`, `read_artboard`, `write_artboard`, `create_artboard`, `link_artboards`, `screenshot_artboard`, `get_pending_marks`, and `clear_marks`.
- `marks.json`: click an element on the canvas (inside its sandboxed iframe, over `postMessage` — the iframe's opaque origin is unchanged), leave a comment, and it queues as a mark. The canvas shows how many are pending and displays the exact command to paste into an agent, since the canvas has no way to trigger one itself.

The skill is not implemented yet, so nothing checks pending marks automatically — a human still has to trigger the agent, every time. The MCP server has not yet been verified registered inside an actual Claude Code, Codex or Gemini CLI install — only against the MCP SDK's own client. There is no release.
