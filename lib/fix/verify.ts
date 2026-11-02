import type { Comparison } from "../compare/compare-case";
import type { RunReport } from "../pipeline";
import type { ApplyResult, Edit } from "./apply-edit";

// Whether an applied edit fixed the case (DESIGN 7-4b): decided by comparing outputs again, not by
// asking anyone. No Node imports: the page uses this too.

/** What is left of a case's difference after the baseline. */
export type Remaining = { kind: "lines"; count: number } | { kind: "noOutput" } | { kind: "unreadable" };

export type CaseDelta = { caseId: string; label: string; before: Remaining; after: Remaining };

/**
 * fixed: the case has no difference left and no other case got worse.
 * notFixed: something is left in the case, and nothing else got worse.
 * worse: another case got worse, whatever happened to this one.
 */
export type FixOutcome = "fixed" | "notFixed" | "worse";

/** One press of "apply": what was written, and what the run after it showed. */
export type FixAttempt = {
  caseId: string;
  edit: Edit;
  applied: ApplyResult;
  /**
   * The report from before any edit was applied, to go back to with "undo". After two edits in a
   * row it is still the one before the first: undo returns work/ to the original, not one step.
   */
  original: RunReport;
  /** Present only when the edit was applied and everything ran again. */
  verification?: { outcome: FixOutcome; deltas: CaseDelta[] };
};

export function remainingOf(comparison: Comparison): Remaining {
  if (comparison.kind === "missingOutput") return { kind: "noOutput" };
  if (comparison.kind === "unreadable") return { kind: "unreadable" };
  const kept = comparison.changes.filter((c) => !c.explainedByBaseline);
  return { kind: "lines", count: kept.reduce((n, c) => n + Math.max(c.oldLines.length, c.newLines.length), 0) };
}

export function describeRemaining(r: Remaining): string {
  if (r.kind === "noOutput") return "出力なし";
  if (r.kind === "unreadable") return "出力が読めない";
  return r.count === 0 ? "差なし" : `残った差 ${r.count} 行`;
}

/** No output is worse than any number of differing lines; more lines are worse than fewer. */
function severity(r: Remaining): number {
  return r.kind === "lines" ? r.count : Number.MAX_SAFE_INTEGER;
}

export function assessFix(caseId: string, before: RunReport, after: RunReport): { outcome: FixOutcome; deltas: CaseDelta[] } {
  const deltas = after.cases.map((c): CaseDelta => {
    const old = before.cases.find((b) => b.caseId === c.caseId);
    const afterR = remainingOf(c.comparison);
    // A case that did not exist before is compared with itself: it cannot have got worse.
    return { caseId: c.caseId, label: c.label, before: old ? remainingOf(old.comparison) : afterR, after: afterR };
  });
  const worse = deltas.some((d) => d.caseId !== caseId && severity(d.after) > severity(d.before));
  const target = deltas.find((d) => d.caseId === caseId);
  const fixed = target?.after.kind === "lines" && target.after.count === 0;
  return { outcome: worse ? "worse" : fixed ? "fixed" : "notFixed", deltas };
}
