/** Raised for anything wrong with a design folder: missing files, invalid JSON, or a path escaping it. */
export class DesignFolderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignFolderError";
  }
}
