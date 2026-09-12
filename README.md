# Beziera

**Design, prototype and animate on HTML-native artboards — driven by the coding agent you already run.**

Beziera is an AI-assisted UI/UX design tool that brings the canvas, the loop and the file format, and lets you bring the model. It connects over MCP to a coding agent already running on your machine — Claude Code, Codex, Gemini CLI — so there is no API key to paste, no second subscription, and no decision about which model you are allowed to use.

**Without the lock-in.**

> **Pre-implementation.** This repository currently contains the product specification, architecture and structure. **There is no working release yet, and nothing described below is implemented.** Every capability is planned.

## Two limitations, stated up front

These are real, they shape how the product works, and you should read them here rather than discover them later.

**1 · The canvas cannot push work to your agent. The agent pulls, and you trigger it.**

MCP sampling — the mechanism that would let a tool ask your agent to do something — is [not supported in Claude Code](https://github.com/anthropics/claude-code/issues/1785). The request has been open since June 2025, and was still open when this was written on 13 September 2026. Support is uneven across MCP clients generally; some implement it, several of the ones people actually run do not. Beziera therefore does not depend on it in any client, and does not wait for that to change.

What that means in practice: when you leave a mark on the canvas, nothing happens until your next turn with the agent. Two things soften it. The bundled skill tells your agent to **check pending marks at the start of every turn**, so once you are in a conversation the marks get picked up without being asked for. And the canvas **shows you the exact command to paste**, so triggering the agent is a copy rather than a sentence you have to compose.

The seam is smaller. It is not gone.

**2 · The quality of what comes out is your model's, not ours.**

Beziera is a loop and a surface. What travels around the loop is whatever your agent produces. Expect strong results from a vision-capable frontier model and plain ones from a small local model — the design of the loop assumes this, and it is outside our control either way. Nothing here has been measured yet, because nothing here is built yet.

The other half of the same fact: **this tool gets better as models get better, without us shipping anything.** The ceiling is not ours to set, and it keeps rising.

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

## The three parts

| Part | What it does |
|---|---|
| **MCP server** | The bridge your agent talks to |
| **Web canvas** | Pan and zoom, artboards live in iframes, file watcher, hot reload |
| **Skill** | So you type `/design` |

## The MCP tools

`list_artboards` · `read_artboard` · `write_artboard` · `create_artboard` · **`screenshot_artboard`** · `get_pending_marks` · `clear_marks` · `link_artboards`

`screenshot_artboard` is the one that decides output quality, and it is built third in the plan rather than last. Everything after it is comparatively cheap; everything before it exists to make it possible.

## What v1 is

v1 is one thing, deliberately:

> **You type one sentence in your agent, an artboard appears on the canvas, and the agent has looked at its own screenshot and improved it once.**

Nothing else ships until that works end to end. Direct visual editing, adjustment sliders, PDF and PPTX export and two-way sync with a codebase are the direction after it — see the [roadmap](docs/ROADMAP.md).

## Not in v1

A vector editor · a hosted service · anything that needs an API key · editing an existing codebase · PDF and PPTX export · direct click-and-drag editing on the canvas.

## Documentation

- [Product specification](docs/SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Folder structure](docs/STRUCTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)

## Licence

MIT. See [LICENSE](LICENSE).
