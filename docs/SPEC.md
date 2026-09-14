# Beziera — product specification

**Status:** Draft. **Nothing in this document is implemented.** Every capability described is planned.

Defaults marked **[assumed]** are the maintainer's working choice rather than a settled decision, and may change.

## 1 · What it is

An AI-assisted UI/UX design, prototype and animation tool that runs against whichever coding agent the user already has.

The user opens a canvas in the browser, types one sentence in their agent, and an artboard appears. They click something that looks wrong, leave a mark, and the agent picks it up on its next turn, renders what it made, sees the problem, and fixes it.

**The tool brings the canvas, the loop and the file format. The user brings the model.**

## 2 · The architectural claim

> **Each artboard is a real HTML file.**

Everything else follows from this, and it is not a matter of taste.

| | A vector design model | An HTML artboard |
|---|---|---|
| Clickable prototype | A prototyping layer invented on top of shapes | `<a href="checkout.html">` |
| Animation | A separate timeline model | CSS transitions, keyframes, Web Animations |
| Responsive behaviour | Constraint rules that approximate it | Media queries — the real mechanism |
| Handoff to code | Export, interpret, rebuild | The artboard **is** the code |
| What the model must be fluent in | A proprietary shape API | HTML and CSS |

A coding agent writes HTML better than it writes anything else, because HTML is the most represented format it has ever seen. Driving a vector document means asking the same model to work in a language almost nobody wrote examples of.

The consequence: **the output of a design session is the artefact, not a picture of the artefact.**

## 3 · Who it is for

Developers and designer-developers who already run a coding agent and want a design surface for it. Small product teams without a dedicated designer. Anyone who would rather their design tool did not decide which model they are allowed to use.

## 4 · The problem

A coding agent can already write a good screen. What it cannot do is **look at it**.

It writes `login.html`, never renders it, and never learns that the label collides with the input, that the contrast fails, that the card is wider than its container. No eyes means no feedback, which means the second attempt is not better than the first — only different.

The second problem is ownership. AI design tools ship their own model and their own subscription, so a user who already pays for a coding agent is asked to buy the same capability twice, and to accept whichever model was chosen for them.

## 5 · The shape of the product

Three parts sharing one folder on disk.

```
my-design/
  artboards/
    login.html          each artboard is a real HTML file
    dashboard.html
  design.json           canvas positions, links, metadata
  marks.json            queue of user feedback from the canvas
```

| Part | What it is | Who runs it |
|---|---|---|
| **MCP server** | The bridge. Eight tools. Speaks stdio to the agent | Launched by the agent |
| **Web canvas** | Pan/zoom surface, artboards in iframes, file watcher, hot reload | A local server the user opens |
| **Skill** | Tool-neutral markdown so the user types `/design` | Installed into the user's agent |

**The folder is the interface between them [assumed].** Both sides already watch it, and a direct connection between the canvas and the MCP server would create a second source of truth for the same state.

## 6 · The MCP surface

Eight tools. This is the complete v1 surface, and a ninth needs a reason.

| Tool | Does |
|---|---|
| `list_artboards` | Names, sizes, positions, links — the canvas state as the agent sees it |
| `read_artboard` | The HTML of one artboard |
| `write_artboard` | Replace one artboard's HTML |
| `create_artboard` | New HTML file, placed on the canvas, registered in `design.json` |
| **`screenshot_artboard`** | **Render and return an image of an artboard as it actually looks** |
| `get_pending_marks` | The queue of user feedback left on the canvas |
| `clear_marks` | Acknowledge marks once acted on |
| `link_artboards` | Record a prototype link between two artboards |

## 7 · `screenshot_artboard` is the product

Without it the agent writes HTML blind. With it the loop becomes:

```
write  →  render  →  look  →  fix
```

That is the entire difference between output that looks designed and output that looks generated. An agent that can see its own spacing error corrects it in one turn; an agent that cannot will produce a different error instead.

**It is built third in the plan, not last.** Everything after it is comparatively cheap; everything before it exists to make it possible.

It needs a headless browser on the machine running the MCP server. The screenshot is taken at a declared viewport width, after fonts load and layout settles, and returned in a form a vision-capable model can read.

## 8 · The constraint that shapes the interaction

**MCP sampling is not supported in Claude Code.** The request, [issue 1785](https://github.com/anthropics/claude-code/issues/1785), has been open since 8 June 2025 and was still open on 13 September 2026. Support across MCP clients generally is uneven — some implement sampling, several of the widely used ones do not.

> **So the canvas cannot push work to the agent. The agent pulls, and the user triggers it.**

This is a client limitation rather than one of this product's making, and the design does not depend on sampling in any client. Sampling may arrive; the tool has to work today if it never does.

**Two softeners ship in v1:**

1. The bundled skill instructs the agent to **check pending marks at the start of every turn**, so marks are picked up without being asked for once a conversation is under way.
2. The canvas **displays the exact command to paste**, so triggering the agent is a copy rather than a sentence the user composes.

The seam is reduced, not removed, and the README states it rather than leaving a user to discover it.

## 9 · What v1 is

> **Done when the user types one sentence in their agent, an artboard appears on the canvas, and the agent has looked at its own screenshot and improved it once.**

**Nothing else ships until that runs end to end.** Work outside that path is deferred deliberately, and listed in the roadmap so it is remembered rather than started early.

## 10 · Build order

1. **Canvas** — pan/zoom, iframes, file watcher, hot reload
2. **MCP server** — list, read, write, create
3. **`screenshot_artboard`** — the quality loop. Third, not later
4. **Marks** — click an element, leave a comment, `get_pending_marks`
5. **The skill** — `/design`, plus check-marks-each-turn
6. **Prototype links** — nearly free once artboards are HTML
7. **Animation preview** — nearly free, same reason
8. **Export**, then the rest

Steps 1–3 are v1. Steps 4–5 make it usable by someone other than its author. Steps 6–8 are where the HTML-native decision starts paying for itself.

## 11 · The canvas

Pan and zoom over an infinite surface. Each artboard is an iframe showing the real file. A file watcher notices any change on disk — whether the agent, an editor or the user made it — and hot-reloads that one iframe.

**No UI framework [assumed].** The canvas is a transform, a set of iframes and a socket. A framework would be the largest dependency in the project and would earn nothing.

**Every artboard iframe is sandboxed**, both on the canvas and during a screenshot. An artboard is arbitrary HTML executing on the user's machine, and this is a first-commit requirement rather than later hardening. Concretely, and each one covered by a test that fails if it regresses:

- The screenshot render path keeps Chromium's own OS-level process sandbox on.
- The screenshot context blocks network egress — HTTP, HTTPS and WebSocket alike — and can read exactly one local file: the artboard being captured.
- A screenshot that never finishes rendering is abandoned after a bounded time rather than hanging indefinitely.
- An artboard shown live on the canvas carries a Content-Security-Policy closing the same network paths, since the canvas runs in an ordinary browser tab rather than the request-routed context the screenshot path controls.

## 12 · Marks

A mark is a piece of user feedback anchored to something on an artboard: a point, an element, a short comment. It lands in `marks.json`.

The agent reads them with `get_pending_marks` and acknowledges them with `clear_marks`. The canvas shows which marks are still pending, so the user can see what the agent has not yet dealt with.

Screenshots let the agent see. Marks let the user point.

## 13 · The skill

Ships in the repository as **tool-neutral markdown with thin per-host pointers [assumed]** — one set of words, several agents, nothing duplicated to drift.

What it encodes:

- `/design` as the entry point.
- **Check pending marks at the start of every turn.**
- After writing or changing an artboard, **take a screenshot and look at it** before reporting the work as done.
- Artboards are complete, standalone HTML documents.

The third instruction is the one that makes the tool work. An agent that skips the screenshot has the blind loop back.

## 14 · Prototype links and animation

Both are nearly free, and both are the argument for HTML-native.

A prototype link is an `<a href>` between two artboard files, mirrored into `design.json` so the canvas can draw the connection. Clicking through a flow is browsing.

Animation is CSS transitions, keyframes and the Web Animations API — already in the artboard, already running in the iframe. The canvas needs a replay control, not an animation engine.

In a vector model each of these is a subsystem with its own data model, editor and export path.

## 15 · Export

**v1: PNG and self-contained HTML [assumed].** The screenshot path already produces PNG, and a self-contained HTML export is the artboard with its assets inlined.

**PDF and PPTX come later.** They are new pipelines, not new buttons.

## 16 · Dependencies

Planned, and deliberately few. A local tool that already asks a user to install a headless browser has spent most of its dependency budget.

| Concern | Package | Licence |
|---|---|---|
| MCP server | `@modelcontextprotocol/sdk` | MIT |
| Headless browser | `playwright` **[assumed]** | Apache-2.0 |
| File watching | `chokidar` | MIT |
| Canvas socket | `ws` | MIT |
| Tool input schemas | `zod` | MIT |

MIT, Apache-2.0 and BSD only. Playwright is the working choice because it manages its own browser download rather than depending on a system browser that cannot be guaranteed.

**Implementation language: TypeScript on Node.js [assumed].** The MCP SDK's first-class language, the runtime the canvas needs anyway, and an install the target user already has.

## 17 · Non-goals

Not a vector editor · not a hosted service · not an API-key product · not a codebase editor · not a full-stack application builder.

The codebase line is worth stating plainly: Beziera is a place to design a screen that does not exist yet. Wiring a finished design back into a real repository is a genuinely different product, and if it is ever built here it comes long after v1.

## 18 · Known limitations

Stated here and in the README, and not to be quietly softened elsewhere.

**Output quality belongs to whichever model the user brings.** Beziera is a loop and a surface; what travels around the loop is whatever the agent produces. Expect strong results from a vision-capable frontier model and plain ones from a small local model — outside this project's control either way, and not yet measured, because nothing is built yet. The other half of the same fact is that the tool improves as models improve, without a release.

**The interaction has a manual seam.** The canvas cannot push work to the agent, so the user triggers it. Two softeners reduce it; nothing removes it until the clients people actually run implement sampling.

**A headless browser is a heavy dependency.** Large install, a process to manage, and a security surface. If it fails to install, `screenshot_artboard` fails — and that tool is the product.

**The name is not legally cleared.** It is available where it was checked; formal trademark clearance is outstanding.

## 19 · v1 acceptance

- [ ] The canvas opens in the browser with no manual setup.
- [ ] The MCP server registers in Claude Code, Codex and Gemini CLI, and all eight tools are listed by each.
- [ ] One sentence in the agent produces an artboard file, and it appears on the canvas without a refresh.
- [ ] Editing an artboard on disk hot-reloads only that iframe.
- [ ] `screenshot_artboard` returns a readable image at a declared viewport, and a vision-capable model can describe what is in it.
- [ ] **The agent takes a screenshot, identifies a real visual problem, and fixes it — unprompted, because the skill told it to.**
- [ ] A mark left on the canvas is visible to `get_pending_marks` and leaves the pending list after `clear_marks`.
- [ ] The canvas displays a paste-ready command for triggering the agent.
- [ ] Artboard iframes are sandboxed everywhere they render; the screenshot context keeps Chromium's own process sandbox on, cannot reach the network, can read only the artboard being captured, and abandons a capture that never finishes; the live canvas closes the same network paths with a Content-Security-Policy.
- [ ] A design folder contains no machine-specific path and works after being cloned by someone else.
- [ ] The README states both known limitations above the fold.
- [ ] Every README claim has working evidence or is labelled planned.

Items 1–6 are the v1 done-line. The rest are what makes it shippable.

## 20 · After v1

Recorded so it is remembered rather than re-invented, and so it is not confused with v1:

chat refinement in the canvas · inline comments on an artboard · direct edit with click-select, a properties panel and inline text · model-generated adjustment sliders · export to PDF and PPTX · undo and redo across the canvas · two-way sync with a codebase.

Some of what a mature design tool offers — clickable prototypes, animation, a multi-artboard canvas — arrives during v1 as a consequence of the architecture rather than as a feature. The expensive items are direct editing, adjustment sliders and codebase sync, and those are what "after v1" means.
