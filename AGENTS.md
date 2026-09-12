# Beziera — contributor and agent instructions

The canonical guide for humans and coding agents working in this repository. Tool-neutral: Claude, Codex, Cursor, Gemini CLI and others read this file.

## What this repository is

An AI-assisted UI/UX design, prototype and animation tool. It exposes a design folder over MCP so a coding agent already running on the user's machine can create and refine artboards, and it renders those artboards on a local web canvas.

**Status: pre-implementation.** The specification, architecture and structure exist. Working code does not yet.

## The one rule that matters

**An artboard is a real HTML file on disk.**

It never means a record in memory, a node in a tree, or a rendered preview. The moment `artboard` means two things, the architecture has started leaking and every feature after that costs twice.

## The second rule

**The agent must look at what it made.**

Writing an artboard is half a change. Rendering it with `screenshot_artboard`, looking at the result, and correcting what is visibly wrong is the other half. Code, documentation and skill text that lets an agent report a screen as finished without rendering it is a bug in this product, not a shortcut.

## Structure

```
packages/
├── core/      the design folder: read, write, validate, watch — the ONLY code that touches disk
├── mcp/       the MCP server and its eight tools
├── canvas/    the web canvas: pan/zoom, iframes, watcher, hot reload
└── cli/       `npx beziera`
skill/         the shipped skill, tool-neutral markdown
```

Boundaries:

- **`core` is the only package that touches disk.** `mcp` and `canvas` go through it.
- **`core` imports neither `mcp` nor `canvas`.** The moment it does, it stops being shared.
- **Schemas are defined once, in `core`**, and shared by the MCP tool inputs and the canvas.
- **Every artboard iframe is created in one place**, so the sandbox attributes cannot be forgotten.
- **One module owns every headless-browser call.** Nothing else launches a browser.

The first two are enforced by a dependency test in CI. The last three are review rules.

## The design folder format

```
my-design/
  artboards/*.html    each artboard, a complete standalone HTML document
  design.json         positions, links, metadata
  marks.json          the user's pending feedback
```

All three are text, diffable and committable, and that is a product guarantee rather than an implementation detail. A change that makes any of them binary, machine-specific or unreadable in a diff will not be merged.

Never write a path, a hostname or a machine-specific value into `design.json`. A design folder must work when someone else clones it.

## Security

Artboards are arbitrary HTML executing on the user's machine.

- Every artboard renders in a **sandboxed iframe**.
- The screenshot context **must not reach the network**.
- The canvas server binds to localhost and serves the design folder, nothing above it.
- The MCP server writes inside the design folder only. A path that escapes it is rejected, not normalised.

These are first-commit requirements, not a hardening pass later.

## Adding an MCP tool

1. Define its input schema in `core`, with the rest of the schemas.
2. Add one file under `mcp/src/tools/`. One tool per file — the tool list should read as the product's whole surface.
3. If it touches disk, it calls `core`. It does not open a file itself.
4. Document it in `docs/SPEC.md`.
5. Adding a tool is a product decision, not a convenience. Eight tools is the v1 surface; a ninth needs a reason in the pull request.

## Dependencies

The dependency budget is small on purpose: a local tool that already asks a user to install a headless browser has spent most of it.

- **MIT, Apache-2.0 or BSD only.**
- Check it exists, is maintained and is actually released — not that documentation says it should work.
- A new dependency needs its licence stated in the pull request.

## Truthfulness

Every public claim is one of: **implemented and tested**, **experimental**, **planned**, or **unsupported**. Never describe a planned capability as working. Never present a comparison, a compatibility table or a benchmark as measured unless someone actually measured it and the evidence is in the pull request.

Two limitations are stated in the README and must not be quietly softened in any other document: the canvas cannot push work to the agent, and output quality belongs to whichever model the user brings.

## Scope

v1 is one sentence: the user types one sentence in their agent, an artboard appears on the canvas, and the agent has looked at its own screenshot and improved it once.

Work that is not on the path to that waits, however cheap it looks. The list of things that come after is in `docs/ROADMAP.md`, and it is there so they are remembered rather than started early.

## Tests

Unit tests for `core`. Integration tests that run the MCP server and call its tools. A dependency test for the package boundaries. Rendering is verified by rendering — a screenshot test that never launches a browser proves nothing.
