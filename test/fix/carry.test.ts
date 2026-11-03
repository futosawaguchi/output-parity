import assert from "node:assert/strict";
import { test } from "node:test";
import type { Change } from "../../lib/compare/baseline";
import { carryVerdicts } from "../../lib/fix/carry";
import type { CaseVerdict } from "../../lib/judge/verdict";
import type { CaseReport, RunReport } from "../../lib/pipeline";

// After an edit nothing is judged again. A case whose difference is word for word what it was
// keeps the verdict from before, marked as carried; anything else stays unjudged.

const verdict: CaseVerdict = { caseId: "a", verdict: "broken", summary: "ギフト包装の行が消えた", findings: [], judgedBy: { kind: "claude", model: "m" } };

function change(oldLines: string[], newLines: string[], explainedByBaseline = false): Change {
  return { oldStart: 0, oldLines, newStart: 0, newLines, explainedByBaseline };
}

function caseOf(changes: Change[], v: CaseVerdict | null): CaseReport {
  const doc = { lines: [], pages: [], unreadable: [] };
  return { caseId: "a", label: "a", description: "", runs: [], comparison: { kind: "compared", old: doc, new: doc, baseline: { kind: "used" }, changes }, naive: null, verdict: v };
}

function report(c: CaseReport): RunReport {
  return { cases: [c] } as unknown as RunReport;
}

test("the same difference after the edit keeps the verdict from before, as carried", () => {
  const before = caseOf([change(["ギフト包装", "する（のし付き）"], []), change(["表示 10:00:01"], ["表示 10:00:02"], true)], verdict);
  const after = caseOf([change(["ギフト包装", "する（のし付き）"], []), change(["表示 10:00:01"], ["表示 10:05:09"], true)], null);
  const [c] = carryVerdicts(report(before), report(after)).cases;
  assert.equal(c.verdict, null, "it is not judged again");
  assert.deepEqual(c.carried, verdict);
});

test("any change in what differs leaves the case unjudged", () => {
  const before = caseOf([change(["在庫切れ"], ["残りわずか"])], verdict);
  for (const changes of [[change(["在庫切れ"], ["在庫あり"])], [change(["在庫切れ"], ["残りわずか"]), change([], ["増えた行"])]]) {
    const [c] = carryVerdicts(report(before), report(caseOf(changes, null))).cases;
    assert.equal(c.carried, undefined);
  }
});

test("nothing is carried to a case that has a verdict now, or had none before", () => {
  const machine: CaseVerdict = { ...verdict, verdict: "harmless", judgedBy: { kind: "machine" } };
  const same = [change(["a"], ["b"])];
  assert.equal(carryVerdicts(report(caseOf(same, verdict)), report(caseOf(same, machine))).cases[0].carried, undefined);
  assert.equal(carryVerdicts(report(caseOf(same, null)), report(caseOf(same, null))).cases[0].carried, undefined);
});

test("the same lines with a run that now ends differently leave the case unjudged", () => {
  const same = [change(["在庫切れ"], ["残りわずか"])];
  const ended = (exitCode: number): CaseReport => ({
    ...caseOf(same, null),
    runs: [
      { slot: "old", outcome: { kind: "exited", exitCode: 0 } },
      { slot: "new", outcome: { kind: "exited", exitCode } },
    ] as CaseReport["runs"],
  });
  const before = { ...ended(0), verdict };
  assert.deepEqual(carryVerdicts(report(before), report(ended(0))).cases[0].carried, verdict);
  assert.equal(carryVerdicts(report(before), report(ended(255))).cases[0].carried, undefined);
});
