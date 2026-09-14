import { promises as fs } from "node:fs";
import path from "node:path";
import { readDesignJson } from "./design-json.js";
import { DesignFolderError } from "./errors.js";

export const ARTBOARDS_DIRNAME = "artboards";
export const DESIGN_JSON_FILENAME = "design.json";
export const MARKS_JSON_FILENAME = "marks.json";

/** An opened, validated design folder: a real directory holding artboards/ and design.json. */
export interface DesignFolder {
  /** Absolute, resolved path to the folder root. */
  readonly root: string;
  readonly artboardsDir: string;
  readonly designJsonPath: string;
  /**
   * Path to marks.json — never validated to exist by openDesignFolder,
   * unlike design.json. A design folder with no feedback yet simply has no
   * marks.json; readMarksJson treats a missing file as an empty queue
   * rather than an error, and the first mark left on the canvas creates it.
   */
  readonly marksJsonPath: string;
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

  const marksJsonPath = path.join(root, MARKS_JSON_FILENAME);

  return { root, artboardsDir, designJsonPath, marksJsonPath };
}

/**
 * Whether an already-resolved absolute path sits inside a design folder.
 * Shared by resolveInsideFolder below and by the self-contained HTML export
 * (which resolves an artboard's asset references against the artboard's own
 * directory, not the folder root, so it needs the containment check on its
 * own rather than through resolveInsideFolder's relative-path signature).
 */
export function isPathInsideFolder(folder: DesignFolder, absolutePath: string): boolean {
  const withSep = folder.root.endsWith(path.sep)
    ? folder.root
    : folder.root + path.sep;
  return absolutePath === folder.root || absolutePath.startsWith(withSep);
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
  if (!isPathInsideFolder(folder, resolved)) {
    throw new DesignFolderError(`Path escapes design folder: ${relativePath}`);
  }
  return resolved;
}
