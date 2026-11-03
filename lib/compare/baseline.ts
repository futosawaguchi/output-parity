import { diffLines, type Hunk } from "./line-diff";

// The baseline knows nothing about formats: it never says "ignore /CreationDate".
// It only learns which lines differ between two runs in the same environment with the
// same input (DESIGN 4-2). Those lines have no reason to differ, so they change on every run.
//
// Within such a line only the parts that actually changed are set aside. A line can hold a
// timestamp next to an amount ("発行 10:00:01 合計 72,000"): the timestamp changes on every run,
// the amount does not, and a changed amount must still reach the judge.

/** Which parts of an unstable line may differ: per token, or the whole line when it cannot tell. */
export type Unstable = boolean[] | "whole";

/**
 * A line in pieces: a run of ASCII letters and digits with the separators inside it
 * (72,000 / 10:00:01 / 2026-11-02T07:17:45+00:00 / uuid:32067e12-e78d-…), a run of white space,
 * or a run of anything else (Japanese text, which often sits right next to a number with no
 * space: "合計72,000" stays two pieces). Pure text: no knowledge of any format.
 */
export function tokens(line: string): string[] {
  return line.match(/[A-Za-z0-9][A-Za-z0-9,.:\-/+'_]*|\s+|[^A-Za-z0-9\s]+/g) ?? [];
}

/** Lines in `current` that are not reproduced by `repeat` (same environment, same input), and how. */
export function unstableLines(current: string[], repeat: string[]): Map<number, Unstable> {
  const unstable = new Map<number, Unstable>();
  for (const hunk of diffLines(current, repeat)) {
    hunk.oldLines.forEach((line, k) => {
      const other = hunk.oldLines.length === hunk.newLines.length ? hunk.newLines[k] : undefined;
      unstable.set(hunk.oldStart + k, other === undefined ? "whole" : changedTokens(line, other));
    });
  }
  return unstable;
}

function changedTokens(a: string, b: string): Unstable {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length !== tb.length) return "whole";
  return ta.map((t, i) => t !== tb[i]);
}

/**
 * Whether `oldLine` equals `newLine` once the parts that change on every run are set aside.
 * A line the second run could not pair up ("whole") says nothing about which parts change, so
 * any difference in it is kept: setting it aside could hide a changed amount.
 */
export function sameApartFromUnstable(oldLine: string, newLine: string, unstable: Unstable): boolean {
  if (unstable === "whole") return oldLine === newLine;
  const to = tokens(oldLine);
  const tn = tokens(newLine);
  return to.length === tn.length && tn.every((t, i) => unstable[i] || t === to[i]);
}

export type Change = Hunk & {
  /** True when every new line here is one that also changed between two runs of the new environment. */
  explainedByBaseline: boolean;
};

/**
 * Splits old-vs-new hunks into changes and marks those the baseline explains.
 * Only a one-for-one replacement of an unstable line that differs from the old line in its
 * unstable parts alone is explained; a line that appeared or disappeared is never explained,
 * so the baseline can drop too little but not too much.
 */
export function applyBaseline(hunks: Hunk[], unstableInNew: Map<number, Unstable>): Change[] {
  const changes: Change[] = [];
  for (const hunk of hunks) {
    if (hunk.oldLines.length !== hunk.newLines.length) {
      changes.push({ ...hunk, explainedByBaseline: false });
      continue;
    }
    // Same length: pair lines up so a stable line does not keep a neighbouring date unexplained.
    let pending: Change | null = null;
    hunk.newLines.forEach((line, k) => {
      const unstable = unstableInNew.get(hunk.newStart + k);
      const explained = unstable !== undefined && sameApartFromUnstable(hunk.oldLines[k], line, unstable);
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
