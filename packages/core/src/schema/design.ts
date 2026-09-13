import { z } from "zod";

/**
 * One artboard's identity and placement on the canvas.
 *
 * `file` is a path relative to the design folder root, e.g. "artboards/login.html" —
 * never an absolute or machine-specific path, so a design folder still opens after
 * someone else clones it.
 */
export const ArtboardEntrySchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  name: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type ArtboardEntry = z.infer<typeof ArtboardEntrySchema>;

/**
 * A recorded prototype link between two artboards, by id.
 *
 * `link_artboards` populates this array, and the canvas reads it to draw the
 * connection between the two artboards it names.
 */
export const LinkEntrySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type LinkEntry = z.infer<typeof LinkEntrySchema>;

/** The full contents of design.json: canvas positions, links and metadata. */
export const DesignSchema = z.object({
  name: z.string().min(1),
  artboards: z.array(ArtboardEntrySchema).default([]),
  links: z.array(LinkEntrySchema).default([]),
});
export type Design = z.infer<typeof DesignSchema>;
