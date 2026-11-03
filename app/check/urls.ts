import type { RunReport } from "@/lib/pipeline";

// Where the page fetches files from. The bundled runs are found by subject (they share the run
// ids "bundled" and "bundled-fix"), so every link names the subject of the report it belongs to.

export function outputUrl(report: RunReport, caseId: string, slot: string): string {
  return `/api/outputs/${report.runId}/${caseId}/${slot}?subject=${encodeURIComponent(report.subjectId)}`;
}

/** An HTML output as a page to draw, in the encoding it was read in (the route locks it down). */
export function pageUrl(report: RunReport, caseId: string, slot: string): string {
  return `${outputUrl(report, caseId, slot)}&view=page&charset=${encodeURIComponent(report.outputEncoding ?? "utf-8")}`;
}

export function sentUrl(subjectId: string, file: string): string {
  return `/api/sent/${file}?subject=${encodeURIComponent(subjectId)}`;
}
