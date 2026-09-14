import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { startCanvasServer, type CanvasServerHandle } from "./index.js";

/**
 * The strongest proof the self-contained HTML export actually keeps its
 * promise: generate the export, delete the design folder it came from, and
 * open the exported file alone, from an unrelated directory, in a browser
 * context that refuses every network request outright. If the image still
 * decodes and the inlined font still loads, nothing about the export depends
 * on a file, a server or a network call that is no longer there.
 *
 * A local system font is used here (read, never copied into this
 * repository or shipped) so `document.fonts.check` exercises a real,
 * decodable font file rather than proving inlining moved bytes nobody asked
 * a browser to parse. If none of the well-known paths exist on the machine
 * running this test, the font-specific assertions are skipped rather than
 * failed — the image and no-network assertions below do not depend on it.
 */

const CANDIDATE_SYSTEM_FONTS = [
  "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];

async function findSystemFont(): Promise<string | null> {
  for (const candidate of CANDIDATE_SYSTEM_FONTS) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

// A real, valid 1x1 PNG — decodable, so naturalWidth > 0 actually proves the
// inlined data URI was read as an image, not just present as text.
const LOGO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function makeDesignFolder(fontPath: string | null): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-export-browser-test-"));
  await fs.mkdir(path.join(root, "artboards"), { recursive: true });
  await fs.writeFile(path.join(root, "artboards", "logo.png"), LOGO_PNG);

  let fontFace = "";
  if (fontPath) {
    const fontBytes = await fs.readFile(fontPath);
    await fs.writeFile(path.join(root, "artboards", "brand.ttf"), fontBytes);
    fontFace =
      '<style>@font-face { font-family: "BezieraExportTest"; src: url("brand.ttf") format("truetype"); }' +
      '#label { font-family: "BezieraExportTest", sans-serif; }</style>';
  }

  await fs.writeFile(
    path.join(root, "artboards", "card.html"),
    `<!doctype html><html><head>${fontFace}</head><body style="margin:0">` +
      '<img id="logo" src="logo.png" alt="logo">' +
      '<span id="label">Exported</span>' +
      "</body></html>",
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "design.json"),
    JSON.stringify(
      {
        name: "Export browser test design",
        artboards: [
          { id: "card", file: "artboards/card.html", name: "Card", x: 0, y: 0, width: 300, height: 200 },
        ],
        links: [],
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

test("a self-contained HTML export still renders correctly after its design folder is deleted, with zero network requests", async () => {
  const fontPath = await findSystemFont();
  const root = await makeDesignFolder(fontPath);
  const server: CanvasServerHandle = await startCanvasServer(root, 0);

  let exportedHtml: string;
  try {
    const response = await fetch(`${server.url}/export/card/html`);
    assert.equal(response.status, 200);
    exportedHtml = await response.text();
  } finally {
    await server.close();
  }

  // Moved to its own directory, with no siblings at all — not even the
  // exports/ folder the canvas server also wrote a copy into.
  const isolatedDir = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-export-isolated-"));
  const isolatedFile = path.join(isolatedDir, "card.html");
  await fs.writeFile(isolatedFile, exportedHtml, "utf8");

  // The strongest version of "does not depend on the design folder": the
  // design folder the export was generated from no longer exists at all by
  // the time the file below is opened.
  await fs.rm(root, { recursive: true, force: true });

  const context = await browser.newContext();
  const requestsSeenOffFile: string[] = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (!url.startsWith("file:")) {
      requestsSeenOffFile.push(url);
    }
    void route.continue();
  });

  const page = await context.newPage();
  try {
    await page.goto(`file://${isolatedFile}`);

    const naturalWidth = await page.evaluate("document.getElementById('logo').naturalWidth");
    assert.ok(
      (naturalWidth as number) > 0,
      "the inlined <img> must actually decode as a real image, not just be present as a data: string"
    );

    if (fontPath) {
      await page.evaluate("document.fonts.ready");
      const fontLoaded = await page.evaluate('document.fonts.check(\'16px "BezieraExportTest"\')');
      assert.equal(fontLoaded, true, "the inlined @font-face must actually load as a usable font");
    }

    assert.deepEqual(
      requestsSeenOffFile,
      [],
      `expected zero non-file:// requests, saw: ${JSON.stringify(requestsSeenOffFile)}`
    );
  } finally {
    await context.close();
  }
});
