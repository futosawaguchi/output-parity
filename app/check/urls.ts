import { outputKindOf } from "@/lib/case-output";
import type { CaseReport, RunReport } from "@/lib/pipeline";

// Where the page fetches files from. The bundled runs are found by subject (they share the run
// ids "bundled" and "bundled-fix"), so every link names the subject of the report it belongs to.

export function outputUrl(report: RunReport, caseId: string, slot: string): string {
  return `/api/outputs/${report.runId}/${caseId}/${slot}?subject=${encodeURIComponent(report.subjectId)}`;
}

/** An HTML output as a page to draw, in the encoding it was read in (the route locks it down). */
export function pageUrl(report: RunReport, c: CaseReport, slot: string): string {
  return `${outputUrl(report, c.caseId, slot)}&view=page&charset=${encodeURIComponent(outputKindOf(report, c).encoding)}`;
}

/**
 * The record of what was checked for the report on the page, to read and to save: the finished
 * job's, or the bundled run's. null when the page shows neither (a report the server no longer holds).
 */
export function recordUrls(report: RunReport, jobId: string | null): { page: string; markdown: string } | null {
  const which: [string, string] | null = jobId ? ["job", jobId] : report.origin === "bundled" ? ["from", report.fixAttempt ? "bundled-fix" : "bundled"] : null;
  if (!which) return null;
  const query = new URLSearchParams([["subject", report.subjectId], which]).toString();
  return { page: `/check/record?${query}`, markdown: `/api/record?${query}` };
}

/** What was sent to Claude, as a page to read. */
export function sentUrl(subjectId: string, file: string): string {
  return `/check/sent/${encodeURIComponent(file)}?subject=${encodeURIComponent(subjectId)}`;
}
