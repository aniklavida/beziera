import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { CHROMIUM_LAUNCH_OPTIONS } from "./browser.js";

/**
 * Chromium's own OS-level process sandbox, proven from the real command
 * line rather than assumed from the launch options object. Playwright
 * silently adds `--no-sandbox` unless `chromiumSandbox: true` is passed, so
 * reading back the options is not enough — this launches the exact
 * configuration `getBrowser` uses and asks the running browser what it was
 * actually started with.
 *
 * `Browser.getBrowserCommandLine` only answers when `--enable-automation`
 * is present, so this test adds it on top of the real launch options —
 * purely for introspection, never part of what `getBrowser` itself passes.
 */
test("Chromium's own process sandbox is not disabled at launch — proven, not assumed", async () => {
  const browser = await chromium.launch({
    ...CHROMIUM_LAUNCH_OPTIONS,
    args: [...(CHROMIUM_LAUNCH_OPTIONS?.args ?? []), "--enable-automation"],
  });
  try {
    const session = await browser.newBrowserCDPSession();
    const { arguments: commandLine } = (await session.send(
      "Browser.getBrowserCommandLine" as never
    )) as { arguments: string[] };
    assert.ok(
      !commandLine.includes("--no-sandbox"),
      `expected Chromium's own process sandbox to stay enabled, but found --no-sandbox in: ${commandLine.join(" ")}`
    );
  } finally {
    await browser.close();
  }
});
