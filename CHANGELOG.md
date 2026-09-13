# Changelog

All notable changes to Beziera are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Product specification, architecture, folder structure, roadmap and release checklist.
- Contributor and agent instructions.
- The web canvas: pan and zoom over a multi-artboard surface, artboards rendered in sandboxed iframes, and a file watcher with hot reload. A worked example design folder ships alongside it.
- The MCP server, with six tools: `list_artboards`, `read_artboard`, `write_artboard`, `create_artboard`, `link_artboards`, and `screenshot_artboard` — a headless, network-blocked Chromium render of one artboard, at a declared desktop or mobile viewport, returned as a PNG.

The rest of the product (marks, skill) is not implemented yet. The MCP server has not yet been verified registered inside an actual Claude Code, Codex or Gemini CLI install — only against the MCP SDK's own client. There is no release.
