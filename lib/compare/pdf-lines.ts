// How the text of a PDF page is joined into lines. Kept apart from pdf.ts (which reads files) so
// the page can group the text it draws the same way the comparison did, and mark the lines that changed.

export type TextItem = { str: string; transform: number[]; width: number };

/** Items whose baselines differ by less than this many points are on the same line. */
const SAME_LINE_TOLERANCE = 1;

/** One line of a page and where it sits, in PDF points (y grows upward from the bottom of the page). */
export type Row = { text: string; left: number; right: number; baseline: number; size: number };

/** Joins text items into lines with where each one is: top to bottom, then left to right. */
export function groupIntoRows(items: TextItem[]): Row[] {
  const indexed = items.map((item, index) => ({ item, index, x: item.transform[4], y: item.transform[5] }));
  // Stable order: by y descending (PDF y grows upward), then x, then original order.
  indexed.sort((a, b) => b.y - a.y || a.x - b.x || a.index - b.index);

  const rows: (typeof indexed)[] = [];
  for (const entry of indexed) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - entry.y) < SAME_LINE_TOLERANCE) row.push(entry);
    else rows.push([entry]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x || a.index - b.index);
    return {
      text: row
        .map((e) => e.item.str.trim())
        .join(" ")
        .replace(/\s+/g, " "),
      left: Math.min(...row.map((e) => e.x)),
      right: Math.max(...row.map((e) => e.x + e.item.width)),
      baseline: row[0].y,
      size: Math.max(...row.map((e) => Math.abs(e.item.transform[3]))),
    };
  });
}

/** Joins text items into lines: top to bottom, then left to right. */
export function groupIntoLines(items: TextItem[]): string[] {
  return groupIntoRows(items).map((r) => r.text);
}
