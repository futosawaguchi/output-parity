import assert from "node:assert/strict";
import { test } from "node:test";
import { marksOf } from "../lib/case-marks";
import type { CaseReport } from "../lib/pipeline";

// Input C of the estimate: A-101 and A-102 gone after A-100, A-104 gone after A-103.
const c = {
  comparison: {
    kind: "compared",
    new: { lines: ["見積書", "A-100 基本料 15,000", "A-103 部材費 42,000", "合計 72,000"] },
    changes: [
      { oldStart: 2, oldLines: ["A-101 出張費 8,000", "A-102 夜間割増 12,000"], newStart: 2, newLines: [], explainedByBaseline: false },
      { oldStart: 5, oldLines: ["A-104 値引き -5,000"], newStart: 3, newLines: [], explainedByBaseline: false },
      { oldStart: 0, oldLines: ["発行日 2026-11-01"], newStart: 0, newLines: ["発行日 2026-11-02"], explainedByBaseline: true },
    ],
  },
} as unknown as CaseReport;

test("on the old side, the lines that went missing are marked; what the baseline explains is not", () => {
  assert.deepEqual(
    marksOf(c, "old").map((m) => m.text),
    ["A-101 出張費 8,000", "A-102 夜間割増 12,000", "A-104 値引き -5,000"],
  );
});

test("on the new side, each gap is marked under the line before it, with how many lines went", () => {
  assert.deepEqual(marksOf(c, "new"), [
    { kind: "goneAfter", text: "A-100 基本料 15,000", count: 2 },
    { kind: "goneAfter", text: "A-103 部材費 42,000", count: 1 },
  ]);
});
