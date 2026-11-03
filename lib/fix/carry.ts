import type { Change } from "../compare/baseline";
import type { CaseReport, RunReport } from "../pipeline";
import { differentEndings } from "../runner/outcome";

// After an edit the cases are compared again but not judged (Claude is not called: DESIGN 7-4).
// A case whose difference is exactly what it was before the edit would then read "unjudged",
// hiding a verdict that still applies word for word. That verdict is carried over, marked as
// such; any change at all in what differs leaves the case unjudged, as before.

/** `after` with the verdict from `original` carried to each unjudged case whose difference is unchanged. */
export function carryVerdicts(original: RunReport, after: RunReport): RunReport {
  const before = new Map(original.cases.map((c) => [c.caseId, c]));
  return { ...after, cases: after.cases.map((c) => carryOne(before.get(c.caseId), c)) };
}

function carryOne(before: CaseReport | undefined, now: CaseReport): CaseReport {
  if (now.verdict || !before) return now;
  const verdict = before.verdict ?? before.carried;
  if (!verdict || !sameDifference(before, now)) return now;
  return { ...now, carried: verdict };
}

/** The same lines changed in the same way, and the runs ended the same way. What the baseline set aside (dates, tokens) does not count. */
function sameDifference(a: CaseReport, b: CaseReport): boolean {
  if (a.comparison.kind !== "compared" || b.comparison.kind !== "compared") return false;
  const kept = (changes: Change[]) => JSON.stringify(changes.filter((ch) => !ch.explainedByBaseline).map((ch) => [ch.oldLines, ch.newLines]));
  return kept(a.comparison.changes) === kept(b.comparison.changes) && JSON.stringify(differentEndings(a.runs)) === JSON.stringify(differentEndings(b.runs));
}
