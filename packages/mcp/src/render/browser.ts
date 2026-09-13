import { chromium, type Browser } from "playwright";

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
