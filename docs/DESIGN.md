# Visual identity and design system

This document defines the visual identity and UI specifications for Beziera, an agent-driven design canvas.

## Scope

The visual identity applies to the canvas shell and application chrome in `packages/canvas/web`:
- Application header and document navigation
- Artboard chrome (toolbars, artboard labels, replay controls, export actions)
- Prototype link rendering (flow arrows and markers)
- Design marks and review tools (mark toggle, pending queue, command box, comment popovers)
- Application states (loading, empty, error, connected status)

Artboard contents belong entirely to user designs and are never restyled by the chrome; they execute inside sandboxed frames and render exactly as authored.

## Audience and intent

Beziera is built for designers and developers working alongside an AI agent. Because the user's creative work is the subject of the canvas, the interface chrome is intentionally calm, neutral, and unobtrusive. The chrome stays out of the way so the user's artboards remain the visual focal point.

## Brand decisions and values

Beziera derives its visual identity from the project's design system with five specific brand variables:

| Variable | Value | Rationale |
|---|---|---|
| **Brand hue (`--brand-h`)** | `290` (violet) | A distinct, focused hue suitable for creative and agent tooling. |
| **Brand chroma (`--brand-c`)** | `0.12` | Restrained saturation that avoids visual fatigue while providing clear interactive feedback. |
| **Warmth (`--warmth`)** | `0.008` | Minimal neutral chroma producing crisp, neutral dark and light surfaces without heavy tinting. |
| **Radius scale (`--radius-scale`)** | `0.8` | Precise, compact corners (`--r-xs`: 3.2px, `--r-sm`: 5.6px, `--r-md`: 8px, `--r-lg`: 11.2px) conveying technical accuracy. |
| **Type pairing** | System | Native OS UI font stack paired with system monospace. |

### Vibe words

- **Quiet:** Low-contrast surfaces and hairline borders keep interface elements secondary to canvas artboards.
- **Precise:** Sharp alignment, compact spacing, tabular figures, and geometric consistency.
- **Fast:** Instant feedback, zero asset network latency, and low visual overhead.

## Theme defaults and persistence

- **Default theme:** Dark theme is the default mode, optimized for creative canvas tools.
- **Light theme:** Full light theme is provided for bright working environments.
- **Persistence:** Theme selection is persisted in `localStorage` under the key `beziera-theme`.
- **System preference:** If no manual preference has been chosen, the interface respects the OS preference (`prefers-color-scheme`), defaulting to dark when unspecified.
- **Implementation:** Themes are controlled by the `data-theme` attribute on the root HTML element (`data-theme="dark"` or `data-theme="light"`).

## Non-negotiables

1. **One primary action per screen:** Accent-colored buttons are strictly limited to the singular dominant action in a given view (e.g. "Leave mark" in the mark submission popover, or the active mark mode toggle).
2. **Accent under 5%:** The violet accent color is reserved for active states, focus rings, and primary buttons. Chrome surfaces remain neutral.
3. **Labels above inputs:** Every text input or textarea provides a visible label placed directly above the field.
4. **No gradients:** Surfaces use flat fills with hairline borders (`1px solid var(--bd)`). Background canvas patterns use flat SVG vector dots without CSS gradients.
5. **No coloured left borders:** Alerts, cards, and selections use uniform borders and subtle surface fills.
6. **No emoji in chrome:** Chrome controls and system messages use precise text labels and standard typography.
7. **No zebra tables:** Any tabular data uses clean hairline dividers and hover fills.
8. **No modals for forms:** Inline popovers and side panels are used for form interactions rather than blocking modal dialogs.
9. **Sentence-case copy:** All copy, buttons, labels, and feedback messages use clear, direct sentence case without jargon or unearned exclamation marks.
10. **Design every state:** Complete interface implementations exist for ideal, empty, loading, and error states.

## Fonts and iconography

- **Zero font downloads:** Beziera ships no font files and makes no requests to third-party font CDNs. The typography relies exclusively on system font stacks (`system-ui` and `ui-monospace`).
- **Zero icon packs:** Beziera ships no icon fonts, symbol packs, or heavy vector sprites. Navigation and actions use plain language text ("words first"), and the product identity is presented as a clean typographical wordmark set in the display face.
