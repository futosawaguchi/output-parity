/** A run of lines that differ between two documents. Indices are 0-based. */
export type Hunk = {
  oldStart: number;
  oldLines: string[];
  newStart: number;
  newLines: string[];
};

/** The LCS table holds one number per pair of lines; beyond this many the middle is not aligned. */
const MAX_CELLS = 25_000_000;

/**
 * Line diff based on the longest common subsequence. Deterministic: the same inputs
 * always give the same hunks. The lines both sides start and end with are set aside first,
 * so a few changes in a long output cost little. When what is left is still too large to align
 * (MAX_CELLS), it is reported as one changed block: too coarse, but nothing is hidden.
 */
export function diffLines(oldLines: string[], newLines: string[]): Hunk[] {
  let head = 0;
  while (head < oldLines.length && head < newLines.length && oldLines[head] === newLines[head]) head++;
  let tail = 0;
  while (
    tail < oldLines.length - head &&
    tail < newLines.length - head &&
    oldLines[oldLines.length - 1 - tail] === newLines[newLines.length - 1 - tail]
  ) {
    tail++;
  }
  const oldMiddle = oldLines.slice(head, oldLines.length - tail);
  const newMiddle = newLines.slice(head, newLines.length - tail);
  if (oldMiddle.length === 0 && newMiddle.length === 0) return [];
  if ((oldMiddle.length + 1) * (newMiddle.length + 1) > MAX_CELLS) {
    return [{ oldStart: head, oldLines: oldMiddle, newStart: head, newLines: newMiddle }];
  }
  return alignByLcs(oldMiddle, newMiddle).map((h) => ({ ...h, oldStart: h.oldStart + head, newStart: h.newStart + head }));
}

function alignByLcs(oldLines: string[], newLines: string[]): Hunk[] {
  const n = oldLines.length;
  const m = newLines.length;
  // lcs[i][j] = length of the LCS of oldLines[i..] and newLines[j..]
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = oldLines[i] === newLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  const open = (i: number, j: number): Hunk => (current ??= { oldStart: i, oldLines: [], newStart: j, newLines: [] });
  const close = () => {
    if (current) hunks.push(current);
    current = null;
  };

  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && oldLines[i] === newLines[j]) {
      close();
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      open(i, j).newLines.push(newLines[j++]);
    } else {
      open(i, j).oldLines.push(oldLines[i++]);
    }
  }
  close();
  return hunks;
}
