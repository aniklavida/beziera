import { promises as fs } from "node:fs";
import { readDesignJson } from "./design-json.js";
import { resolveInsideFolder, type DesignFolder } from "./folder.js";
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
