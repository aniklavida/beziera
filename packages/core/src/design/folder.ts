import { promises as fs } from "node:fs";
import path from "node:path";
import { readDesignJson } from "./design-json.js";
import { DesignFolderError } from "./errors.js";

export const ARTBOARDS_DIRNAME = "artboards";
export const DESIGN_JSON_FILENAME = "design.json";

/** An opened, validated design folder: a real directory holding artboards/ and design.json. */
export interface DesignFolder {
  /** Absolute, resolved path to the folder root. */
  readonly root: string;
  readonly artboardsDir: string;
  readonly designJsonPath: string;
}

/**
 * Open and validate a design folder. Throws DesignFolderError if the folder,
 * its artboards directory, or its design.json are missing or malformed.
 *
 * This is the only place a design folder is opened from — the canvas server
 * and every future MCP tool call it rather than touching disk themselves.
 */
export async function openDesignFolder(folderPath: string): Promise<DesignFolder> {
  const root = path.resolve(folderPath);

  const stat = await fs.stat(root).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new DesignFolderError(`Not a directory: ${root}`);
  }

  const artboardsDir = path.join(root, ARTBOARDS_DIRNAME);
  const artboardsStat = await fs.stat(artboardsDir).catch(() => null);
  if (!artboardsStat || !artboardsStat.isDirectory()) {
    throw new DesignFolderError(
      `Missing "${ARTBOARDS_DIRNAME}/" directory in ${root}`
    );
  }

  const designJsonPath = path.join(root, DESIGN_JSON_FILENAME);
  await readDesignJson(designJsonPath); // throws if missing or invalid

  return { root, artboardsDir, designJsonPath };
}

/**
 * Resolve a path that something outside this module claims is inside the design
 * folder (a design.json "file" field, or a canvas HTTP request) and reject
 * anything that escapes it. An escaping path is rejected outright, never
 * normalised back inside — the MCP server and the canvas write and read inside
 * the design folder only.
 */
export function resolveInsideFolder(
  folder: DesignFolder,
  relativePath: string
): string {
  const resolved = path.resolve(folder.root, relativePath);
  const withSep = folder.root.endsWith(path.sep)
    ? folder.root
    : folder.root + path.sep;
  if (resolved !== folder.root && !resolved.startsWith(withSep)) {
    throw new DesignFolderError(`Path escapes design folder: ${relativePath}`);
  }
  return resolved;
}
