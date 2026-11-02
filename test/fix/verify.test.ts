import assert from "node:assert/strict";
import { test } from "node:test";
import type { Comparison } from "../../lib/compare/compare-case";
import { assessFix, remainingOf } from "../../lib/fix/verify";
import type { CaseReport, RunReport } from "../../lib/pipeline";

// Only what assessFix reads is filled in; the rest of a report does not matter here.
const lines = (count: number): Comparison =>
  ({
    kind: "compared",
    changes: Array.from({ length: count }, () => ({ oldLines: ["x"], newLines: [], explainedByBaseline: false })),
  }) as unknown as Comparison;
const noOutput: Comparison = { kind: "missingOutput", missing: ["new"] };
const report = (cases: Record<string, Comparison>): RunReport =>
  ({ cases: Object.entries(cases).map(([caseId, comparison]) => ({ caseId, label: caseId, comparison }) as CaseReport) }) as RunReport;

test("changes the baseline explained are not left over", () => {
  const c = { kind: "compared", changes: [{ oldLines: ["t1"], newLines: ["t2"], explainedByBaseline: true }] } as unknown as Comparison;
  assert.deepEqual(remainingOf(c), { kind: "lines", count: 0 });
});

test("fixed: nothing left in the case, nothing else worse", () => {
  const r = assessFix("c", report({ a: lines(0), c: lines(3) }), report({ a: lines(0), c: lines(0) }));
  assert.equal(r.outcome, "fixed");
});

test("not fixed: something is still left in the case", () => {
  assert.equal(assessFix("c", report({ c: lines(3) }), report({ c: lines(1) })).outcome, "notFixed");
});

test("worse: another case lost its output, even though this one is fixed", () => {
  const r = assessFix("c", report({ a: lines(0), c: lines(3) }), report({ a: noOutput, c: lines(0) }));
  assert.equal(r.outcome, "worse");
});

test("another case getting better is not worse", () => {
  const r = assessFix("c", report({ b: lines(3), c: lines(3) }), report({ b: lines(0), c: lines(0) }));
  assert.equal(r.outcome, "fixed");
});
