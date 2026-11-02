/** A run of lines that differ between two documents. Indices are 0-based. */
export type Hunk = {
  oldStart: number;
  oldLines: string[];
  newStart: number;
  newLines: string[];
};

/**
 * Line diff based on the longest common subsequence. Deterministic: the same inputs
 * always give the same hunks. O(n·m), which is fine for documents of a few thousand lines.
 */
export function diffLines(oldLines: string[], newLines: string[]): Hunk[] {
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
