import { pathToFileURL } from "node:url";
import type { Browser } from "playwright";
import { createNetworkBlockedContext } from "./browser.js";

/**
 * Declared viewport widths `screenshot_artboard` renders at. An agent must
 * know what it is looking at rather than guess, so the width is always one
 * of these two named presets — never an implicit default that drifts.
 *
 * Heights are the initial viewport only; the capture itself is full-page,
 * so an artboard taller than its viewport is still captured completely.
 */
export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

export interface CaptureOptions {
  /** Which declared viewport to render at. Defaults to "desktop". */
  viewport?: ViewportName;
}

export interface CaptureResult {
  /** The captured image, PNG-encoded. */
  readonly png: Buffer;
  /** The actual pixel dimensions of the PNG, read back from the file itself. */
  readonly width: number;
  readonly height: number;
  /** The viewport the page was rendered at. */
  readonly viewport: { width: number; height: number };
  /** Wall-clock time the capture took, in milliseconds. */
  readonly captureMs: number;
}

/**
 * Render one local HTML file in a network-blocked, headless browser context
 * and return a full-page PNG screenshot.
 *
 * Waits for the page's load event, then for `document.fonts.ready`, then one
 * extra animation frame — a capture taken mid-layout or before a web font
 * swaps in teaches the agent to fix a problem that does not exist. The
 * browser is expected to already be running; this opens and tears down only
 * the one context and page the capture needs.
 */
export async function captureHtmlFile(
  browser: Browser,
  absoluteHtmlPath: string,
  options: CaptureOptions = {}
): Promise<CaptureResult> {
  const viewport = VIEWPORTS[options.viewport ?? "desktop"];
  const startedAt = performance.now();

  const fileUrl = pathToFileURL(absoluteHtmlPath).href;
  const context = await createNetworkBlockedContext(browser, { viewport }, fileUrl);
  try {
    const page = await context.newPage();
    await page.goto(fileUrl, { waitUntil: "load" });
    // Evaluated as page-context JavaScript, not type-checked against Node's
    // lib — this package has no DOM lib configured, and adding one would
    // leak browser globals into every other module in it.
    await page.evaluate("document.fonts.ready");
    await page.evaluate(
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))"
    );

    const png = await page.screenshot({ type: "png", fullPage: true });
    const dimensions = readPngDimensions(png);

    return {
      png,
      width: dimensions.width,
      height: dimensions.height,
      viewport,
      captureMs: performance.now() - startedAt,
    };
  } finally {
    await context.close();
  }
}

/**
 * Read a PNG's pixel dimensions straight from its IHDR chunk, rather than
 * trusting the DOM's own idea of its size (a device scale factor or a
 * scrollbar can make the two disagree). No image-decoding dependency
 * needed: the signature is 8 bytes, the first chunk is always IHDR, and its
 * first 8 bytes are width then height, both big-endian uint32.
 */
export function readPngDimensions(png: Buffer): { width: number; height: number } {
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}
