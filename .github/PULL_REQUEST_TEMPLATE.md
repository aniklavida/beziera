## What changed


## Why


## Scope

- [ ] On the path to v1 as `docs/ROADMAP.md` defines it
- [ ] Deferred work that was agreed in an issue first
- [ ] Documentation, tests or repository maintenance only

## The artboard rule

- [ ] An artboard still means exactly one thing: a real HTML file on disk
- [ ] No second representation of the same screen was introduced
- [ ] The design folder stays text, diffable and free of machine-specific paths

## Boundaries

- [ ] Only the core package touches disk
- [ ] The core package imports neither the MCP server nor the canvas
- [ ] Schemas are defined once and shared
- [ ] Not applicable

## Rendering

- [ ] This change alters how an artboard is written or displayed, and it was rendered and looked at
- [ ] Screenshot attached
- [ ] Not applicable

## Security

- [ ] Artboard iframes remain sandboxed
- [ ] The screenshot context still cannot reach the network
- [ ] No path can escape the design folder
- [ ] Not applicable

## Verification evidence

- [ ] Tests added or updated
- [ ] Documentation updated where behaviour changed
- [ ] Every claim in this pull request has evidence, or is labelled planned

## Dependencies

- [ ] No new dependency
- [ ] New dependency declared with its licence, and it is MIT, Apache-2.0 or BSD

## Risk and limitations


## Provenance

- [ ] No copied or adapted code
- [ ] Copied or adapted code is declared with its source, commit and licence
