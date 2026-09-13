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

/** Get the shared browser, launching it if this is the first call. */
export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
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
 * URL schemes a captured artboard may load without leaving the machine:
 * the file itself, data/blob URIs it constructs in memory, and the blank
 * page Chromium starts a context on. Every other scheme — http, https, ws,
 * wss, and anything else — is a network request and is refused.
 */
const LOCAL_ONLY_PROTOCOLS = new Set(["file:", "data:", "blob:", "about:"]);

/**
 * Open a browser context that cannot reach the network.
 *
 * This is a locked decision (DECISIONS.md), not a hardening pass added
 * later: an artboard is arbitrary HTML, usually written by a language
 * model, and it must not be able to phone home while it is captured. The
 * block is enforced here, at the context level, on every request Chromium
 * makes in this context — not by convention, and not by trusting that the
 * HTML happens not to try. `screenshot_artboard` is the only place this
 * product renders an artboard, so this is the only context it ever opens.
 */
export async function createNetworkBlockedContext(
  browser: Browser,
  options: Parameters<Browser["newContext"]>[0] = {}
): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (LOCAL_ONLY_PROTOCOLS.has(url.protocol)) {
      void route.continue();
    } else {
      void route.abort("blockedbyclient");
    }
  });
  return context;
}
