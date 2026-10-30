import { readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join, normalize, sep } from "node:path";

import { dataFilesOf, existingDraft } from "./drafts.ts";

// Replaces text in one data file of a draft, as Claude Code's Edit tool does, for `cli.ts edit`.
// In plan mode Edit writes the plan file alone: the plan-map skill marks its draft through this
// command, which writes nothing but a draft's data files.
export class EditError extends Error {}

const OLD = "<<<<<<< OLD";

const MIDDLE = "=======";

const NEW = ">>>>>>> NEW";

/** One replacement: `from`, found exactly once in the file, becomes `to`. */
export type Block = { readonly from: string; readonly to: string };

/**
 * The blocks a text holds, in order: an OLD line, the text to replace, a MIDDLE line, the text
 * that replaces it, a NEW line. Lines between blocks are left out.
 */
export function blocksOf(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let at = lines.indexOf(OLD);

  while (at !== -1) {
    const middle = lines.indexOf(MIDDLE, at + 1);
    const end = middle === -1 ? -1 : lines.indexOf(NEW, middle + 1);

    if (end === -1) {
      throw new EditError(`the block at line ${at + 1} has no ${MIDDLE} line or no ${NEW} line`);
    }

    const from = lines.slice(at + 1, middle).join("\n");

    if (from === "") {
      throw new EditError(`the block at line ${at + 1} has no text to replace`);
    }

    blocks.push({ from, to: lines.slice(middle + 1, end).join("\n") });
    at = lines.indexOf(OLD, end + 1);
  }

  if (blocks.length === 0) {
    throw new EditError(`stdin holds no block: each starts with a ${OLD} line`);
  }

  return blocks;
}

/** The text with every block applied in order, each one's `from` found exactly once. */
export function applied(text: string, blocks: readonly Block[]): string {
  let edited = text;

  for (const [index, { from, to }] of blocks.entries()) {
    const first = edited.indexOf(from);

    if (first === -1) {
      throw new EditError(`block ${index + 1}: its text to replace is not in the file`);
    }

    if (edited.indexOf(from, first + 1) !== -1) {
      throw new EditError(
        `block ${index + 1}: its text to replace is in the file more than once; add lines around it`,
      );
    }

    edited = `${edited.slice(0, first)}${to}${edited.slice(first + from.length)}`;
  }

  return edited;
}

export type Edited = { readonly file: string; readonly blocks: number };

/**
 * Applies the blocks of `text` to the data file `file` of the draft `name` of the map folder `dir`,
 * a real path. The file is written whole once every block applies: a failure leaves it unchanged.
 */
export function editDraft(dir: string, name: string, file: string, text: string): Edited {
  const path = existingDraft(dir, name);
  const data = dataFilesOf(path);
  const wanted = normalize(file);

  if (!data.includes(wanted)) {
    throw new EditError(`${file} is no data file of the draft ${name}: ${data.join(", ")}`);
  }

  // A draft carries only links that land on its own files (makeDraft): one that leaves it is refused.
  const target = realpathSync(join(path, wanted));

  if (!target.startsWith(`${path}${sep}`)) {
    throw new EditError(`${wanted} links out of the draft ${name}, to ${target}`);
  }

  const blocks = blocksOf(text);
  const edited = applied(readFileSync(target, "utf8"), blocks);
  const staged = `${target}.edit`;
  writeFileSync(staged, edited);
  renameSync(staged, target);

  return { file: wanted, blocks: blocks.length };
}
