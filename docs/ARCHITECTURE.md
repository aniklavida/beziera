# Architecture

**Nothing described here is implemented.** This is the shape the first commits build into.

## System boundary

```
        the user's coding agent
        (Claude Code · Codex · Gemini CLI)
                    │
                MCP, stdio
                    │
            ┌───────▼────────┐            ┌──────────────────┐
            │   MCP server   │            │   web canvas     │
            │   8 tools      │            │  pan/zoom        │
            │   + headless   │            │  iframes         │
            │     browser    │            │  hot reload      │
            └───────┬────────┘            └────────┬─────────┘
                    │                              │
                    └──────────┬───────────────────┘
                               │
                      the design folder
              artboards/*.html · design.json · marks.json
```

**The folder is the interface.** Both sides read and write the same three files and both watch them for change. There is no direct connection between the MCP server and the canvas, because that would be a second source of truth for state that already lives on disk.

## The three files

| File | Owns |
|---|---|
| `artboards/*.html` | The screens. Complete, standalone HTML documents |
| `design.json` | Where each artboard sits on the canvas, what links to what, metadata |
| `marks.json` | The user's feedback, queued for the agent |

All three are text. A design can be opened in an editor, reviewed in a pull request, and read in `git log`. **A design is a directory, not a binary** — that is a product guarantee, not an implementation detail.

Nothing in these files is machine-specific. A design folder works after someone else clones it.

## Data flow, in both directions

**Agent to canvas.** The agent calls `create_artboard` or `write_artboard`. The MCP server writes the HTML file and updates `design.json`. The canvas's watcher sees the change and hot-reloads that one iframe. The user sees the new screen without refreshing.

**User to agent.** The user leaves a mark on the canvas. The canvas appends it to `marks.json`. Nothing happens until the user's next turn with the agent — at which point the skill has the agent call `get_pending_marks`, act on them, and call `clear_marks`.

The asymmetry is deliberate and forced: **the canvas has no way to push work to the agent.** MCP sampling would be that mechanism and is not available in the clients this targets, so the canvas never assumes it can, and shows the user the command to paste instead.

## The quality loop

```
agent writes artboard  →  screenshot_artboard renders it
        ▲                            │
        │                            ▼
   agent fixes it     ←    agent looks at the image
```

This is the whole product. An agent that writes a screen without rendering it has no feedback and cannot improve; an agent that can see its own output corrects a spacing error in the same turn it made it.

The skill is what closes the loop — it instructs the agent to render and look before reporting the work as done. Without that instruction the tools exist and nobody uses the important one.

## Packages

```
core/      the design folder: read, write, validate, watch — and the shared render path
mcp/       the MCP server and its eight tools
canvas/    the web surface
cli/       starts the canvas, prints the MCP configuration to paste
```

**`core` exists because two packages read the same format.** Without it, `design.json` is parsed in two places by code that will drift, and the format stops being a format. The same reasoning is why the headless-browser render path lives in `core` too: `screenshot_artboard` (in `mcp`) and PNG/self-contained-HTML export (in `canvas`) are the same rendering concern from two directions, and `core` is the one place both already depend on.

Boundaries, the first two enforced by a dependency test in CI:

- **`core` is the only package that touches disk.**
- **`core` imports neither `mcp` nor `canvas`.**
- **Schemas are defined once, in `core`**, and shared by the MCP tool inputs and the canvas.
- **Every artboard iframe is created in one module**, so the sandbox attributes cannot be forgotten.
- **One module owns every headless-browser call — `core`'s `render/`.** Neither `mcp` nor `canvas` launches a browser of its own; both call into the same shared module.

## Rendering

The headless browser is launched once and reused across screenshots, not started per call — starting a browser per screenshot would make the most-used tool the slowest one.

A screenshot is taken at a declared viewport width, after fonts have loaded and layout has settled. The result is returned to the agent in a form a vision-capable model can actually read.

**A leaked browser process is the most likely bug in this product.** Lifecycle lives in one module for that reason, and the MCP server's shutdown path is responsible for it.

## Security

An artboard is arbitrary HTML executing on the user's machine, and it is usually HTML a language model wrote. It is treated as untrusted.

- Artboards render in **sandboxed iframes** — `allow-scripts` only, never `allow-same-origin` — whether captured or shown live on the canvas.
- The screenshot render path keeps **Chromium's own OS-level process sandbox on**; nothing in this product disables it.
- The screenshot context **cannot reach the network** (no HTTP, HTTPS or WebSocket) and can read exactly one local file — the artboard actually being captured — not any other file on disk.
- A screenshot that never finishes rendering is **abandoned after a bounded time**, rather than hanging the tool indefinitely.
- An artboard shown live on the canvas carries a **Content-Security-Policy** closing the same network paths the screenshot context blocks, since the canvas renders in an ordinary browser tab where the capture path's request-routing block does not apply.
- The canvas server binds to localhost and serves the design folder — never a path above it.
- The MCP server reads and writes inside the design folder only. A path that escapes it is rejected, not normalised.
- There is no API key, no account and no telemetry, so there is no credential to leak.

These are first-commit requirements, and every one of them above is pinned by a test that fails if the protection is removed.

## What this architecture buys

Clickable prototypes are links between files. Animation is CSS already running in the iframe. Responsive behaviour is media queries. Handoff is the file itself.

None of those is a subsystem here. Each is a consequence of the artboard being a real HTML document, and that is the entire reason the format was chosen.
