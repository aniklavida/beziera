# Security policy

## Supported versions

Beziera has no public release yet, so no version is supported.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability, a leaked credential, or anything containing private data. GitHub private vulnerability reporting must be enabled before v1.0.

Include the affected commit, reproduction steps, impact and sanitized evidence. Never include a real token or key.

## Security model

The thing to understand about this product is that **an artboard is arbitrary HTML executing on the user's machine**, and it is often HTML a language model wrote. The design treats it as untrusted.

- Every artboard renders in a **sandboxed iframe**.
- The screenshot context **does not reach the network**, so an artboard cannot exfiltrate anything it was given.
- The canvas server binds to localhost, and serves the design folder — never a path above it.
- The MCP server reads and writes inside the design folder only. A path that escapes it is rejected rather than normalised.
- No API key, no account, no telemetry. There is no credential to leak because the tool does not hold one.
- A design folder contains no machine-specific paths, so sharing or committing one leaks nothing about the machine it was made on.

## Reporting scope

A path that escapes the design folder, an artboard that reaches the network during a screenshot, an iframe that runs unsandboxed, or the canvas server binding beyond localhost are all security issues and should be reported privately rather than opened as bugs.
