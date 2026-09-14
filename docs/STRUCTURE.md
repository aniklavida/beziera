# Folder structure

**Nothing here exists yet.** This is the shape the first commits build into.

## The naming rule

**Two vocabularies, kept apart.**

- **Product words** — `artboard`, `canvas`, `mark`, `link`. These appear in the MCP tool names, in the file format, in the interface and in the documentation. A user learns four nouns and knows the whole product.
- **Engineering words** — ordinary ones. `server`, `cli`, `core`, `tools`. No invented dialect; a structure nobody recognises is a structure nobody contributes to.

The rule that matters: **`artboard` always means a real HTML file on disk.** Never a record in memory, never a node in a tree, never a rendered preview. The moment it means two things, the architecture has started leaking.

## Repository

```
beziera/
├── README.md · LICENSE · CHANGELOG.md
├── CONTRIBUTING.md · SECURITY.md · CODE_OF_CONDUCT.md
├── AGENTS.md · CLAUDE.md · GEMINI.md
├── .github/
│   ├── ISSUE_TEMPLATE/ · PULL_REQUEST_TEMPLATE.md
│   └── workflows/validate.yml
├── docs/
│   └── SPEC.md · ARCHITECTURE.md · STRUCTURE.md · ROADMAP.md · RELEASE_CHECKLIST.md
│
├── packages/
│   ├── core/        the design folder: read, write, validate, watch
│   ├── mcp/         the MCP server — the bridge
│   ├── canvas/      the web canvas
│   └── cli/         starts the canvas, prints the MCP configuration
│
├── skill/           the shipped skill, tool-neutral markdown
└── examples/        one worked design folder, with real content
```

**Four packages, not three.** `core` exists because the MCP server and the canvas both read and write the same three files. Without it, `design.json` gets parsed twice by two pieces of code that will drift, and the format stops being a format.

## `packages/core` — the design folder

The only code allowed to touch disk.

```
core/src/
├── design/
│   ├── folder.ts          open, validate, create a design folder
│   ├── artboards.ts       list, read, write, create — HTML files
│   ├── design-json.ts     positions, links, metadata
│   └── marks-json.ts      the feedback queue
├── render/
│   ├── browser.ts         headless browser lifecycle — launch once, reuse, tear down
│   └── capture.ts         viewport, font settling, image encoding — screenshot_artboard and PNG export both call this
├── export/
│   └── inline-html.ts     self-contained HTML export: local assets inlined as data URIs or literal text
├── watch/
│   └── watcher.ts         emits which file changed
└── schema/
    └── *.ts               schemas, shared by MCP tools and canvas
```

**One schema definition, two consumers.** The MCP tool inputs and the canvas validate against the same schemas. A format described in two places is a format that breaks in one of them.

**`render/` lives here, not in `mcp`, because two packages need it.** `screenshot_artboard` and the canvas's PNG export are the same headless-browser capture from two callers; putting it anywhere but the package both already depend on would mean choosing one caller to import the other, or duplicating browser lifecycle management in two places.

## `packages/mcp` — the bridge

```
mcp/src/
├── server.ts              stdio transport, tool registration
└── tools/
    ├── list-artboards.ts
    ├── read-artboard.ts
    ├── write-artboard.ts
    ├── create-artboard.ts
    ├── screenshot-artboard.ts   calls into @beziera/core's render module
    ├── get-pending-marks.ts
    ├── clear-marks.ts
    └── link-artboards.ts
```

**One file per tool.** Eight tools, eight files, and the registration list in `server.ts` reads as the product's whole surface.

## `packages/canvas` — the surface

```
canvas/
├── server/
│   ├── serve.ts           static files plus the artboard folder
│   └── socket.ts          broadcasts "this file changed"
└── web/
    ├── canvas.ts          pan, zoom, the transform
    ├── artboard.ts        one sandboxed iframe per artboard
    ├── marks.ts           place a mark, show which are pending
    ├── command.ts         the paste-ready command for triggering the agent
    └── style.css
```

**No UI framework.** Pan/zoom is a transform, artboards are iframes, updates arrive on a socket. A framework would be the largest dependency in the repository and would earn nothing.

**`artboard.ts` owns the sandbox.** Every iframe is created in exactly one place, so the sandbox attributes cannot be forgotten by the next person who adds a way to display an artboard.

## `packages/cli`

```
cli/src/
└── index.ts               in a folder: create it if new, start the canvas,
                           open the browser, print the MCP configuration to paste
```

Deliberately thin. Its job is that a user who has read no documentation gets a canvas and the exact lines to add to their agent's MCP configuration.

## `skill/`

```
skill/
├── design.md              the source — tool-neutral
└── pointers/              thin per-host files that read the same words
```

One set of instructions, several hosts, nothing duplicated to drift.

## A design folder

What a user's own project looks like:

```
my-design/
├── artboards/
│   ├── login.html
│   ├── dashboard.html
│   └── settings.html
├── design.json            positions, links, metadata
└── marks.json             pending feedback
```

Three kinds of file, all text, all diffable, all committable.

## Boundaries

- **`core` is the only package that touches disk.** `mcp` and `canvas` go through it.
- **`core` imports neither `mcp` nor `canvas`.**
- **Schemas are defined once, in `core`.**
- **Every iframe is created in `artboard.ts`.**
- **`render/` owns every headless-browser call.**

The first two are checkable by a dependency test in CI. The last three are review rules, and the contributor instructions say so rather than pretending a linter enforces them.
