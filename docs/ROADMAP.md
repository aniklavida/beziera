# Roadmap to v1.0

One useful, market-ready release, then maintenance driven by real issues and demand.

**Nothing below is built.** Steps 1 to 3 are the v1 done-line; the rest is what makes it shippable.

## 0 · Lock

Positioning, scope, the tool surface, the file format and the folder structure are agreed and recorded.

**Done:** no unresolved product contradiction remains.

## 1 · Canvas

Pan and zoom over an infinite surface. Artboards in sandboxed iframes. A file watcher that hot-reloads a single iframe when its file changes on disk.

**Done:** editing an artboard in any editor updates the canvas without a refresh, and nothing else on the canvas reloads.

## 2 · MCP server

The bridge: `list_artboards`, `read_artboard`, `write_artboard`, `create_artboard`.

**Done:** Claude Code, Codex and Gemini CLI each register the server and list its tools, and one sentence in any of them produces an artboard that appears on the canvas.

## 3 · `screenshot_artboard`

The quality loop. A headless browser, a declared viewport, fonts settled, an image returned in a form a vision-capable model can read.

**Third, not later.** Everything after it is comparatively cheap; everything before it exists to make it possible.

**Done:** the agent renders an artboard it just wrote, describes what is actually in the image, identifies a real visual problem, and fixes it. **This is the v1 done-line.**

## 4 · Marks

Click an element on the canvas, leave a comment, and it queues in `marks.json`. `get_pending_marks` and `clear_marks` on the agent side. The canvas shows what is still pending, and displays the exact command to paste.

**Done:** a mark left on the canvas is acted on in the next agent turn without the user describing it again.

## 5 · The skill

`/design` as the entry point. Check pending marks at the start of every turn. Render and look before reporting work as done.

**Done:** a user who has read no documentation gets the full loop from one slash command.

## 6 · Prototype links

Links between artboard files, mirrored into `design.json` so the canvas can draw them.

**Done:** clicking through a flow works on the canvas and in a browser opening the files directly.

## 7 · Animation preview

CSS transitions, keyframes and the Web Animations API already run in the iframe. The canvas needs a replay control.

**Done:** an animation can be replayed on the canvas without reloading the artboard.

## 8 · Export, packaging and release

PNG and self-contained HTML export. The CLI, installation, documentation, a demo, release automation and clean-install proof.

**Done:** a new user can install, run and demonstrate the whole promise without help.

## After v1.0

Maintain compatibility. Fix reproducible bugs and security issues. Then, in rough order of cost:

chat refinement inside the canvas · inline comments on an artboard · direct edit with click-select, a properties panel and inline text · model-generated adjustment sliders · export to PDF and PPTX · undo and redo across the canvas · two-way sync with a codebase.

These are recorded so they are remembered rather than started early. Some of what a mature design tool offers — clickable prototypes, animation, a multi-artboard canvas — arrives during v1 as a consequence of the architecture. The expensive items are direct editing, adjustment sliders and codebase sync.

Features are added from repeated user evidence, not from this list alone.
