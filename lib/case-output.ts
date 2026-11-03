import type { CaseReport, RunReport } from "./pipeline";

// No Node imports: the page uses this too.

/** How a case's output was read: its own format and encoding (a CSV among the pages of a web app), or the report's. */
export function outputKindOf(report: Pick<RunReport, "outputFormat" | "outputEncoding">, c: Pick<CaseReport, "output">): { format: string; encoding: string } {
  return c.output ?? { format: report.outputFormat, encoding: report.outputEncoding ?? "utf-8" };
}

/** "html" or "html・text": every format the report's cases were read in, the report's own first. */
export function formatsOf(report: Pick<RunReport, "outputFormat" | "outputEncoding" | "cases">): { format: string; encoding: string; count: number }[] {
  const found = new Map<string, { format: string; encoding: string; count: number }>();
  for (const c of report.cases) {
    const kind = outputKindOf(report, c);
    const key = `${kind.format}/${kind.encoding}`;
    const seen = found.get(key);
    if (seen) seen.count++;
    else found.set(key, { ...kind, count: 1 });
  }
  return [...found.values()];
}
