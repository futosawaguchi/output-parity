import { readFile } from "node:fs/promises";
import { diffLines } from "./line-diff";

/**
 * What a plain `diff` of the two raw files would report. Shown next to the verdict on purpose:
 * it is the "everything differs" answer this tool exists to replace (DESIGN 4-2, 5).
 */
export type NaiveDiff = {
  oldBytes: number;
  newBytes: number;
  /** Lines (split on newline bytes) that differ on either side. */
  differingLines: number;
  totalLines: number;
  /** The first lines of the raw diff, with unprintable bytes shown as "·". */
  excerpt: string[];
};

const EXCERPT_LINES = 8;
const EXCERPT_WIDTH = 100;

export async function naiveDiff(oldPath: string, newPath: string): Promise<NaiveDiff> {
  const [a, b] = await Promise.all([readFile(oldPath), readFile(newPath)]);
  // latin1 maps every byte to one character, so binary content survives the split unchanged.
  const oldLines = a.toString("latin1").split("\n");
  const newLines = b.toString("latin1").split("\n");
  const hunks = diffLines(oldLines, newLines);

  const excerpt = hunks
    .flatMap((h) => [...h.oldLines.map((l) => `< ${l}`), ...h.newLines.map((l) => `> ${l}`)])
    .slice(0, EXCERPT_LINES)
    .map(printable);

  return {
    oldBytes: a.length,
    newBytes: b.length,
    differingLines: hunks.reduce((n, h) => n + h.oldLines.length + h.newLines.length, 0),
    totalLines: Math.max(oldLines.length, newLines.length),
    excerpt,
  };
}

function printable(line: string): string {
  const shown = line.replace(/[^\x20-\x7e]/g, "·");
  return shown.length > EXCERPT_WIDTH ? `${shown.slice(0, EXCERPT_WIDTH)}…` : shown;
}
