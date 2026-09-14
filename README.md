# Beziera

**Design, prototype and animate on HTML-native artboards — driven by the coding agent you already run.**

Beziera is an AI-assisted UI/UX design tool that brings the canvas, the loop and the file format, and lets you bring the model. It connects over MCP to a coding agent already running on your machine — Claude Code, Codex, Gemini CLI — so there is no API key to paste, no second subscription, and no decision about which model you are allowed to use.

**Without the lock-in.**

> **Status, 14 September 2026.** The canvas, the MCP server and its eight tools, marks, the skill, prototype links, animation preview, and PNG/self-contained-HTML export are built and covered by an automated test suite (104 tests, `npm test` from the repo root). `npx beziera` is packaged and has been verified end to end from a clean install: packed into tarballs, installed into a fresh temporary `HOME` and npm cache, and run from there. What has **not** been verified: this package registering itself inside a real, running Claude Code, Codex or Gemini CLI install (only against the MCP SDK's own client). The name is also not yet trademark-cleared — see [specification §18](docs/SPEC.md). See [Capabilities](#capabilities) below for exactly which claim is which. **Not yet tagged as a release.**

## Quickstart

```
npx beziera [folder]
```

Starts the canvas for `folder` (created as a new, empty design folder if it doesn't exist yet — default: the current directory), opens it in your browser, and prints the MCP registration to add to your agent:

```
Beziera canvas running at http://127.0.0.1:4477
Design folder: /path/to/folder

Add this design folder to your coding agent's MCP servers:

Claude Code (.mcp.json) and Gemini CLI (settings.json):
{
  "mcpServers": {
    "beziera": {
      "command": "npx",
      "args": ["--yes", "--package=@beziera/mcp", "beziera-mcp", "/path/to/folder"]
    }
  }
}

Codex (config.toml):
[mcp_servers.beziera]
command = "npx"
args = ["--yes", "--package=@beziera/mcp", "beziera-mcp", "/path/to/folder"]
```

Paste the relevant block into your agent's MCP configuration, restart it if needed, then say something like *"design a login screen for this app"*. `--write-mcp-config <path>` will merge the JSON form directly into a file instead of printing it; `--no-open` skips the automatic browser launch. Run `npx beziera --help` for the full list.

## Two limitations, stated up front

These are real, they shape how the product works, and you should read them here rather than discover them later.

**1 · The canvas cannot push work to your agent. The agent pulls, and you trigger it.**

MCP sampling — the mechanism that would let a tool ask your agent to do something — is [not supported in Claude Code](https://github.com/anthropics/claude-code/issues/1785). The request has been open since June 2025, and was still open when this was written on 13 September 2026. Support is uneven across MCP clients generally; some implement it, several of the ones people actually run do not. Beziera therefore does not depend on it in any client, and does not wait for that to change.

What that means in practice: when you leave a mark on the canvas, nothing happens until your next turn with the agent. Two things soften it. The bundled skill tells your agent to **check pending marks at the start of every turn**, so once you are in a conversation the marks get picked up without being asked for. And the canvas **shows you the exact command to paste**, so triggering the agent is a copy rather than a sentence you have to compose.

The seam is smaller. It is not gone.

**2 · The quality of what comes out is your model's, not ours.**

Beziera is a loop and a surface. What travels around that loop — the HTML it writes, and what it notices when it looks at its own screenshot — is entirely whatever your agent produces. A vision-capable frontier model and a small local model will not produce the same result, and that gap is outside this project's control in either direction. We make no claim about what any specific model will produce; the loop is the same regardless of which one you point it at.

The other half of the same fact: **this tool improves as models improve, without us shipping anything.** The ceiling is not ours to set.

## The idea

A coding agent can already write a good screen. What it cannot do is **look at it**.

It writes `login.html`, never renders it, and never learns that the label collides with the input, that the contrast fails, that the card is wider than its container. No eyes means no feedback, which means the second attempt is not better than the first — just different.

Beziera closes the loop:

```
write  →  render  →  look  →  fix
```

The tool that does it is `screenshot_artboard`. The agent renders what it just wrote, sees it, and corrects it.

## Each artboard is a real HTML file

This is the architecture, and it is the reason the rest of the product is possible.

| | A vector design model | An HTML artboard |
|---|---|---|
| Clickable prototype | A prototyping layer invented on top of shapes | `<a href="checkout.html">` |
| Animation | A separate timeline model | CSS transitions, keyframes, Web Animations |
| Responsive behaviour | Constraint rules that approximate it | Media queries — the real mechanism |
| Handoff | Export, interpret, rebuild | The artboard **is** the code |
| What the model must be fluent in | A proprietary shape API | HTML and CSS |

Clickable prototypes and real animation are not features bolted onto this design. They are consequences of it. And because a coding agent writes HTML better than it writes anything else, the design surface and the model's strongest skill are the same thing.

**The output of a design session is the artefact, not a picture of the artefact.**

## What a design looks like on disk

```
my-design/
  artboards/
    login.html          each artboard is a real HTML file
    dashboard.html
  design.json           canvas positions, links, metadata
  marks.json            your feedback, queued for the agent
```

Three kinds of file, all text. You can open an artboard in any editor, review a design change in a pull request, and read its history in `git log`. **A design is a directory, not a binary.**

Exporting an artboard (see [Export](#export) below) also writes into an `exports/` folder in the same directory — generated output, not part of the format itself, and excluded from version control by this repository's own `.gitignore` pattern for a design folder.

## The four parts

| Part | What it does |
|---|---|
| **MCP server** | The bridge your agent talks to |
| **Web canvas** | Pan and zoom, artboards live in iframes, file watcher, hot reload |
| **Skill** | So you type `/design` |
| **`npx beziera`** | Starts the canvas and prints the MCP registration — see [Quickstart](#quickstart) |

## The MCP tools

`list_artboards` · `read_artboard` · `write_artboard` · `create_artboard` · **`screenshot_artboard`** · `get_pending_marks` · `clear_marks` · `link_artboards`

Eight tools — the complete surface; there is no ninth. `screenshot_artboard` is what makes the write → render → look → fix loop possible at all, and it was built third in the plan rather than last. Everything after it is comparatively cheap; everything before it exists to make it possible.

## Export

PNG and self-contained HTML, per artboard, from two buttons on the canvas next to each artboard's name.

- **PNG** reuses the exact render path `screenshot_artboard` uses — the same headless, sandboxed, network-blocked capture.
- **Self-contained HTML** inlines the artboard's local images, fonts, linked stylesheet and linked script as data URIs or literal text, so the exported file opens directly from disk, on any machine, with **no other file present and no network request** — verified with a real browser context that refuses every non-`file://` request, after the design folder the export came from was deleted. A reference to something outside the design folder, or to a remote URL, is left exactly as written rather than fetched; both are reported back rather than silently dropped, so an export that isn't fully self-contained is not silently claimed to be one.

Both formats are also written into `exports/` in the design folder, alongside the browser download. PDF and PPTX are not built — see [Not in v1](#not-in-v1).

## What v1 is

v1 is one thing, deliberately:

> **You type one sentence in your agent, an artboard appears on the canvas, and the agent has looked at its own screenshot and improved it once.**

Nothing else ships until that works end to end. Direct visual editing, adjustment sliders, PDF and PPTX export and two-way sync with a codebase are the direction after it — see the [roadmap](docs/ROADMAP.md).

## Not in v1

A vector editor · a hosted service · anything that needs an API key · editing an existing codebase · PDF and PPTX export · direct click-and-drag editing on the canvas.

## Capabilities

Every claim in this README about what exists is one of exactly four labels. **Implemented and tested** means an automated test in this repository fails if the behaviour regresses. Nothing here promises a quality outcome — only that the described mechanism exists and is tested, unless marked otherwise.

| Capability | Status |
|---|---|
| Canvas: pan/zoom, sandboxed iframes, file-watcher hot reload | Implemented and tested |
| MCP server, all eight tools, against a real MCP client | Implemented and tested |
| `screenshot_artboard`: sandboxed, network-blocked, bounded-time render | Implemented and tested |
| Marks: leave one on the canvas, `get_pending_marks`, `clear_marks` | Implemented and tested |
| The `/design` skill (Claude Code, Codex, Gemini CLI, Cursor pointers) | Implemented and tested |
| Prototype links and animation replay | Implemented and tested |
| PNG export | Implemented and tested |
| Self-contained HTML export (local assets only — see [Export](#export)) | Implemented and tested |
| `npx beziera`: create-if-new, start canvas, print registration | Implemented and tested — verified from a clean install (fresh `HOME` and npm cache, tarballs only) |
| `--write-mcp-config`: merge the registration into a `.mcp.json`-shaped file | Experimental — writes valid JSON; not yet proven against a real agent reading the result |
| This server registering itself inside a running Claude Code, Codex or Gemini CLI application | Experimental — all eight tools list correctly against the MCP SDK's own client; not yet confirmed inside the real vendor applications |
| PDF and PPTX export | Planned (after v1 — see [roadmap](docs/ROADMAP.md)) |
| Direct click-select visual editing, adjustment sliders, two-way codebase sync | Planned (after v1) |
| A hosted or multi-user version | Unsupported — not part of this product's direction |

## Dependencies

Five third-party packages, MIT or Apache-2.0 only, across the whole product — no new one was added for export or packaging. Verified against each package's own published metadata on 14 September 2026.

| Package | Version | Licence | Used for |
|---|---|---|---|
| [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | 1.30.0 | MIT | The MCP server |
| [`playwright`](https://www.npmjs.com/package/playwright) | 1.63.0 | Apache-2.0 | The one shared headless-browser render path (screenshots and PNG export) |
| [`chokidar`](https://www.npmjs.com/package/chokidar) | 5.0.0 | MIT | Watching the design folder for changes |
| [`ws`](https://www.npmjs.com/package/ws) | 8.21.3 | MIT | The canvas's hot-reload socket |
| [`zod`](https://www.npmjs.com/package/zod) | 4.6.4 | MIT | Validating `design.json`, `marks.json` and every MCP tool's input |

That shortness is deliberate, not incidental — see [specification §16](docs/SPEC.md).

## Documentation

- [Product specification](docs/SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Folder structure](docs/STRUCTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)

## Licence

MIT. See [LICENSE](LICENSE).
