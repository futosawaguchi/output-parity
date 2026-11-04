// The edit a run was checked with, as a patch for the original source: what a person applies with
// their usual steps (a branch, a review, a commit). The tool never writes the original itself.

import type { Edit } from "./apply-edit";

/** Lines of unchanged text shown around a change, as diff -u does. */
const CONTEXT = 3;

/**
 * A unified diff of one file, from its text before to its text after (the edit made in one
 * place). Paths are a/<file> and b/<file>, so `git apply` and `patch -p1` take it from the
 * source's root. null when the two are the same.
 */
export function makePatch(file: string, before: string, after: string): string | null {
  if (before === after) return null;
  const a = linesOf(before);
  const b = linesOf(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

  const from = Math.max(0, head - CONTEXT);
  const aEnd = Math.min(a.length, a.length - tail + CONTEXT);
  const bEnd = Math.min(b.length, b.length - tail + CONTEXT);
  // A side whose last line has no newline says so after it, when the hunk reaches that line.
  const noNewline = "\\ No newline at end of file";
  const end = (text: string, side: string[], at: number) => (at === side.length && !text.endsWith("\n") ? [noNewline] : []);
  const removed = a.slice(head, a.length - tail).map((l) => `-${l}`);
  const added = b.slice(head, b.length - tail).map((l) => `+${l}`);
  const context = a.slice(a.length - tail, aEnd).map((l) => ` ${l}`);
  const lines = [
    ...a.slice(from, head).map((l) => ` ${l}`),
    ...removed,
    ...(tail === 0 ? end(before, a, a.length) : []),
    ...added,
    ...(tail === 0 ? end(after, b, b.length) : []),
    ...context,
    ...(tail > 0 ? end(before, a, aEnd) : []),
  ];
  const range = (start: number, end: number) => `${end - start === 0 ? start : start + 1},${end - start}`;
  return [`--- a/${file}`, `+++ b/${file}`, `@@ -${range(from, aEnd)} +${range(from, bEnd)} @@`, ...lines, ""].join("\n");
}

/** The lines of a text; a newline at the very end ends the last line rather than starting another. */
function linesOf(text: string): string[] {
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

/**
 * Applies edits one after another to the original texts of their files, as they were applied to
 * the copy. Each must find its text before exactly once, or nothing is made: the original has
 * changed since the copy was made (or is already fixed). Returns each changed file's text after.
 */
export function applyAll(edits: Edit[], originals: Map<string, string>): { ok: true; after: Map<string, string> } | { ok: false; file: string } {
  const after = new Map(originals);
  for (const e of edits) {
    const text = after.get(e.file);
    if (text === undefined || text.split(e.oldText).length !== 2) return { ok: false, file: e.file };
    after.set(e.file, text.replace(e.oldText, () => e.newText));
  }
  return { ok: true, after };
}
