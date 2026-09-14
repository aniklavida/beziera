import { promises as fs } from "node:fs";
import path from "node:path";
import { isPathInsideFolder, type DesignFolder } from "../design/folder.js";

/**
 * Self-contained HTML export: an artboard with every asset it references
 * from inside the design folder — images, fonts, a linked stylesheet, a
 * linked script — inlined as either a data URI or literal text, so the
 * result opens from disk with no other file present and no network request.
 *
 * What this does not do, deliberately, rather than by oversight:
 *
 * - A reference to anything outside the design folder, or to a remote URL
 *   (http, https, a protocol-relative "//host/..." — anything with a URL
 *   scheme), is left exactly as written. Inlining it would mean either
 *   fetching over the network (the one thing export must never add) or
 *   reading a file this artboard has no business reading. `externalRefs`
 *   names every one left behind, so a caller can tell a truly
 *   self-contained export from one with a remaining dependency.
 * - `<picture>` / `srcset`, CSS `@import`, and inline event handlers that
 *   construct a URL at runtime are not rewritten. The tested, supported
 *   shape is `<img src>`, a linked `<link rel="stylesheet">`, a linked
 *   `<script src>`, and `url(...)` inside `<style>` blocks or `style="..."`
 *   attributes — which covers every artboard this product's own tools
 *   produce.
 */
export interface InlineHtmlResult {
  /** The artboard's HTML with every inlinable local asset inlined. */
  readonly html: string;
  /** Design-folder-relative paths of every asset actually inlined, deduplicated and sorted. */
  readonly inlinedAssets: readonly string[];
  /** References left untouched because they are remote or outside the design folder. */
  readonly externalRefs: readonly string[];
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

function mimeTypeFor(filePath: string): string {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

type RefClassification =
  | { kind: "skip" } // already a data:/blob: URI or a same-document "#fragment" — nothing to do
  | { kind: "external"; ref: string } // remote, or local but outside the design folder
  | { kind: "local"; absolutePath: string };

/** Decide what an href/src/url() value actually points at, without touching disk yet. */
function classifyRef(ref: string, baseDir: string, folder: DesignFolder): RefClassification {
  const trimmed = ref.trim();
  if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return { kind: "skip" };
  }
  if (trimmed.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    // Protocol-relative, or any URL with a scheme (http:, https:, mailto:, tel:, ...).
    return { kind: "external", ref: trimmed };
  }
  const withoutQueryOrHash = trimmed.split(/[?#]/, 1)[0];
  const absolutePath = path.resolve(baseDir, withoutQueryOrHash);
  if (!isPathInsideFolder(folder, absolutePath)) {
    return { kind: "external", ref: trimmed };
  }
  return { kind: "local", absolutePath };
}

async function toDataUri(absolutePath: string): Promise<string> {
  const bytes = await fs.readFile(absolutePath);
  return `data:${mimeTypeFor(absolutePath)};base64,${bytes.toString("base64")}`;
}

/** Sequential async find-and-replace — String.replace has no async form. */
async function replaceAsync(
  text: string,
  pattern: RegExp,
  replacer: (match: RegExpMatchArray) => Promise<string>
): Promise<string> {
  const matches = Array.from(text.matchAll(pattern));
  if (matches.length === 0) return text;
  let result = "";
  let cursor = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    result += text.slice(cursor, index);
    result += await replacer(match);
    cursor = index + match[0].length;
  }
  return result + text.slice(cursor);
}

const ATTR_VALUE = `("([^"]*)"|'([^']*)'|([^\\s"'>]+))`;

/** Read one HTML attribute's value out of a single tag's source text, or null if absent. */
function getAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*${ATTR_VALUE}`, "i"));
  if (!match) return null;
  return match[2] ?? match[3] ?? match[4] ?? "";
}

/** Replace one attribute's value in a tag's source text, whatever quoting style it used. */
function setAttr(tag: string, name: string, newValue: string): string {
  return tag.replace(new RegExp(`(\\b${name}\\s*=\\s*)${ATTR_VALUE}`, "i"), (_full, prefix: string) => {
    return `${prefix}"${newValue.replace(/"/g, "&quot;")}"`;
  });
}

/** Drop one attribute entirely from a tag's source text. */
function dropAttr(tag: string, name: string): string {
  return tag.replace(new RegExp(`\\s*\\b${name}\\s*=\\s*${ATTR_VALUE}`, "i"), "");
}

const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

/**
 * Inline every `url(...)` in a block of CSS (or, in the final pass below, in
 * an entire HTML document — the pattern does not care which). Shared by
 * linked-stylesheet inlining (base = the stylesheet's own directory) and the
 * whole-document pass that catches inline `<style>` blocks and `style="..."`
 * attributes (base = the artboard's own directory).
 */
async function inlineCssUrls(
  text: string,
  baseDir: string,
  folder: DesignFolder,
  inlined: string[],
  external: string[]
): Promise<string> {
  return replaceAsync(text, CSS_URL, async (match) => {
    const ref = match[2];
    const classified = classifyRef(ref, baseDir, folder);
    if (classified.kind === "skip") return match[0];
    if (classified.kind === "external") {
      external.push(classified.ref);
      return match[0];
    }
    const dataUri = await toDataUri(classified.absolutePath);
    inlined.push(path.relative(folder.root, classified.absolutePath));
    return `url("${dataUri}")`;
  });
}

async function inlineStylesheetLinks(
  html: string,
  baseDir: string,
  folder: DesignFolder,
  inlined: string[],
  external: string[]
): Promise<string> {
  return replaceAsync(html, /<link\b[^>]*>/gi, async (match) => {
    const tag = match[0];
    const rel = getAttr(tag, "rel");
    if (!rel || rel.trim().toLowerCase() !== "stylesheet") return tag;
    const href = getAttr(tag, "href");
    if (href === null) return tag;

    const classified = classifyRef(href, baseDir, folder);
    if (classified.kind === "skip") return tag;
    if (classified.kind === "external") {
      external.push(classified.ref);
      return tag;
    }
    const cssText = await fs.readFile(classified.absolutePath, "utf8");
    const cssBaseDir = path.dirname(classified.absolutePath);
    const inlinedCss = await inlineCssUrls(cssText, cssBaseDir, folder, inlined, external);
    inlined.push(path.relative(folder.root, classified.absolutePath));
    return `<style>${inlinedCss}</style>`;
  });
}

async function inlineImgSrcs(
  html: string,
  baseDir: string,
  folder: DesignFolder,
  inlined: string[],
  external: string[]
): Promise<string> {
  return replaceAsync(html, /<img\b[^>]*>/gi, async (match) => {
    const tag = match[0];
    const src = getAttr(tag, "src");
    if (src === null) return tag;

    const classified = classifyRef(src, baseDir, folder);
    if (classified.kind === "skip") return tag;
    if (classified.kind === "external") {
      external.push(classified.ref);
      return tag;
    }
    const dataUri = await toDataUri(classified.absolutePath);
    inlined.push(path.relative(folder.root, classified.absolutePath));
    return setAttr(tag, "src", dataUri);
  });
}

/**
 * Inline `<script src="local.js"></script>` tags — the shape `create_artboard`
 * and `write_artboard` never actually produce (the skill requires a complete,
 * standalone document, usually with an inline `<script>`), but a hand-edited
 * or externally authored artboard may still use. Only a tag whose body is
 * empty (or whitespace) is matched — an artboard's real inline scripts, which
 * always have a body and never a `src`, are left completely alone.
 */
async function inlineScriptSrcs(
  html: string,
  baseDir: string,
  folder: DesignFolder,
  inlined: string[],
  external: string[]
): Promise<string> {
  return replaceAsync(html, /<script\b([^>]*)>\s*<\/script>/gi, async (match) => {
    const [fullTag, attrs] = match;
    const openTag = `<script${attrs}>`;
    const src = getAttr(openTag, "src");
    if (src === null) return fullTag;

    const classified = classifyRef(src, baseDir, folder);
    if (classified.kind === "skip") return fullTag;
    if (classified.kind === "external") {
      external.push(classified.ref);
      return fullTag;
    }
    const jsText = await fs.readFile(classified.absolutePath, "utf8");
    inlined.push(path.relative(folder.root, classified.absolutePath));
    const openTagWithoutSrc = dropAttr(openTag, "src");
    return `${openTagWithoutSrc}${jsText}</script>`;
  });
}

/**
 * Produce a self-contained export of one artboard: every local `<img>`,
 * linked stylesheet (and that stylesheet's own local fonts/images), linked
 * script, and `url(...)` reference — inline `<style>` blocks and `style="..."`
 * attributes included — replaced with its actual content. The result is one
 * HTML document that needs nothing else on disk and makes no network request
 * to render, whatever machine it is opened on.
 *
 * `absoluteHtmlPath` must be the artboard's real path inside `folder` — the
 * same path `list_artboards` and `screenshot_artboard` already resolve to.
 */
export async function inlineArtboardHtml(
  folder: DesignFolder,
  absoluteHtmlPath: string
): Promise<InlineHtmlResult> {
  const baseDir = path.dirname(absoluteHtmlPath);
  const original = await fs.readFile(absoluteHtmlPath, "utf8");

  const inlined: string[] = [];
  const external: string[] = [];

  const afterLinks = await inlineStylesheetLinks(original, baseDir, folder, inlined, external);
  const afterImages = await inlineImgSrcs(afterLinks, baseDir, folder, inlined, external);
  const afterScripts = await inlineScriptSrcs(afterImages, baseDir, folder, inlined, external);
  // Final pass, over the whole document: catches url(...) inside any
  // pre-existing <style> block or style="..." attribute that the targeted
  // passes above never touch. Anything already turned into a data: URI by
  // an earlier pass is classified "skip" here, so it is not reprocessed or
  // mistaken for a reference export left external.
  const finalHtml = await inlineCssUrls(afterScripts, baseDir, folder, inlined, external);

  return {
    html: finalHtml,
    inlinedAssets: Array.from(new Set(inlined)).sort(),
    externalRefs: Array.from(new Set(external)).sort(),
  };
}
