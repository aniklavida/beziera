import { promises as fs } from "node:fs";
import { readDesignJson, writeDesignJson } from "./design-json.js";
import { ARTBOARDS_DIRNAME, resolveInsideFolder, type DesignFolder } from "./folder.js";
import type { ArtboardEntry } from "../schema/design.js";

/** An artboard entry from design.json, cross-checked against the file it names. */
export interface ResolvedArtboard extends ArtboardEntry {
  /** Absolute path to the artboard's HTML file. */
  readonly absolutePath: string;
  /** False if design.json references a file that does not exist on disk. */
  readonly exists: boolean;
}

/** List every artboard recorded in design.json, checked against the files that actually exist. */
export async function listArtboards(
  folder: DesignFolder
): Promise<ResolvedArtboard[]> {
  const design = await readDesignJson(folder.designJsonPath);
  const resolved: ResolvedArtboard[] = [];
  for (const entry of design.artboards) {
    const absolutePath = resolveInsideFolder(folder, entry.file);
    const exists = await fs
      .stat(absolutePath)
      .then((s) => s.isFile())
      .catch(() => false);
    resolved.push({ ...entry, absolutePath, exists });
  }
  return resolved;
}

/** Read one artboard's HTML by id. Throws if the id is unknown or its file is missing. */
export async function readArtboardHtml(
  folder: DesignFolder,
  id: string
): Promise<string> {
  const artboards = await listArtboards(folder);
  const artboard = artboards.find((a) => a.id === id);
  if (!artboard || !artboard.exists) {
    throw new Error(`Unknown or missing artboard: ${id}`);
  }
  return fs.readFile(artboard.absolutePath, "utf8");
}

/**
 * Replace one existing artboard's HTML by id. Throws if the id is unknown.
 *
 * The file written is the one already recorded in design.json, resolved
 * through the same resolveInsideFolder guard listArtboards uses — a
 * design.json entry that has been tampered with to point outside the
 * folder is refused here exactly as it would be anywhere else.
 */
export async function writeArtboardHtml(
  folder: DesignFolder,
  id: string,
  html: string
): Promise<void> {
  const artboards = await listArtboards(folder);
  const artboard = artboards.find((a) => a.id === id);
  if (!artboard) {
    throw new Error(`Unknown artboard: ${id}`);
  }
  await fs.writeFile(artboard.absolutePath, html, "utf8");
}

/** The fields a caller supplies to create a new artboard. */
export interface NewArtboard {
  readonly id: string;
  readonly name: string;
  readonly html: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Create a new artboard: write its HTML file under artboards/ and register
 * it in design.json in one step, so the two never disagree.
 *
 * Throws if the id is already registered, or if the id would resolve to a
 * file outside the design folder — resolveInsideFolder is the actual guard;
 * the id is not trusted just because it looks like a plain name.
 */
export async function createArtboard(
  folder: DesignFolder,
  input: NewArtboard
): Promise<ArtboardEntry> {
  const design = await readDesignJson(folder.designJsonPath);
  if (design.artboards.some((a) => a.id === input.id)) {
    throw new Error(`Artboard id already exists: ${input.id}`);
  }

  const relativeFile = `${ARTBOARDS_DIRNAME}/${input.id}.html`;
  const absolutePath = resolveInsideFolder(folder, relativeFile);

  const entry: ArtboardEntry = {
    id: input.id,
    file: relativeFile,
    name: input.name,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
  };

  // Write the file before the record that points at it, so design.json
  // never names a file that does not exist yet.
  await fs.writeFile(absolutePath, input.html, "utf8");
  await writeDesignJson(folder.designJsonPath, {
    ...design,
    artboards: [...design.artboards, entry],
  });

  return entry;
}
