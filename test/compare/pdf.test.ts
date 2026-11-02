import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { compareCase } from "../../lib/compare/compare-case";
import { diffLines } from "../../lib/compare/line-diff";
import { extractPdf } from "../../lib/compare/pdf";
import type { CaseResult, Slot } from "../../lib/runner/run-case";

// Fixtures are real outputs of samples/estimate.php (old = PHP 7.4, new/baseline = PHP 8.5).
const fixture = (caseId: string, slot: Slot) => join(__dirname, "..", "fixtures", caseId, `${slot}.pdf`);

function caseResult(caseId: string): CaseResult {
  const slot = (s: Slot, env: "old" | "new") => ({
    slot: s,
    env,
    command: "php",
    args: [],
    outcome: { kind: "exited" as const, exitCode: 0 },
    durationMs: 0,
    outputPath: fixture(caseId, s),
    stdoutPath: "",
    stderrPath: "",
  });
  return { caseId, slots: [slot("old", "old"), slot("new", "new"), slot("baseline", "new")] };
}

test("extracting the same PDF twice gives identical results", async () => {
  const path = fixture("2b-fatal", "old");
  assert.deepEqual(await extractPdf(path), await extractPdf(path));
});

test("Japanese text, page markers and layout are extracted", async () => {
  const doc = await extractPdf(fixture("2b-fatal", "old"));
  assert.ok(doc.lines.includes("--- page 1 ---"));
  assert.ok(doc.lines.includes("A-102 夜間割増 12,000"));
  assert.ok(doc.lines.includes("合計 72,000"));
  assert.equal(doc.pages.length, 1);
  assert.ok(doc.pages[0].charCount > 0);
  assert.deepEqual(doc.unreadable, []);
});

test("sample 1: after the baseline, nothing is left", async () => {
  const { comparison } = await compareCase(caseResult("1-harmless"), extractPdf);
  assert.equal(comparison.kind, "compared");
  if (comparison.kind !== "compared") return;
  assert.deepEqual(comparison.changes.filter((c) => !c.explainedByBaseline), []);
  assert.ok(comparison.changes.some((c) => c.explainedByBaseline), "the dropped values are kept for display");
});

test("sample 2-b: exactly the three vanished rows are left", async () => {
  const { comparison } = await compareCase(caseResult("2b-fatal"), extractPdf);
  assert.equal(comparison.kind, "compared");
  if (comparison.kind !== "compared") return;
  const kept = comparison.changes.filter((c) => !c.explainedByBaseline);
  assert.deepEqual(kept.flatMap((c) => c.oldLines), ["A-101 出張費 8,000", "A-102 夜間割増 12,000", "A-104 値引き -5,000"]);
  assert.deepEqual(kept.flatMap((c) => c.newLines), []);
});

test("a missing output is reported, not compared", async () => {
  const result = caseResult("2b-fatal");
  result.slots[1].outputPath = null;
  const { comparison } = await compareCase(result, extractPdf);
  assert.deepEqual(comparison, { kind: "missingOutput", missing: ["new"] });
});

test("an unreadable output is reported as such", async () => {
  const result = caseResult("2b-fatal");
  result.slots[1].outputPath = __filename; // a file that is not a PDF
  const { comparison } = await compareCase(result, extractPdf);
  assert.equal(comparison.kind, "unreadable");
});

test("an image that disappears is a difference, even when the text is the same", async () => {
  const withImage = await extractPdf(join(__dirname, "..", "fixtures", "image", "with.pdf"));
  const without = await extractPdf(join(__dirname, "..", "fixtures", "image", "without.pdf"));
  const changed = diffLines(withImage.lines, without.lines).flatMap((h) => [...h.oldLines, ...h.newLines]);
  assert.ok(changed.includes("layout page 1: 用紙 595.3×841.9・画像 1 個"));
  assert.ok(changed.includes("layout page 1: 用紙 595.3×841.9・画像 0 個"));
});
