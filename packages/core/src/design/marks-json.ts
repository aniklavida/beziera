import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { MarksFileSchema, type Mark, type MarksFile, type NewMark } from "../schema/marks.js";
import { DesignFolderError } from "./errors.js";
import type { DesignFolder } from "./folder.js";

/**
 * Read marks.json. Unlike readDesignJson, a missing file is not an error —
 * a design folder with no feedback yet simply has an empty queue, and
 * openDesignFolder never requires marks.json to exist.
 */
export async function readMarksJson(marksJsonPath: string): Promise<MarksFile> {
  let raw: string;
  try {
    raw = await fs.readFile(marksJsonPath, "utf8");
  } catch {
    return { marks: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new DesignFolderError(`marks.json is not valid JSON: ${(err as Error).message}`);
  }

  const result = MarksFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new DesignFolderError(`marks.json failed validation: ${result.error.message}`);
  }
  return result.data;
}

/** Validate and write marks.json. Never partially writes — validation runs before anything touches disk. */
export async function writeMarksJson(marksJsonPath: string, file: MarksFile): Promise<void> {
  const validated = MarksFileSchema.parse(file);
  const contents = `${JSON.stringify(validated, null, 2)}\n`;
  await fs.writeFile(marksJsonPath, contents, "utf8");
}

/**
 * Append a new pending mark to marks.json. This is what the canvas calls
 * (via the MCP-independent /api/marks route) when a user leaves feedback —
 * there is no MCP tool for creating a mark, only for reading and clearing
 * one, because a mark always originates from a click on the canvas.
 */
export async function addMark(folder: DesignFolder, input: NewMark): Promise<Mark> {
  const file = await readMarksJson(folder.marksJsonPath);
  const mark: Mark = {
    id: crypto.randomUUID(),
    artboardId: input.artboardId,
    element: input.element,
    comment: input.comment,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  await writeMarksJson(folder.marksJsonPath, { marks: [...file.marks, mark] });
  return mark;
}

/** The queue of feedback the agent has not yet acted on — what get_pending_marks returns. */
export async function getPendingMarks(folder: DesignFolder): Promise<Mark[]> {
  const file = await readMarksJson(folder.marksJsonPath);
  return file.marks.filter((mark) => mark.status === "pending");
}

/**
 * Acknowledge marks once they have been acted on, so they leave the pending
 * queue. With no ids, clears every currently pending mark — the common case
 * once an agent has worked through the whole list in one turn. Returns the
 * marks that were actually cleared (an id that was already cleared, or does
 * not exist, is simply not in the result).
 */
export async function clearMarks(folder: DesignFolder, ids?: string[]): Promise<Mark[]> {
  const file = await readMarksJson(folder.marksJsonPath);
  const targetIds = ids ? new Set(ids) : null;
  const cleared: Mark[] = [];

  const updated = file.marks.map((mark) => {
    if (mark.status === "pending" && (!targetIds || targetIds.has(mark.id))) {
      cleared.push(mark);
      return { ...mark, status: "cleared" as const };
    }
    return mark;
  });

  if (cleared.length > 0) {
    await writeMarksJson(folder.marksJsonPath, { marks: updated });
  }
  return cleared;
}
