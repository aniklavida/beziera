# v1.0 release checklist

## Truth

- [ ] Every public claim has working evidence or is clearly labelled planned.
- [ ] No comparison, compatibility table or benchmark is presented as measured unless someone measured it.
- [ ] The specification, the documentation and the implementation agree.
- [ ] Both known limitations are stated in the README, above the fold, and not softened elsewhere.

## The loop

- [ ] One sentence in the agent produces an artboard, and it appears on the canvas without a refresh.
- [ ] `screenshot_artboard` returns a readable image at a declared viewport.
- [ ] The agent renders its own artboard, identifies a real visual problem, and fixes it unprompted.
- [ ] A mark left on the canvas is acted on in the next agent turn.
- [ ] The canvas displays a paste-ready command for triggering the agent.

## Hosts

- [ ] The MCP server registers in Claude Code, Codex and Gemini CLI, and each lists all eight tools.
- [ ] Every tool behaves identically in each host, and any difference is documented.

## The format

- [ ] A design folder is text, diffable and committable.
- [ ] No machine-specific path appears in `design.json` or `marks.json`.
- [ ] A design folder cloned by another person opens and renders unchanged.

## Security

- [ ] Every artboard iframe is sandboxed.
- [ ] The screenshot context cannot reach the network.
- [ ] No path can escape the design folder.
- [ ] The canvas server binds to localhost only.
- [ ] No browser process is left running after the MCP server shuts down.

## Engineering

- [ ] Unit tests for the core package pass.
- [ ] Integration tests run the MCP server and call every tool.
- [ ] The package-boundary dependency test passes.
- [ ] Rendering is verified by actually rendering.
- [ ] All suites run green from a clean checkout, in CI.

## Repository

- [ ] Every shipped dependency is listed with its licence and is MIT, Apache-2.0 or BSD.
- [ ] README, specification, architecture, structure and troubleshooting are complete.
- [ ] Security policy, code of conduct and contributor instructions are complete.
- [ ] Repository description, topics and homepage are set.
- [ ] CI passes.
- [ ] Working tree is clean and local HEAD matches the remote.

## Launch

- [ ] A 90-second demo shows one sentence becoming an artboard, and the agent improving it after looking at it.
- [ ] Installation works from a clean machine with no prior setup.
- [ ] Release notes and changelog are accurate.
- [ ] The tag is created only after every box above is ticked.
