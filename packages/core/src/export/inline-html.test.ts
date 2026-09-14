import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDesignFolder } from "../design/folder.js";
import { inlineArtboardHtml } from "./inline-html.js";

// A real, valid 1x1 PNG — decodable, not just any bytes, so a byte-equality
// check on the inlined data URI actually proves the right file was read.
const LOGO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const BACKGROUND_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAAmMv3ZAAAAC0lEQVR42mP8z8AAAAMBAQAY3Y2wAAAAAElFTkSuQmCC",
  "base64"
);
// Not a decodable font — the inlining mechanism does not need to parse it,
// only read and re-encode its exact bytes, so arbitrary content is enough to
// prove the pipe is byte-perfect.
const FONT_BYTES = Buffer.from("not-a-real-font-just-bytes-to-round-trip", "utf8");

/**
 * A design folder with one artboard ("widget") whose HTML references, from
 * its own artboards/ directory: a local image, a local font inlined through
 * an inline <style> block, a linked stylesheet (assets/style.css) that in
 * turn references its own local background image, a linked local script,
 * a remote image (must stay external) and a path reaching outside the
 * design folder entirely (must also stay external, not be read).
 */
async function makeDesignFolderWithAssets(): Promise<{ root: string; htmlPath: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-inline-html-test-"));
  const artboardsDir = path.join(root, "artboards");
  const assetsDir = path.join(artboardsDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  await fs.writeFile(path.join(assetsDir, "logo.png"), LOGO_PNG);
  await fs.writeFile(path.join(assetsDir, "bg.png"), BACKGROUND_PNG);
  await fs.writeFile(path.join(assetsDir, "font.ttf"), FONT_BYTES);
  await fs.writeFile(
    path.join(assetsDir, "app.js"),
    "window.__widgetLoaded = true;",
    "utf8"
  );
  // The stylesheet's own url() is relative to *its* directory (assets/),
  // not the artboard's — proving inlining resolves each file's own base.
  await fs.writeFile(
    path.join(assetsDir, "style.css"),
    ".hero { background-image: url(\"bg.png\"); }",
    "utf8"
  );

  const html = `<!doctype html>
<html>
<head>
  <link rel="stylesheet" href="assets/style.css">
  <style>
    @font-face { font-family: "Widget"; src: url(assets/font.ttf) format("truetype"); }
    body { font-family: "Widget", sans-serif; }
  </style>
</head>
<body>
  <img src="assets/logo.png" alt="logo">
  <img src="https://example.com/remote.png" alt="remote, must stay external">
  <img src="../../../../etc/hosts" alt="escapes the design folder, must stay external">
  <script src="assets/app.js"></script>
</body>
</html>`;
  const htmlPath = path.join(artboardsDir, "widget.html");
  await fs.writeFile(htmlPath, html, "utf8");

  await fs.writeFile(
    path.join(root, "design.json"),
    JSON.stringify(
      {
        name: "Test design",
        artboards: [
          { id: "widget", file: "artboards/widget.html", name: "Widget", x: 0, y: 0, width: 400, height: 300 },
        ],
        links: [],
      },
      null,
      2
    ),
    "utf8"
  );

  return { root, htmlPath };
}

function dataUriFor(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

test("inlines a local <img>, a linked stylesheet's own nested asset, an inline @font-face and a linked script", async () => {
  const { root, htmlPath } = await makeDesignFolderWithAssets();
  const folder = await openDesignFolder(root);

  const result = await inlineArtboardHtml(folder, htmlPath);

  assert.ok(
    result.html.includes(dataUriFor(LOGO_PNG, "image/png")),
    "the local <img> must be replaced with its own exact bytes as a data URI"
  );
  assert.ok(!result.html.includes("assets/logo.png"), "the original relative src must not remain");

  assert.ok(
    result.html.includes(dataUriFor(BACKGROUND_PNG, "image/png")),
    "the linked stylesheet's own url(), resolved against the stylesheet's own directory, must be inlined"
  );
  assert.ok(!result.html.includes("<link"), "the <link rel=\"stylesheet\"> tag must be gone, replaced by an inline <style>");

  assert.ok(
    result.html.includes(dataUriFor(FONT_BYTES, "font/ttf")),
    "the @font-face url() inside the artboard's own inline <style> must be inlined byte-for-byte"
  );

  assert.ok(
    result.html.includes("window.__widgetLoaded = true;"),
    "the linked script's real content must be inlined as literal text"
  );
  assert.ok(!/<script[^>]*\bsrc=/i.test(result.html), "no <script> tag may still carry a src attribute");
});

test("leaves a remote reference untouched and reports it, rather than fetching over the network", async () => {
  const { root, htmlPath } = await makeDesignFolderWithAssets();
  const folder = await openDesignFolder(root);

  const result = await inlineArtboardHtml(folder, htmlPath);

  assert.ok(
    result.html.includes('src="https://example.com/remote.png"'),
    "a remote URL must be left exactly as written"
  );
  assert.ok(
    result.externalRefs.includes("https://example.com/remote.png"),
    "a remote reference must be reported so a caller can tell the export is not fully self-contained"
  );
});

test("refuses to read a path that escapes the design folder, leaving it as an external reference", async () => {
  const { root, htmlPath } = await makeDesignFolderWithAssets();
  const folder = await openDesignFolder(root);

  const result = await inlineArtboardHtml(folder, htmlPath);

  assert.ok(
    result.html.includes('src="../../../../etc/hosts"'),
    "a path outside the design folder must be left exactly as written, never read"
  );
  assert.ok(result.externalRefs.includes("../../../../etc/hosts"));
});

test("an already-inlined data URI is never reprocessed or mistaken for an external reference", async () => {
  const { root, htmlPath } = await makeDesignFolderWithAssets();
  const folder = await openDesignFolder(root);

  const result = await inlineArtboardHtml(folder, htmlPath);

  const dataUriLikeExternal = result.externalRefs.some((ref) => ref.startsWith("data:"));
  assert.equal(dataUriLikeExternal, false, "a data: URI produced by an earlier pass must not appear in externalRefs");
});

test("inlinedAssets names every real file actually read, relative to the design folder", async () => {
  const { root, htmlPath } = await makeDesignFolderWithAssets();
  const folder = await openDesignFolder(root);

  const result = await inlineArtboardHtml(folder, htmlPath);

  assert.deepEqual(
    result.inlinedAssets,
    [
      "artboards/assets/app.js",
      "artboards/assets/bg.png",
      "artboards/assets/font.ttf",
      "artboards/assets/logo.png",
      "artboards/assets/style.css",
    ].sort()
  );
});

test("the export is byte-identical when read back with no other file present", async () => {
  // The point of the feature: move only the exported file somewhere with
  // none of its former siblings, and it must still carry everything it needs.
  const { root, htmlPath } = await makeDesignFolderWithAssets();
  const folder = await openDesignFolder(root);
  const result = await inlineArtboardHtml(folder, htmlPath);

  const isolatedDir = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-inline-html-isolated-"));
  const isolatedFile = path.join(isolatedDir, "widget.html");
  await fs.writeFile(isolatedFile, result.html, "utf8");
  await fs.rm(root, { recursive: true, force: true }); // the original design folder is now gone

  const rereadHtml = await fs.readFile(isolatedFile, "utf8");
  assert.ok(rereadHtml.includes(dataUriFor(LOGO_PNG, "image/png")));
  assert.ok(rereadHtml.includes(dataUriFor(BACKGROUND_PNG, "image/png")));
});
