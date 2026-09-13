import { readDesignJson, writeDesignJson } from "./design-json.js";
import type { DesignFolder } from "./folder.js";
import type { LinkEntry } from "../schema/design.js";

/**
 * Record a prototype link from one artboard to another in design.json.
 *
 * Both ids must already be registered artboards. Linking an artboard to
 * itself is rejected, and linking the same pair twice is a no-op rather
 * than a duplicate entry — the canvas draws one connection either way.
 */
export async function linkArtboards(
  folder: DesignFolder,
  from: string,
  to: string
): Promise<LinkEntry> {
  const design = await readDesignJson(folder.designJsonPath);
  const ids = new Set(design.artboards.map((a) => a.id));

  if (!ids.has(from)) {
    throw new Error(`Unknown artboard: ${from}`);
  }
  if (!ids.has(to)) {
    throw new Error(`Unknown artboard: ${to}`);
  }
  if (from === to) {
    throw new Error(`An artboard cannot link to itself: ${from}`);
  }

  const entry: LinkEntry = { from, to };
  const alreadyLinked = design.links.some((l) => l.from === from && l.to === to);
  if (!alreadyLinked) {
    await writeDesignJson(folder.designJsonPath, {
      ...design,
      links: [...design.links, entry],
    });
  }

  return entry;
}
