import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { createNetworkBlockedContext } from "./browser.js";
import { captureHtmlFile, readPngDimensions, VIEWPORTS } from "./capture.js";

/** One shared browser for every test in this file — the pattern the real server uses. */
let browser: Browser;
test.before(async () => {
  browser = await chromium.launch();
});
test.after(async () => {
  await browser.close();
});

async function writeTempHtml(html: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-capture-test-"));
  const file = path.join(dir, "artboard.html");
  await fs.writeFile(file, html, "utf8");
  return file;
}

const COLORFUL_ARTBOARD = `<!doctype html>
<html><head><style>
  body { margin: 0; font-family: sans-serif; }
  .band { height: 80px; }
  .a { background: #d1453b; } .b { background: #2a8a5f; } .c { background: #3454d1; }
  h1 { position: absolute; top: 20px; left: 20px; color: white; }
</style></head>
<body>
  <div class="band a"></div><div class="band b"></div><div class="band c"></div>
  <h1>Northstar</h1>
</body></html>`;

test("captures a non-trivial, correctly sized PNG at the desktop viewport", async () => {
  const file = await writeTempHtml(COLORFUL_ARTBOARD);
  const result = await captureHtmlFile(browser, file);

  assert.equal(result.viewport.width, VIEWPORTS.desktop.width);
  assert.equal(result.width, VIEWPORTS.desktop.width);
  assert.equal(result.height, VIEWPORTS.desktop.height);
  // A blank page PNG at this size compresses to well under 2KB; real content does not.
  assert.ok(result.png.length > 5_000, `expected a non-trivial PNG, got ${result.png.length} bytes`);
  assert.equal(result.png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a"); // PNG signature
});

test("the mobile viewport is narrower than desktop and both are honoured", async () => {
  const file = await writeTempHtml(COLORFUL_ARTBOARD);
  const desktop = await captureHtmlFile(browser, file, { viewport: "desktop" });
  const mobile = await captureHtmlFile(browser, file, { viewport: "mobile" });

  assert.equal(desktop.width, VIEWPORTS.desktop.width);
  assert.equal(mobile.width, VIEWPORTS.mobile.width);
  assert.ok(mobile.width < desktop.width);
});

test("a blank page and a colourful page produce distinguishably different PNGs", async () => {
  const blankFile = await writeTempHtml("<!doctype html><html><body></body></html>");
  const colourfulFile = await writeTempHtml(COLORFUL_ARTBOARD);

  const blank = await captureHtmlFile(browser, blankFile);
  const colourful = await captureHtmlFile(browser, colourfulFile);

  assert.notEqual(blank.png.length, colourful.png.length);
  assert.ok(colourful.png.length > blank.png.length);
});

test("readPngDimensions reads the IHDR chunk back out correctly", async () => {
  const file = await writeTempHtml(COLORFUL_ARTBOARD);
  const result = await captureHtmlFile(browser, file, { viewport: "mobile" });
  const dims = readPngDimensions(result.png);
  assert.equal(dims.width, VIEWPORTS.mobile.width);
  assert.equal(dims.height, result.height);
});

test("capture is fast enough to call every turn (warm browser, generous CI bound)", async () => {
  const file = await writeTempHtml(COLORFUL_ARTBOARD);
  await captureHtmlFile(browser, file); // warm-up, not measured
  const result = await captureHtmlFile(browser, file);
  assert.ok(
    result.captureMs < 3_000,
    `expected a warm capture well under 3s, took ${result.captureMs.toFixed(1)}ms`
  );
});

test("an artboard cannot reach the network during capture — proven, not assumed", async () => {
  let requestsReceived = 0;
  const server = http.createServer((_req, res) => {
    requestsReceived++;
    res.writeHead(200, { "content-type": "image/png" });
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the test server to bind a port");
  }
  const port = address.port;

  try {
    const html = `<!doctype html><html><body>
      <img src="http://127.0.0.1:${port}/probe.png" onerror="window.__imgFailed = true" />
      <script>
        window.__fetchSettled = fetch('http://127.0.0.1:${port}/probe.json')
          .then(() => 'resolved')
          .catch(() => 'rejected');
      </script>
    </body></html>`;
    const file = await writeTempHtml(html);

    // Exercised through the exact primitive captureHtmlFile uses — a
    // network-blocked context — rather than a hand-rolled one, so this test
    // proves what a real screenshot_artboard call does, not a lookalike.
    const context = await createNetworkBlockedContext(browser, { viewport: VIEWPORTS.desktop });
    try {
      const page = await context.newPage();
      await page.goto(`file://${file}`, { waitUntil: "load" });
      const png = await page.screenshot({ type: "png" });
      assert.ok(png.length > 0, "the page must still render even though its network calls fail");

      const fetchOutcome = await page.evaluate("window.__fetchSettled");
      const imgFailed = await page.evaluate("window.__imgFailed === true");
      assert.equal(fetchOutcome, "rejected", "fetch() to a blocked origin must reject");
      assert.equal(imgFailed, true, "the <img> must fail to load, not silently succeed");
    } finally {
      await context.close();
    }

    assert.equal(requestsReceived, 0, "the local probe server must never have been contacted");
  } finally {
    server.close();
  }
});
