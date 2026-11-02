import type { RunReport } from "@/lib/pipeline";

// Where the page fetches files from. The bundled runs are found by subject (they share the run
// ids "bundled" and "bundled-fix"), so every link names the subject of the report it belongs to.

export function outputUrl(report: RunReport, caseId: string, slot: string): string {
  return `/api/outputs/${report.runId}/${caseId}/${slot}?subject=${encodeURIComponent(report.subjectId)}`;
}

export function sentUrl(subjectId: string, file: string): string {
  return `/api/sent/${file}?subject=${encodeURIComponent(subjectId)}`;
}
