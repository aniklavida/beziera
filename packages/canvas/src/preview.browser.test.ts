import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { startCanvasServer, type CanvasServerHandle } from "./index.js";

/**
 * Real-browser coverage for the two capabilities that come nearly free once
 * an artboard is a real HTML file: a prototype link between two artboards
 * navigates on click, and a CSS animation already running in an artboard
 * plays in the canvas exactly as it would in a standalone browser tab.
 *
 * Every other test in this package drives the HTTP layer directly
 * (serve.test.ts) or the MCP tools directly (server.test.ts in @beziera/mcp).
 * Neither proves what actually happens inside a rendered iframe, which is
 * the only thing that can prove the sandbox still holds and a link still
 * fires — so this file launches a real headless browser, the same one
 * screenshot_artboard uses, and drives the canvas as a user would.
 *
 * Evaluated snippets below are plain expression strings, not TypeScript
 * arrow functions, deliberately: this package has no DOM lib configured
 * (the same choice @beziera/mcp's capture.ts makes), and a string is what
 * Playwright's evaluate methods accept for code that only ever runs in the
 * page or iframe's own browser context, executed against a real Frame
 * object rather than reached for through the parent's DOM (which the
 * sandbox itself refuses, by design).
 *
 * The fixture places both artboards at y: 40 rather than 0 — an artboard's
 * toolbar (the label and the Replay button) sits 28px above its own box, so
 * an artboard at y: 0 would put its toolbar above the visible viewport with
 * nothing to scroll it into view, since the canvas pans with a CSS
 * transform rather than native scrolling.
 */

async function makeDesignFolder(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-canvas-preview-test-"));
  await fs.mkdir(path.join(root, "artboards"), { recursive: true });

  await fs.writeFile(
    path.join(root, "artboards", "start.html"),
    "<!doctype html><html><body style=\"margin:0\">" +
      "<a id=\"go\" href=\"end.html\">Continue</a>" +
      "</body></html>",
    "utf8"
  );

  // A single, non-repeating run rather than an infinite loop: an animation
  // that is already oscillating forever cannot tell "still running on its
  // own" apart from "just restarted" by sampling its opacity, which is
  // exactly the distinction the replay test needs. "forwards" holds the end
  // state (opacity 1) once it finishes, so a settled artboard reads as a
  // steady 1 until something restarts it.
  await fs.writeFile(
    path.join(root, "artboards", "end.html"),
    "<!doctype html><html><head><style>" +
      "@keyframes pulse { from { opacity: 0.15; } to { opacity: 1; } }" +
      "#pulse { width: 40px; height: 40px; background: #3454d1; " +
      "animation: pulse 150ms ease-in-out forwards; }" +
      "</style></head><body style=\"margin:0\">" +
      "<h1 id=\"arrived\">Arrived</h1>" +
      "<div id=\"pulse\"></div>" +
      "</body></html>",
    "utf8"
  );

  await fs.writeFile(
    path.join(root, "design.json"),
    JSON.stringify(
      {
        name: "Preview test design",
        artboards: [
          { id: "start", file: "artboards/start.html", name: "Start", x: 0, y: 40, width: 300, height: 200 },
          { id: "end", file: "artboards/end.html", name: "End", x: 400, y: 40, width: 300, height: 200 },
        ],
        links: [{ from: "start", to: "end" }],
      },
      null,
      2
    ),
    "utf8"
  );

  return root;
}

let browser: Browser;
test.before(async () => {
  browser = await chromium.launch();
});
test.after(async () => {
  await browser.close();
});

async function withCanvas(run: (page: Page, server: CanvasServerHandle) => Promise<void>): Promise<void> {
  const root = await makeDesignFolder();
  const server = await startCanvasServer(root, 0);
  // The design folder's watcher is created right after the fixture's own
  // files are written, and chokidar's ignoreInitial baseline scan can, on a
  // loaded machine, lose the race and report one of those pre-existing
  // files as a fresh "add" a moment later — an unrelated stray hot-reload
  // partway through a test, not a bug in what is under test here. Settling
  // here, before the page (and with it, an artboard's own animation) loads
  // at all, keeps this wait from also eating into an artboard's own
  // animation timing later in the test.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const page = await browser.newPage();
  try {
    await page.goto(server.url);
    await page.waitForSelector("#artboard-iframe-start");
    await run(page, server);
  } finally {
    await page.close();
    await server.close();
  }
}

test("the canvas draws the link design.json records, from the source artboard to the destination", async () => {
  await withCanvas(async (page) => {
    const lines = page.locator("#links-group .link-line");
    await assert.doesNotReject(lines.first().waitFor({ state: "attached" }));
    assert.equal(await lines.count(), 1);

    // x1/y1 sit on "start"'s right edge, x2/y2 on "end"'s left edge — the
    // same world-space box design.json placed them in.
    assert.equal(await lines.first().getAttribute("x1"), "300");
    assert.equal(await lines.first().getAttribute("x2"), "400");
  });
});

test("a two-artboard prototype flow is clickable end to end, and the sandbox holds before and after", async () => {
  await withCanvas(async (page) => {
    // The sandbox before any interaction: allow-scripts only, and the
    // opaque origin it produces blocks both directions of DOM access.
    const sandboxBefore = await page.getAttribute("#artboard-iframe-start", "sandbox");
    assert.equal(sandboxBefore, "allow-scripts");

    const iframeHandleBefore = await page.$("#artboard-iframe-start");
    assert.ok(iframeHandleBefore, "expected the start artboard's iframe to exist");
    const frameBefore = await iframeHandleBefore!.contentFrame();
    assert.ok(frameBefore, "expected the iframe to have a content frame");
    await assert.rejects(
      frameBefore!.evaluate("window.parent.location.href"),
      /SecurityError|cross-origin/i,
      "the artboard must not be able to read the parent canvas's location before any click"
    );
    await assert.rejects(
      page.evaluate('document.getElementById("artboard-iframe-start").contentWindow.document.title'),
      /SecurityError|cross-origin/i,
      "the canvas must not be able to read the artboard's document before any click"
    );

    // The click: a plain <a href="end.html"> inside the sandboxed iframe,
    // clicked the way a user would.
    const startFrame = page.frameLocator("#artboard-iframe-start");
    await startFrame.locator("#go").click();

    // frameLocator re-resolves the iframe's current document on every call,
    // so waiting on it (rather than on the outer <iframe> element's "src"
    // attribute, which a same-frame navigation never rewrites) is what
    // actually proves the click navigated the frame.
    const arrivedFrame = page.frameLocator("#artboard-iframe-start");
    await assert.doesNotReject(
      arrivedFrame.locator("#arrived").waitFor({ state: "visible", timeout: 5_000 }),
      "the destination artboard's content must actually be showing after the click"
    );

    // The sandbox after the click: identical attribute, identical opaque
    // origin in both directions. Navigating within a sandboxed iframe must
    // not upgrade or otherwise change the frame's own sandboxing.
    const sandboxAfter = await page.getAttribute("#artboard-iframe-start", "sandbox");
    assert.equal(sandboxAfter, "allow-scripts");

    const iframeHandleAfter = await page.$("#artboard-iframe-start");
    assert.ok(iframeHandleAfter, "expected the navigated iframe to still exist");
    const frameAfter = await iframeHandleAfter!.contentFrame();
    assert.ok(frameAfter, "expected the navigated iframe to have a content frame");
    await assert.rejects(
      frameAfter!.evaluate("window.parent.location.href"),
      /SecurityError|cross-origin/i,
      "the artboard must still not be able to read the parent canvas's location after navigating"
    );
    await assert.rejects(
      page.evaluate('document.getElementById("artboard-iframe-start").contentWindow.document.title'),
      /SecurityError|cross-origin/i,
      "the canvas must still not be able to read the artboard's document after it navigated"
    );
  });
});

/** Read the pulse element's current opacity from inside the "end" artboard's own frame. */
async function readPulseOpacity(page: Page): Promise<number> {
  const iframeHandle = await page.$("#artboard-iframe-end");
  assert.ok(iframeHandle, "expected the end artboard's iframe to exist");
  const frame = await iframeHandle!.contentFrame();
  assert.ok(frame, "expected the end artboard's iframe to have a content frame");
  return (await frame!.evaluate('Number(getComputedStyle(document.getElementById("pulse")).opacity)')) as number;
}

test("an animated artboard plays its animation in the canvas with no extra work", async () => {
  await withCanvas(async (page) => {
    await page.waitForSelector("#artboard-iframe-end");

    const samples = new Set<number>();
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline && samples.size < 2) {
      samples.add(Math.round((await readPulseOpacity(page)) * 100) / 100);
      await page.waitForTimeout(20);
    }

    assert.ok(
      samples.size >= 2,
      `expected the keyframe animation's opacity to change on its own; only observed ${JSON.stringify([...samples])}`
    );
  });
});

test("replaying an artboard restarts its animation without reloading the iframe", async () => {
  await withCanvas(async (page) => {
    // A JS global set inside the iframe's own window is the proof that a
    // reload did not happen: a real reload tears down the frame's JS realm
    // and this marker with it, where reading the <iframe> element's own
    // "src" attribute would not — that attribute is never rewritten by a
    // same-frame navigation in the first place (see the click-through test
    // above), so it cannot tell a reload apart from anything else either.
    const iframeHandleBefore = await page.$("#artboard-iframe-end");
    assert.ok(iframeHandleBefore, "expected the end artboard's iframe to exist");
    const frameBefore = await iframeHandleBefore!.contentFrame();
    assert.ok(frameBefore, "expected the end artboard's iframe to have a content frame");
    await frameBefore!.evaluate('window.__bezieraReplayProbe = true');

    // The animation is 150ms and single-shot; wait it out so it has
    // genuinely finished and settled at its "forwards"-held end state
    // before replay is expected to restart it.
    await page.waitForTimeout(250);
    const settledOpacity = await readPulseOpacity(page);
    assert.ok(settledOpacity > 0.95, `expected the animation to have settled near 1, got ${settledOpacity}`);

    const replayButton = page.locator('.artboard[data-artboard-id="end"] .artboard-replay');
    await assert.doesNotReject(replayButton.waitFor({ state: "visible" }));
    await replayButton.click();

    // If replay actually restarted the animation from 0%, opacity must dip
    // measurably below its settled value again somewhere in the next ~150ms
    // — sampled repeatedly rather than at one fixed instant, since exactly
    // when in that window it dips depends on scheduling this test does not
    // control.
    let sawDip = false;
    const dipDeadline = Date.now() + 500;
    while (Date.now() < dipDeadline && !sawDip) {
      if ((await readPulseOpacity(page)) < 0.9) sawDip = true;
      else await page.waitForTimeout(10);
    }
    assert.ok(sawDip, "expected replay to restart the animation from its beginning, not leave it settled at 1");

    // And it must reach the same settled end state again afterwards.
    await page.waitForTimeout(200);
    const finalOpacity = await readPulseOpacity(page);
    assert.ok(finalOpacity > 0.95, `expected the replayed animation to settle near 1 again, got ${finalOpacity}`);

    const iframeHandleAfter = await page.$("#artboard-iframe-end");
    assert.ok(iframeHandleAfter, "expected the end artboard's iframe to still exist after replay");
    const frameAfter = await iframeHandleAfter!.contentFrame();
    assert.ok(frameAfter, "expected the end artboard's iframe to still have a content frame after replay");
    const probeSurvived = await frameAfter!.evaluate("window.__bezieraReplayProbe === true");
    assert.equal(probeSurvived, true, "replay must not reload the iframe");

    await assert.doesNotReject(frameAfter!.locator("#arrived").waitFor({ state: "visible" }));
  });
});

/**
 * The MCP server's screenshot capture blocks the network by intercepting
 * every request in a Playwright context it controls (see
 * createNetworkBlockedContext in @beziera/mcp) — a mechanism that only
 * exists for that one, server-launched browser. An artboard is shown live
 * in the canvas in the user's own, ordinary browser tab, where nothing
 * like that route interception is available; the same artboard content
 * still runs there, in the same sandboxed iframe, so it needs its own way
 * to be kept off the network. That is what the Content-Security-Policy
 * serve.ts now sends with every artboard response is for, and this proves
 * it actually holds in a real browser rather than trusting the header.
 */
test("an artboard cannot open a WebSocket while shown live in the canvas — proven, not assumed", async () => {
  // A raw TCP server, exactly like the MCP capture-side WebSocket test: a
  // plain TCP accept proves Chromium dialled out at all, which is strictly
  // earlier than any WebSocket-protocol detail and cannot be fooled by one.
  let connectionsReceived = 0;
  const probeServer = net.createServer((socket) => {
    connectionsReceived++;
    socket.destroy();
  });
  await new Promise<void>((resolve) => probeServer.listen(0, "127.0.0.1", resolve));
  const address = probeServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected the probe server to bind a port");
  }
  const probePort = address.port;

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-canvas-ws-test-"));
  await fs.mkdir(path.join(root, "artboards"), { recursive: true });
  await fs.writeFile(
    path.join(root, "artboards", "reach-out.html"),
    `<!doctype html><html><body style="margin:0">
      <script>
        window.__wsResult = "pending";
        try {
          const socket = new WebSocket("ws://127.0.0.1:${probePort}/");
          socket.onopen = () => { window.__wsResult = "opened"; };
          socket.onerror = () => { window.__wsResult = "error"; };
          socket.onclose = () => {
            if (window.__wsResult === "pending") window.__wsResult = "closed";
          };
        } catch (err) {
          window.__wsResult = "threw";
        }
      </script>
    </body></html>`,
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "design.json"),
    JSON.stringify(
      {
        name: "WebSocket-block test design",
        artboards: [
          {
            id: "reach-out",
            file: "artboards/reach-out.html",
            name: "Reach out",
            x: 0,
            y: 40,
            width: 300,
            height: 200,
          },
        ],
        links: [],
      },
      null,
      2
    ),
    "utf8"
  );

  const server = await startCanvasServer(root, 0);
  try {
    const page = await browser.newPage();
    try {
      await page.goto(server.url);
      await page.waitForSelector("#artboard-iframe-reach-out");

      const iframeHandle = await page.$("#artboard-iframe-reach-out");
      assert.ok(iframeHandle, "expected the artboard's iframe to exist");
      const frame = await iframeHandle!.contentFrame();
      assert.ok(frame, "expected the iframe to have a content frame");

      const deadline = Date.now() + 2_000;
      let wsResult = await frame!.evaluate("window.__wsResult");
      while (wsResult === "pending" && Date.now() < deadline) {
        await page.waitForTimeout(20);
        wsResult = await frame!.evaluate("window.__wsResult");
      }

      assert.notEqual(wsResult, "opened", "the WebSocket must never actually open while shown live in the canvas");
    } finally {
      await page.close();
    }

    assert.equal(
      connectionsReceived,
      0,
      "the local probe server must never have received a connection attempt from the canvas"
    );
  } finally {
    await server.close();
    probeServer.close();
  }
});
