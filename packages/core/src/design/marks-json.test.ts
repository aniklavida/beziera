import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDesignFolder } from "./folder.js";
import { readMarksJson, writeMarksJson, addMark, getPendingMarks, clearMarks } from "./marks-json.js";
import type { ElementRef } from "../schema/marks.js";

async function makeDesignFolder(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "beziera-core-marks-test-"));
  await fs.mkdir(path.join(root, "artboards"), { recursive: true });
  await fs.writeFile(
    path.join(root, "artboards", "login.html"),
    "<!doctype html><html><body><button id=\"go\">Go</button></body></html>",
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "design.json"),
    JSON.stringify(
      {
        name: "Test design",
        artboards: [
          { id: "login", file: "artboards/login.html", name: "Sign in", x: 0, y: 0, width: 480, height: 640 },
        ],
        links: [],
      },
      null,
      2
    ),
    "utf8"
  );
  return root;
}

const SAMPLE_ELEMENT: ElementRef = {
  selector: "body > button#go",
  tag: "button",
  id: "go",
  classes: [],
  text: "Go",
  rect: { x: 10, y: 20, width: 80, height: 32 },
};

test("openDesignFolder does not require marks.json to exist", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root); // must not throw
  assert.ok(folder.marksJsonPath.endsWith("marks.json"));
});

test("readMarksJson returns an empty queue when the file does not exist", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  const file = await readMarksJson(folder.marksJsonPath);

  assert.deepEqual(file, { marks: [] });
  await assert.rejects(() => fs.access(folder.marksJsonPath));
});

test("readMarksJson rejects invalid JSON", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);
  await fs.writeFile(folder.marksJsonPath, "{not json", "utf8");

  await assert.rejects(() => readMarksJson(folder.marksJsonPath), /not valid JSON/);
});

test("readMarksJson rejects a file that fails schema validation", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);
  await fs.writeFile(folder.marksJsonPath, JSON.stringify({ marks: [{ id: "x" }] }), "utf8");

  await assert.rejects(() => readMarksJson(folder.marksJsonPath), /failed validation/);
});

test("addMark creates marks.json on first use and appends a pending mark", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  const mark = await addMark(folder, { artboardId: "login", element: SAMPLE_ELEMENT, comment: "Button is too small" });

  assert.equal(mark.status, "pending");
  assert.equal(mark.artboardId, "login");
  assert.ok(mark.id);
  assert.ok(mark.createdAt);

  const onDisk = await readMarksJson(folder.marksJsonPath);
  assert.equal(onDisk.marks.length, 1);
  assert.equal(onDisk.marks[0].comment, "Button is too small");
});

test("getPendingMarks reports only pending marks, across multiple adds", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  await addMark(folder, { artboardId: "login", element: SAMPLE_ELEMENT, comment: "First" });
  await addMark(folder, { artboardId: "login", element: SAMPLE_ELEMENT, comment: "Second" });

  const pending = await getPendingMarks(folder);
  assert.equal(pending.length, 2);
  assert.deepEqual(
    pending.map((m) => m.comment),
    ["First", "Second"]
  );
});

test("clearMarks with no ids clears every pending mark", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);
  await addMark(folder, { artboardId: "login", element: SAMPLE_ELEMENT, comment: "First" });
  await addMark(folder, { artboardId: "login", element: SAMPLE_ELEMENT, comment: "Second" });

  const cleared = await clearMarks(folder);

  assert.equal(cleared.length, 2);
  assert.deepEqual(await getPendingMarks(folder), []);
});

test("clearMarks with specific ids clears only those, leaving the rest pending", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);
  const first = await addMark(folder, { artboardId: "login", element: SAMPLE_ELEMENT, comment: "First" });
  await addMark(folder, { artboardId: "login", element: SAMPLE_ELEMENT, comment: "Second" });

  const cleared = await clearMarks(folder, [first.id]);

  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].comment, "First");
  const pending = await getPendingMarks(folder);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].comment, "Second");
});

test("clearMarks is a no-op for an id that does not exist or is already cleared", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);
  const mark = await addMark(folder, { artboardId: "login", element: SAMPLE_ELEMENT, comment: "First" });

  await clearMarks(folder, [mark.id]);
  const secondAttempt = await clearMarks(folder, [mark.id, "does-not-exist"]);

  assert.deepEqual(secondAttempt, []);
});

test("writeMarksJson validates before writing, mirroring writeDesignJson", async () => {
  const root = await makeDesignFolder();
  const folder = await openDesignFolder(root);

  // Deliberately invalid: comment is required. Built as `unknown` and cast
  // at the call site so the test exercises writeMarksJson's runtime zod
  // validation rather than being caught by TypeScript first.
  const invalid = {
    marks: [{ id: "x", artboardId: "login", element: SAMPLE_ELEMENT, createdAt: "now", status: "pending" }],
  } as unknown as Parameters<typeof writeMarksJson>[1];

  await assert.rejects(() => writeMarksJson(folder.marksJsonPath, invalid));
  await assert.rejects(() => fs.access(folder.marksJsonPath));
});
