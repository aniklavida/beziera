import { promises as fs } from "node:fs";
import { DesignSchema, type Design } from "../schema/design.js";
import { DesignFolderError } from "./errors.js";

/** Read and validate design.json at the given path. Throws DesignFolderError on any problem. */
export async function readDesignJson(designJsonPath: string): Promise<Design> {
  let raw: string;
  try {
    raw = await fs.readFile(designJsonPath, "utf8");
  } catch {
    throw new DesignFolderError(`Missing design.json at ${designJsonPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new DesignFolderError(
      `design.json is not valid JSON: ${(err as Error).message}`
    );
  }

  const result = DesignSchema.safeParse(parsed);
  if (!result.success) {
    throw new DesignFolderError(
      `design.json failed validation: ${result.error.message}`
    );
  }
  return result.data;
}

/** Validate and write design.json. Never partially writes — validation runs before anything touches disk. */
export async function writeDesignJson(
  designJsonPath: string,
  design: Design
): Promise<void> {
  const validated = DesignSchema.parse(design);
  const contents = `${JSON.stringify(validated, null, 2)}\n`;
  await fs.writeFile(designJsonPath, contents, "utf8");
}
