# Contributing

Beziera is pre-implementation. The specification, architecture and structure exist; working code does not yet.

**Implementation contributions are not being accepted until the foundation is complete.** Issues and discussion about the specification are welcome now, and the most useful thing you can bring is evidence about what an AI design loop actually needs to produce usable screens.

## When contributions open

1. Read [`AGENTS.md`](AGENTS.md) first — it is the contract for humans and agents alike.
2. An artboard is a real HTML file on disk. A change that makes it mean anything else will not be merged.
3. A change that writes or alters an artboard must render it and look at the result. Rendering is not optional.
4. `core` is the only package that touches disk, and it imports neither the MCP server nor the canvas.
5. Every artboard iframe is sandboxed, and the screenshot context does not reach the network.
6. Every new dependency needs its licence stated in the pull request. MIT, Apache-2.0 or BSD only.
7. Never claim a capability works without evidence in the pull request. A planned capability is labelled planned.

## Scope

v1 is one thing: one sentence in the agent produces an artboard, and the agent improves it once after looking at its own screenshot. Work outside that path is deferred on purpose, not by accident — the roadmap lists what comes after.

If you want to build something from the roadmap, open an issue first so it is not written twice.

## Commit messages

Describe what changed and why. If the change affects the design folder format, say so explicitly — that format is a public contract.
