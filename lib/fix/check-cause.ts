import { readFile } from "node:fs/promises";
import { insideRoot } from "../safe-path";

// The machine's check of Claude's answer, like the arithmetic check of a verdict: a person should
// not have to open the file to know whether the line Claude pointed at is really there.

export type LineCheck = "matches" | "differs" | "missing";
export type EditCheck = "once" | "notFound" | "several" | "missing";

/** Whether `line` of `file` is the code Claude quoted. Whitespace at either end is ignored. */
export async function checkLine(root: string, file: string, line: number, code: string): Promise<LineCheck> {
  const lines = await linesOf(root, file);
  if (!lines || line < 1 || line > lines.length) return "missing";
  return lines[line - 1].trim() === code.trim() ? "matches" : "differs";
}

/** Whether the text to replace occurs exactly once, which is what applying the edit requires. */
export async function checkEdit(root: string, file: string, oldText: string): Promise<EditCheck> {
  const lines = await linesOf(root, file);
  if (!lines) return "missing";
  const text = lines.join("\n");
  const at = oldText === "" ? -1 : text.indexOf(oldText);
  if (at === -1) return "notFound";
  return text.indexOf(oldText, at + 1) === -1 ? "once" : "several";
}

async function linesOf(root: string, file: string): Promise<string[] | null> {
  const path = insideRoot(root, file);
  const text = path && (await readFile(path, "utf8").catch(() => null));
  return text ? text.split("\n") : null;
}
