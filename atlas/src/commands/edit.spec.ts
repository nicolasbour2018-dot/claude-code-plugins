import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DraftError, makeDraft } from "./drafts.ts";
import { EditError, applied, blocksOf, editDraft } from "./edit.ts";

const TEMPLATE = join(import.meta.dir, "..", "..", "template");

const block = (from: string, to: string): string =>
  `<<<<<<< OLD\n${from}\n=======\n${to}\n>>>>>>> NEW\n`;

function refusal(run: () => void): Error | null {
  try {
    run();

    return null;
  } catch (error) {
    if (error instanceof EditError || error instanceof DraftError) {
      return error;
    }

    throw error;
  }
}

describe("blocksOf", () => {
  test("reads each block in order, its texts over several lines, and leaves out the lines between", () => {
    const text = `a note\n${block("one\ntwo", "three")}\n${block("four", "")}`;

    expect(blocksOf(text)).toEqual([
      { from: "one\ntwo", to: "three" },
      { from: "four", to: "" },
    ]);
  });

  test("refuses a block without its middle or end line, a block with nothing to replace, and no block", () => {
    expect(refusal(() => blocksOf("<<<<<<< OLD\none\n>>>>>>> NEW\n"))?.message).toBe(
      "the block at line 1 has no ======= line or no >>>>>>> NEW line",
    );
    expect(refusal(() => blocksOf("x\n<<<<<<< OLD\none\n=======\ntwo\n"))?.message).toBe(
      "the block at line 2 has no ======= line or no >>>>>>> NEW line",
    );
    expect(refusal(() => blocksOf(block("", "two")))?.message).toBe(
      "the block at line 1 has no text to replace",
    );
    expect(refusal(() => blocksOf("one\ntwo\n"))?.message).toBe(
      "stdin holds no block: each starts with a <<<<<<< OLD line",
    );
  });
});

describe("applied", () => {
  test("applies the blocks in order, each on the text the one before left", () => {
    const blocks = [
      { from: "red", to: "green" },
      { from: "green apple", to: "pear" },
    ];

    expect(applied("a red apple", blocks)).toBe("a pear");
  });

  test("refuses a text to replace that is missing, or found more than once", () => {
    expect(refusal(() => applied("a red apple", [{ from: "blue", to: "x" }]))?.message).toBe(
      "block 1: its text to replace is not in the file",
    );
    expect(
      refusal(() =>
        applied("red, red", [
          { from: "a", to: "b" },
          { from: "red", to: "x" },
        ]),
      )?.message,
    ).toBe("block 1: its text to replace is not in the file");
    expect(refusal(() => applied("red, red", [{ from: "red", to: "x" }]))?.message).toBe(
      "block 1: its text to replace is in the file more than once; add lines around it",
    );
  });
});

describe("editDraft", () => {
  let dir = "";

  let draft = "";

  beforeEach(() => {
    dir = join(realpathSync(mkdtempSync(join(tmpdir(), "atlas-edit-"))), "map");
    cpSync(TEMPLATE, dir, { recursive: true });
    draft = makeDraft(dir, "plan-test");
  });

  afterEach(() => {
    rmSync(join(dir, ".."), { recursive: true });
  });

  test("writes the blocks into the draft's file and leaves the map's as it was", () => {
    const edited = editDraft(
      dir,
      "plan-test",
      "./map.ts",
      block('label: "Part"', 'label: "Piece"'),
    );

    expect(edited).toEqual({ file: "map.ts", blocks: 1 });
    expect(readFileSync(join(draft, "map.ts"), "utf8")).toContain('label: "Piece"');
    expect(readFileSync(join(dir, "map.ts"), "utf8")).toContain('label: "Part"');
  });

  test("a failing block leaves the file unchanged, the blocks before it included", () => {
    const before = readFileSync(join(draft, "map.ts"), "utf8");
    const text = `${block('label: "Part"', 'label: "Piece"')}${block("missing", "x")}`;

    expect(refusal(() => editDraft(dir, "plan-test", "map.ts", text))?.message).toBe(
      "block 2: its text to replace is not in the file",
    );
    expect(readFileSync(join(draft, "map.ts"), "utf8")).toBe(before);
  });

  test("refuses a file that is no data file of the draft, and a draft that does not exist", () => {
    const text = block("x", "y");

    expect(refusal(() => editDraft(dir, "plan-test", "atlas.d.ts", text))?.message).toBe(
      "atlas.d.ts is no data file of the draft plan-test: atlas.config.ts, map.ts",
    );
    expect(refusal(() => editDraft(dir, "plan-test", "threads.json", text))?.message).toStartWith(
      "threads.json is no data file",
    );
    expect(refusal(() => editDraft(dir, "plan-test", "../../map.ts", text))?.message).toStartWith(
      "../../map.ts is no data file",
    );
    expect(refusal(() => editDraft(dir, "plan-other", "map.ts", text))?.message).toBe(
      `no draft plan-other: ${join(dir, "drafts", "plan-other")} holds no map.ts`,
    );
  });

  test("writes through a link to another file of the draft, and refuses one that leaves it", () => {
    symlinkSync("map.ts", join(draft, "alias.ts"));
    editDraft(dir, "plan-test", "alias.ts", block('label: "Part"', 'label: "Piece"'));

    expect(readFileSync(join(draft, "map.ts"), "utf8")).toContain('label: "Piece"');

    symlinkSync(join(dir, "map.ts"), join(draft, "outward.ts"));

    expect(refusal(() => editDraft(dir, "plan-test", "outward.ts", block("x", "y")))?.message).toBe(
      `outward.ts links out of the draft plan-test, to ${join(dir, "map.ts")}`,
    );
  });
});
