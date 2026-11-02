import { diffLines, type Hunk } from "./line-diff";

// The baseline knows nothing about formats: it never says "ignore /CreationDate".
// It only learns which lines differ between two runs in the same environment with the
// same input (DESIGN 4-2). Those lines have no reason to differ, so they change on every run.

/** Indices of lines in `current` that are not reproduced by `repeat` (same environment, same input). */
export function unstableLines(current: string[], repeat: string[]): Set<number> {
  const unstable = new Set<number>();
  for (const hunk of diffLines(current, repeat)) {
    hunk.oldLines.forEach((_, k) => unstable.add(hunk.oldStart + k));
  }
  return unstable;
}

export type Change = Hunk & {
  /** True when every new line here is one that also changed between two runs of the new environment. */
  explainedByBaseline: boolean;
};

/**
 * Splits old-vs-new hunks into changes and marks those the baseline explains.
 * Only a one-for-one replacement of unstable lines is explained; a line that appeared
 * or disappeared is never explained, so the baseline can drop too little but not too much.
 */
export function applyBaseline(hunks: Hunk[], unstableInNew: Set<number>): Change[] {
  const changes: Change[] = [];
  for (const hunk of hunks) {
    if (hunk.oldLines.length !== hunk.newLines.length) {
      changes.push({ ...hunk, explainedByBaseline: false });
      continue;
    }
    // Same length: pair lines up so a stable line does not keep a neighbouring date unexplained.
    let pending: Change | null = null;
    hunk.newLines.forEach((line, k) => {
      const explained = unstableInNew.has(hunk.newStart + k);
      if (pending && pending.explainedByBaseline === explained) {
        pending.oldLines.push(hunk.oldLines[k]);
        pending.newLines.push(line);
        return;
      }
      if (pending) changes.push(pending);
      pending = {
        oldStart: hunk.oldStart + k,
        oldLines: [hunk.oldLines[k]],
        newStart: hunk.newStart + k,
        newLines: [line],
        explainedByBaseline: explained,
      };
    });
    if (pending) changes.push(pending);
  }
  return changes;
}
