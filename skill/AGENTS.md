# Beziera design folder — agent instructions

This folder is a **Beziera design folder**: `artboards/*.html`, `design.json`, `marks.json`, opened on a canvas at `npx beziera` while a coding agent — you — talks to the same folder over MCP.

**This file is the one source of these instructions.** Whatever tool you are — Claude Code, Codex, Gemini CLI, Cursor — you were pointed here by a thin file that does not repeat any of this. If anything you read elsewhere in this folder disagrees with this file, this file wins.

The eight MCP tools available: `list_artboards`, `read_artboard`, `write_artboard`, `create_artboard`, `link_artboards`, `screenshot_artboard`, `get_pending_marks`, `clear_marks`.

## `/design` is the entry point

When the user types `/design` — or otherwise asks for design work in this folder — this file is the procedure to follow. There is no other document to check first.

## 1 · Check pending marks, before anything else, every turn

**The canvas cannot reach you.** There is no mechanism that pushes a mark from the canvas into this conversation — that is a real limitation of MCP clients today, not something this folder works around. A mark the user left by clicking on the canvas sits in `marks.json` until an agent asks for it.

So you ask for it, first, on every turn, whether or not the user mentions marks:

1. Call `get_pending_marks`.
2. If the queue is empty, continue to whatever the user actually asked for.
3. If it is not empty, treat every pending mark as part of the task — even one the user never restated in this conversation. Open the artboard it refers to, understand what element it points at and what the comment says, and act on it.
4. Once you have acted on a mark, call `clear_marks` for it (or for all of them, once every pending mark for this turn is handled). Do not clear a mark before you have actually addressed what it says.

If the user pastes the command the canvas shows them (something like *"check Beziera's pending design marks..."*), that command means exactly this step. Run it the same way you would if you had thought of it yourself.

## 2 · Write → render → look → fix

This is the instruction that makes the tool work. Skipping it is the one mistake that matters most in this folder.

A coding agent that writes HTML and reports it done without rendering it has no way to know the label collides with the input, that the text fails contrast against its background, or that the card is wider than the screen it sits on. It has no eyes unless it uses them.

**After writing or changing any artboard — every time, no exceptions — do all four steps before telling the user it is done:**

1. **Write.** Use `create_artboard` for a new artboard, `write_artboard` to change an existing one. The HTML you send is a complete, standalone document — see the rule below.
2. **Render.** Call `screenshot_artboard` for the artboard you just touched. Pick the `desktop` or `mobile` viewport that matches what you were asked to build; when unsure, `desktop` is the default.
3. **Look.** The tool returns an actual image. Look at it, not just at the fact that it returned successfully. Check, concretely: does anything overlap or get clipped? Is the spacing even, or does something sit too close to an edge? Does text hold enough contrast against what is behind it? Does the layout match what was asked for — a login form is centred and narrow, a dashboard is wide, a settings page reads top to bottom? Does it look like it was designed, or does it look like the first thing that compiled?
4. **Fix.** If the screenshot shows a real problem, edit the HTML and call `write_artboard` again, then `screenshot_artboard` again to confirm the fix actually worked. Repeat until the image looks right. Only then report the work as done.

An agent that skips step 3 and 4 — that writes the HTML and immediately reports success — has the old blind loop back, and the rest of this tool is wasted on it.

## The rule about the artefact itself

**An artboard is a complete, standalone HTML document.** `<!doctype html>`, a `<head>`, a `<body>` — everything the page needs to render on its own, with styles inline or in a `<style>` block, not a fragment that only means something inside this canvas's own wrapper.

The reason: the artboard **is** the output of a Beziera session, not a picture of the output. A fragment breaks that promise even if it renders correctly inside the canvas's iframe.

## Orientation, if you need it

`list_artboards` shows what already exists on the canvas — names, sizes, positions, links — before you decide whether to create or change something. `read_artboard` returns one artboard's current HTML. `link_artboards` records a prototype link (a real `<a href>` between two artboard files) so the canvas can draw it; add the `<a href="other.html">` in the HTML itself first, then record it.

None of this replaces steps 1 and 2 above. Checking marks and looking at your own screenshot are not optional parts of "good practice" here — they are the two things this folder exists to make automatic.
