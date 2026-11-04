import assert from "node:assert/strict";
import { test } from "node:test";
import type { Comparison } from "../../lib/compare/compare-case";
import { assessFix, editsIn, remainingOf } from "../../lib/fix/verify";
import type { CaseReport, RunReport } from "../../lib/pipeline";
import type { ExecOutcome } from "../../lib/runner/outcome";

// Only what assessFix reads is filled in; the rest of a report does not matter here.
const lines = (count: number, text = "x"): Comparison =>
  ({
    kind: "compared",
    changes: Array.from({ length: count }, (_, i) => ({ oldLines: [`${text}${i}`], newLines: [], explainedByBaseline: false })),
  }) as unknown as Comparison;
const noOutput: Comparison = { kind: "missingOutput", missing: ["new"] };
const exited = (exitCode: number): ExecOutcome => ({ kind: "exited", exitCode });
const runs = (newEnding: ExecOutcome = exited(0)) => [
  { slot: "old", outcome: exited(0) },
  { slot: "new", outcome: newEnding },
];
const one = (comparison: Comparison, newEnding?: ExecOutcome) => ({ comparison, runs: runs(newEnding) });
const report = (cases: Record<string, Comparison | ReturnType<typeof one>>): RunReport =>
  ({
    cases: Object.entries(cases).map(([caseId, c]) => ({ caseId, label: caseId, ...("comparison" in c ? c : one(c)) }) as CaseReport),
  }) as RunReport;

test("changes the baseline explained are not left over", () => {
  const c = { kind: "compared", changes: [{ oldLines: ["t1"], newLines: ["t2"], explainedByBaseline: true }] } as unknown as Comparison;
  assert.deepEqual(remainingOf(one(c)), { kind: "lines", count: 0 });
});

test("the same output with a different ending is still something left", () => {
  assert.deepEqual(remainingOf(one(lines(0), exited(255))), { kind: "ending", old: "終了コード 0", new: "終了コード 255" });
});

test("fixed: nothing left in the case, nothing else worse", () => {
  const r = assessFix("c", report({ a: lines(0), c: lines(3) }), report({ a: lines(0), c: lines(0) }));
  assert.equal(r.outcome, "fixed");
});

test("not fixed: something is still left in the case", () => {
  assert.equal(assessFix("c", report({ c: lines(3) }), report({ c: lines(1) })).outcome, "notFixed");
});

test("not fixed: the output is the same now, but the run ends differently", () => {
  assert.equal(assessFix("c", report({ c: lines(3) }), report({ c: one(lines(0), exited(255)) })).outcome, "notFixed");
});

test("worse: another case lost its output, even though this one is fixed", () => {
  const r = assessFix("c", report({ a: lines(0), c: lines(3) }), report({ a: noOutput, c: lines(0) }));
  assert.equal(r.outcome, "worse");
});

test("worse: another case now ends differently", () => {
  const r = assessFix("c", report({ a: lines(0), c: lines(3) }), report({ a: one(lines(0), exited(1)), c: lines(0) }));
  assert.equal(r.outcome, "worse");
});

test("another case getting better is not worse", () => {
  const r = assessFix("c", report({ b: lines(3), c: lines(3) }), report({ b: lines(0), c: lines(0) }));
  assert.equal(r.outcome, "fixed");
});

test("changed: another case keeps as many lines, but different ones, so this is not 'fixed'", () => {
  const r = assessFix("c", report({ b: lines(2, "合計 57,000 "), c: lines(3) }), report({ b: lines(2, "合計 72,000 "), c: lines(0) }));
  assert.equal(r.outcome, "changed");
  assert.equal(r.deltas.find((d) => d.caseId === "b")?.changed, true);
});

test("another case keeping a part of the same difference is not a change", () => {
  const r = assessFix("c", report({ b: lines(3), c: lines(3) }), report({ b: lines(1), c: lines(0) }));
  assert.equal(r.outcome, "fixed");
  assert.equal(r.deltas.find((d) => d.caseId === "b")?.changed, undefined);
});

test("the edits a copy holds: the earlier ones, then this one when it was applied", () => {
  const a = { file: "a.py", oldText: "1", newText: "2" };
  const b = { file: "a.py", oldText: "2", newText: "3" };
  const withAttempt = (attempt: object) => ({ fixAttempt: attempt }) as unknown as RunReport;
  assert.deepEqual(editsIn({} as RunReport), []);
  assert.deepEqual(editsIn(withAttempt({ edit: b, earlier: [a], applied: { kind: "applied", file: "a.py", line: 1 } })), [a, b]);
  assert.deepEqual(editsIn(withAttempt({ edit: b, earlier: [a], applied: { kind: "refused", message: "", nextStep: "" } })), [a]);
});
