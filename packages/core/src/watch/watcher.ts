import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";
import type { DesignFolder } from "../design/folder.js";

/** One thing that changed in a design folder, ready to hand to a canvas socket broadcast. */
export type DesignFolderChange =
  | { type: "design-changed" }
  | { type: "artboard-changed"; file: string };

export type DesignFolderChangeListener = (change: DesignFolderChange) => void;

/**
 * Watch a design folder's artboards/ directory and its design.json for changes.
 *
 * Emits exactly one event per changed file, whether the change came from an
 * editor, an agent, or a hand edit — the watcher watches the disk, not the
 * author. The canvas uses this to hot-reload only the one iframe that
 * changed; nothing else on the canvas reloads.
 */
export function watchDesignFolder(
  folder: DesignFolder,
  onChange: DesignFolderChangeListener
): FSWatcher {
  const watcher = chokidar.watch([folder.artboardsDir, folder.designJsonPath], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 },
  });

  const handleFileEvent = (filePath: string): void => {
    if (path.resolve(filePath) === path.resolve(folder.designJsonPath)) {
      onChange({ type: "design-changed" });
      return;
    }
    const relative = path.relative(folder.root, filePath).split(path.sep).join("/");
    onChange({ type: "artboard-changed", file: relative });
  };

  watcher.on("add", handleFileEvent);
  watcher.on("change", handleFileEvent);
  watcher.on("unlink", handleFileEvent);

  return watcher;
}
