import type { Comparison } from "../compare/compare-case";
import type { RunReport } from "../pipeline";
import { differentEndings, type ExecOutcome } from "../runner/outcome";
import type { ApplyResult, Edit } from "./apply-edit";

// Whether an applied edit fixed the case (DESIGN 7-4b): decided by comparing outputs again, not by
// asking anyone. No Node imports: the page uses this too.

/**
 * What is left of a case's difference after the baseline. "ending": the outputs are the same but
 * the runs ended differently (exit code, HTTP status, redirect), which is still a difference.
 */
export type Remaining = { kind: "lines"; count: number } | { kind: "ending"; old: string; new: string } | { kind: "noOutput" } | { kind: "unreadable" };

export type CaseDelta = {
  caseId: string;
  label: string;
  before: Remaining;
  after: Remaining;
  /** Another case whose difference now holds something it did not before, even with no more lines. */
  changed?: true;
};

/**
 * fixed: the case has no difference left and no other case got worse or changed.
 * notFixed: something is left in the case, and nothing else got worse or changed.
 * worse: another case got worse (more lines left, or no output), whatever happened to this one.
 * changed: another case's difference holds something new, though no more of it (DESIGN 7-4b:
 *   counting lines alone would let an edit that breaks a different line pass as harmless).
 */
export type FixOutcome = "fixed" | "notFixed" | "worse" | "changed";

/** The parts of a case remainingOf reads. */
type Compared = { comparison: Comparison; runs: { slot: string; outcome: ExecOutcome }[] };

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
  /**
   * Edits already in work/ when this one was applied (the ones pressed before it, in order), so
   * what the copy holds can be told in full: a second edit is made on top of the first.
   */
  earlier?: Edit[];
  /** Present only when the edit was applied and everything ran again. */
  verification?: { outcome: FixOutcome; deltas: CaseDelta[] };
};

/**
 * Every edit the copy in work/ holds after this report's run, in the order applied: the earlier
 * ones and this one (when it was applied). None for a report with no edit.
 */
export function editsIn(report: RunReport): Edit[] {
  const a = report.fixAttempt;
  if (!a) return [];
  return [...(a.earlier ?? []), ...(a.applied.kind === "applied" ? [a.edit] : [])];
}

export function remainingOf({ comparison, runs }: Compared): Remaining {
  if (comparison.kind === "missingOutput") return { kind: "noOutput" };
  if (comparison.kind === "unreadable") return { kind: "unreadable" };
  const kept = comparison.changes.filter((c) => !c.explainedByBaseline);
  const count = kept.reduce((n, c) => n + Math.max(c.oldLines.length, c.newLines.length), 0);
  const ending = count === 0 ? differentEndings(runs) : null;
  return ending ? { kind: "ending", ...ending } : { kind: "lines", count };
}

export function describeRemaining(r: Remaining): string {
  if (r.kind === "noOutput") return "出力なし";
  if (r.kind === "unreadable") return "出力が読めない";
  if (r.kind === "ending") return `出力は同じ・終わり方が違う（${r.old}／${r.new}）`;
  return r.count === 0 ? "差なし" : `残った差 ${r.count} 行`;
}

/** "残った差 3 行 → 残った差 3 行（差の中身が変わりました）": one case before and after an edit. */
export function describeDelta(d: CaseDelta): string {
  return `${describeRemaining(d.before)} → ${describeRemaining(d.after)}${d.changed ? "（差の中身が変わりました）" : ""}`;
}

/**
 * The other cases the edit left as they were, with something still in them. After "直りました" the
 * run can still have a broken case, and without naming it the page reads as "not fixed" (11/4).
 */
export function leftAsTheyWere(deltas: CaseDelta[], caseId: string): CaseDelta[] {
  const clear = (r: Remaining) => r.kind === "lines" && r.count === 0;
  return deltas.filter((d) => d.caseId !== caseId && !d.changed && !clear(d.after) && JSON.stringify(d.before) === JSON.stringify(d.after));
}

/** No output is worse than any number of differing lines; more lines are worse than fewer; a different ending counts as one. */
function severity(r: Remaining): number {
  if (r.kind === "lines") return r.count;
  return r.kind === "ending" ? 1 : Number.MAX_SAFE_INTEGER;
}

/** The difference itself, line by line ("-" old, "+" new), with the endings when they differ. */
function differenceOf({ comparison, runs }: Compared): string[] {
  const ending = differentEndings(runs);
  const lines = ending ? [`終わり方 ${ending.old}／${ending.new}`] : [];
  if (comparison.kind !== "compared") return lines;
  for (const c of comparison.changes.filter((ch) => !ch.explainedByBaseline)) {
    lines.push(...c.oldLines.map((l) => `-${l}`), ...c.newLines.map((l) => `+${l}`));
  }
  return lines;
}

/** Whether `after` holds a line `before` did not (as many times as it appears). */
function holdsSomethingNew(before: string[], after: string[]): boolean {
  const left = new Map<string, number>();
  for (const l of before) left.set(l, (left.get(l) ?? 0) + 1);
  return after.some((l) => {
    const n = left.get(l) ?? 0;
    left.set(l, n - 1);
    return n <= 0;
  });
}

export function assessFix(caseId: string, before: RunReport, after: RunReport): { outcome: FixOutcome; deltas: CaseDelta[] } {
  const deltas = after.cases.map((c): CaseDelta => {
    const old = before.cases.find((b) => b.caseId === c.caseId);
    const afterR = remainingOf(c);
    // A case that did not exist before is compared with itself: it cannot have got worse.
    if (!old) return { caseId: c.caseId, label: c.label, before: afterR, after: afterR };
    const changed = c.caseId !== caseId && holdsSomethingNew(differenceOf(old), differenceOf(c));
    return { caseId: c.caseId, label: c.label, before: remainingOf(old), after: afterR, ...(changed ? { changed: true as const } : {}) };
  });
  const others = deltas.filter((d) => d.caseId !== caseId);
  const worse = others.some((d) => severity(d.after) > severity(d.before));
  const changed = others.some((d) => d.changed);
  const target = deltas.find((d) => d.caseId === caseId);
  const fixed = target?.after.kind === "lines" && target.after.count === 0;
  return { outcome: worse ? "worse" : changed ? "changed" : fixed ? "fixed" : "notFixed", deltas };
}
