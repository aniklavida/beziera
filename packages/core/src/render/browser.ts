import { chromium, type Browser, type BrowserContext } from "playwright";

/**
 * The one shared headless Chromium instance for this server process.
 *
 * Launched once, on first use, and reused for every screenshot after that —
 * starting a fresh browser per call would make the most-used tool the
 * slowest one. `screenshot_artboard` is the only caller; nothing else in
 * this package launches a browser.
 */
let browserPromise: Promise<Browser> | null = null;

/**
 * Launch options for the one Chromium instance this server ever starts.
 * Exported so a test can launch the exact same configuration and prove what
 * it actually asked for, rather than a hand-copied duplicate that could
 * drift from what `getBrowser` really uses.
 *
 * `chromiumSandbox: true` keeps Chromium's own OS-level process sandbox on.
 * Playwright's default is the opposite — unless this is set, it launches
 * with `--no-sandbox`, which hands every renderer process (the one that
 * parses and runs an artboard's HTML and script) the same privileges as
 * whatever user is running this server. An artboard is untrusted,
 * model-written HTML; it must run inside Chromium's own sandbox like any
 * other untrusted web content, not next to it.
 */
export const CHROMIUM_LAUNCH_OPTIONS: Parameters<typeof chromium.launch>[0] = {
  headless: true,
  chromiumSandbox: true,
};

/** Get the shared browser, launching it if this is the first call. */
export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch(CHROMIUM_LAUNCH_OPTIONS);
  }
  return browserPromise;
}

/**
 * Close the shared browser, if one was ever launched. Idempotent — safe to
 * call from a shutdown path even when no screenshot was ever taken.
 *
 * A leaked browser process is the most likely bug in this product: the
 * MCP server's stdio transport can close without the Node process exiting
 * on its own while a Chromium child process still holds the event loop
 * open. The server's shutdown path is responsible for calling this.
 */
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) {
    return;
  }
  const pending = browserPromise;
  browserPromise = null;
  const browser = await pending;
  await browser.close();
}

/**
 * URL schemes a captured artboard may load without leaving the machine: the
 * data/blob URIs it constructs in memory, and the blank page Chromium starts
 * a context on. `file:` is handled separately, below — it is local, but not
 * every local file is this artboard's own. Every other scheme — http,
 * https, ws, wss, and anything else — is a network request and is refused.
 */
const LOCAL_ONLY_PROTOCOLS = new Set(["data:", "blob:", "about:"]);

/**
 * Open a browser context that cannot reach the network, and can read exactly
 * one local file: the artboard being captured.
 *
 * The network block is a requirement of the feature rather than hardening
 * added on top of it: an artboard is arbitrary HTML, usually written by a
 * language model, and it must not be able to phone home while it is
 * captured. It is enforced here, at the context level, on every request
 * Chromium makes in this context — not by convention, and not by trusting
 * that the HTML happens not to try. `screenshot_artboard` is the only place
 * this product renders an artboard, so this is the only context it ever
 * opens.
 *
 * `allowedFileUrl` is the one `file:` URL this context may load — the
 * artboard's own HTML file, navigated to once by `captureHtmlFile`. Without
 * it, an artboard could still read any other file the server process can
 * see (an SSH key, another user's design folder, `/etc/passwd`) through a
 * plain `<img>`, `<iframe>` or `fetch()` pointed at a `file://` URL, and have
 * its contents rendered straight into the screenshot handed back to the
 * agent. Blocking `file:` outright is not an option — the artboard's own
 * document has to load the same way — so the one URL actually being
 * captured is the only `file:` request this context ever allows through.
 */
export async function createNetworkBlockedContext(
  browser: Browser,
  options: Parameters<Browser["newContext"]>[0] = {},
  allowedFileUrl?: string
): Promise<BrowserContext> {
  const allowedFilePath = allowedFileUrl ? new URL(allowedFileUrl).pathname : null;
  const context = await browser.newContext(options);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "file:") {
      if (allowedFilePath !== null && url.pathname === allowedFilePath) {
        void route.continue();
      } else {
        void route.abort("blockedbyclient");
      }
    } else if (LOCAL_ONLY_PROTOCOLS.has(url.protocol)) {
      void route.continue();
    } else {
      void route.abort("blockedbyclient");
    }
  });
  // `context.route` above never sees a WebSocket handshake — Playwright
  // routes HTTP(S) requests and WebSocket connections through two separate
  // mechanisms, and the block above only ever covered the first. Without
  // this, a `new WebSocket("wss://...")` inside an artboard would connect
  // straight out, the one network path the HTTP-request block left open.
  // A routed WebSocket does not connect to a real server unless the handler
  // asks it to (`connectToServer`), so simply never doing that — then
  // closing it — refuses the connection without ever dialing out.
  await context.routeWebSocket("**/*", (ws) => {
    void ws.close({ code: 1006, reason: "blocked: no network during capture" });
  });
  return context;
}
