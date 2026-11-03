import assert from "node:assert/strict";
import { test } from "node:test";
import { followProgress } from "../app/check/progress-squares";
import { CASE_CHECKED, CASE_JUDGING } from "../lib/progress";

const cases = [
  { id: "a", label: "入力 A" },
  { id: "b", label: "入力 B" },
  { id: "c", label: "入力 C" },
];

test("while running and comparing: the count of compared inputs, squares in their verdict's colour or waiting for Claude", () => {
  const { squares, compared, judging } = followProgress(cases, [
    { caseId: "a", message: "PHP 7.4 で1回、PHP 8.5 で2回実行しています" },
    { caseId: "a", message: CASE_CHECKED, verdict: "harmless" },
    { caseId: "b", message: "PHP 7.4 で1回、PHP 8.5 で2回実行しています" },
    { caseId: "b", message: CASE_CHECKED, verdict: null },
    { caseId: "c", message: "PHP 7.4 で1回、PHP 8.5 で2回実行しています" },
  ]);
  assert.equal(compared, 2);
  assert.equal(judging, null);
  assert.deepEqual(
    squares.map((s) => s.state),
    ["harmless", "unjudged", "working"],
  );
});

test("once Claude judges, the second count goes up from zero and the first one does not go back", () => {
  const progress = [
    { caseId: "a", message: CASE_CHECKED, verdict: "harmless" as const },
    { caseId: "b", message: CASE_CHECKED, verdict: null },
    { caseId: "c", message: CASE_CHECKED, verdict: null },
    { caseId: "", message: "機械で決まらなかった 2 件を、Claude が1件ずつ判定します", judging: 2 },
    { caseId: "b", message: CASE_JUDGING },
  ];
  const during = followProgress(cases, progress);
  assert.deepEqual([during.compared, during.judging, during.judged], [3, 2, 0]);
  assert.equal(during.squares[1].state, "working");

  const after = followProgress(cases, [...progress, { caseId: "b", message: CASE_CHECKED, verdict: "broken" }]);
  assert.deepEqual([after.compared, after.judging, after.judged], [3, 2, 1]);
  assert.deepEqual(
    after.squares.map((s) => s.state),
    ["harmless", "broken", "unjudged"],
  );
});
