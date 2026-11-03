import type { CaseReport } from "./pipeline";

// What to mark on an output drawn as it is (a PDF page, an HTML page), so a person sees where the
// two sides differ without hunting for it. Shared by the page (PDF, drawn in the browser) and the
// route that serves HTML pages (marked before they are sent).

/**
 * By the text of a line as the comparison read it: a changed line is framed in red; where lines
 * went missing, a red rule with how many is put under the line before them.
 */
export type LineMark = { kind: "changed"; text: string } | { kind: "goneAfter"; text: string; count: number };

/**
 * The marks for one side of a case, from the changes the baseline does not explain: the changed
 * lines themselves, and on the new side, where lines went missing.
 */
export function marksOf(c: CaseReport, slot: "old" | "new"): LineMark[] {
  const comparison = c.comparison;
  if (comparison.kind !== "compared") return [];
  return comparison.changes
    .filter((ch) => !ch.explainedByBaseline)
    .flatMap((ch): LineMark[] => {
      const lines = slot === "old" ? ch.oldLines : ch.newLines;
      const changed = lines.map((text): LineMark => ({ kind: "changed", text }));
      const before = comparison.new.lines[ch.newStart - 1];
      const gone = slot === "new" && ch.newLines.length === 0 && ch.oldLines.length > 0 && before !== undefined;
      return gone ? [...changed, { kind: "goneAfter", text: before, count: ch.oldLines.length }] : changed;
    });
}

/** Lines are matched by their text with runs of white space made one. */
export function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}
