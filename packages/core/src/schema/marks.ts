import { z } from "zod";

/**
 * A reference to one element on an artboard, reported by mark-agent.js
 * (the script the canvas injects into an artboard's sandboxed iframe).
 *
 * `selector` is a structural CSS path (id if present, otherwise tag plus
 * position among same-tag siblings) computed inside the iframe at click
 * time. An artboard is a static HTML file rather than a live application,
 * so this is a stable enough reference to the same element across reloads
 * of the same file — it is not guaranteed to survive the agent restructuring
 * the document, the same way a code review comment does not survive a
 * rewrite of the line it was left on.
 */
export const ElementRefSchema = z.object({
  selector: z.string().min(1),
  tag: z.string().min(1),
  id: z.string().optional(),
  classes: z.array(z.string()).default([]),
  text: z.string().optional(),
  rect: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});
export type ElementRef = z.infer<typeof ElementRefSchema>;

/** The fields the canvas supplies when a user leaves a mark; the rest (id, createdAt, status) are assigned when it is added. */
export const NewMarkSchema = z.object({
  artboardId: z.string().min(1),
  element: ElementRefSchema,
  comment: z.string().min(1),
});
export type NewMark = z.infer<typeof NewMarkSchema>;

/** One piece of user feedback, anchored to an element on an artboard. */
export const MarkSchema = z.object({
  id: z.string().min(1),
  artboardId: z.string().min(1),
  element: ElementRefSchema,
  comment: z.string().min(1),
  createdAt: z.string().min(1),
  status: z.enum(["pending", "cleared"]).default("pending"),
});
export type Mark = z.infer<typeof MarkSchema>;

/** The full contents of marks.json: the queue of feedback from the canvas. */
export const MarksFileSchema = z.object({
  marks: z.array(MarkSchema).default([]),
});
export type MarksFile = z.infer<typeof MarksFileSchema>;
