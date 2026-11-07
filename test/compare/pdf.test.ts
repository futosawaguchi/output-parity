import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  const path = fixture("case-c", "old");
  assert.deepEqual(await extractPdf(path), await extractPdf(path));
});

test("Japanese text, page markers and layout are extracted", async () => {
  const doc = await extractPdf(fixture("case-c", "old"));
  assert.ok(doc.lines.includes("--- page 1 ---"));
  assert.ok(doc.lines.includes("A-102 夜間割増 12,000"));
  assert.ok(doc.lines.includes("合計 72,000"));
  assert.equal(doc.pages.length, 1);
  assert.ok(doc.pages[0].charCount > 0);
  assert.deepEqual(doc.unreadable, []);
});

test("sample 1: after the baseline, nothing is left", async () => {
  const { comparison } = await compareCase(caseResult("case-a"), extractPdf);
  assert.equal(comparison.kind, "compared");
  if (comparison.kind !== "compared") return;
  assert.deepEqual(comparison.changes.filter((c) => !c.explainedByBaseline), []);
  assert.ok(comparison.changes.some((c) => c.explainedByBaseline), "the dropped values are kept for display");
});

test("sample 2-b: exactly the three vanished rows are left", async () => {
  const { comparison } = await compareCase(caseResult("case-c"), extractPdf);
  assert.equal(comparison.kind, "compared");
  if (comparison.kind !== "compared") return;
  const kept = comparison.changes.filter((c) => !c.explainedByBaseline);
  assert.deepEqual(kept.flatMap((c) => c.oldLines), ["A-101 出張費 8,000", "A-102 夜間割増 12,000", "A-104 値引き -5,000"]);
  assert.deepEqual(kept.flatMap((c) => c.newLines), []);
});

test("a missing output is reported, not compared", async () => {
  const result = caseResult("case-c");
  result.slots[1].outputPath = null;
  const { comparison } = await compareCase(result, extractPdf);
  assert.deepEqual(comparison, { kind: "missingOutput", missing: ["new"] });
});

test("an unreadable output is reported as such", async () => {
  const result = caseResult("case-c");
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

/** A one-page PDF, 200×200 points, with "Hello" drawn at (x, y). */
function helloPdf(x: number, y: number): string {
  const stream = `BT /F1 12 Tf ${x} ${y} Td (Hello) Tj ET`;
  return pdfOf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]);
}

/** A one-page PDF whose only value is in a text field named total (none of it is in the page's text). */
function formPdf(total: string): string {
  return pdfOf([
    "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] >> >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Annots [4 0 R] >>",
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (total) /V (${total}) /Rect [50 100 150 120] /P 3 0 R >>`,
  ]);
}

/** Objects numbered from 1, the first being the catalog, with a correct cross-reference table. */
function pdfOf(objects: string[]): string {
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  return `${out}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

test("text pushed off the left edge of the paper is a difference", async () => {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  const extract = async (name: string, x: number) => {
    await writeFile(join(dir, name), helloPdf(x, 100));
    return (await extractPdf(join(dir, name))).lines;
  };
  assert.ok(!(await extract("inside.pdf", 50)).includes("layout page 1: 文字が用紙からはみ出している"));
  assert.ok((await extract("left.pdf", -10)).includes("layout page 1: 文字が用紙からはみ出している"));
});

test("a value in a form field is a line, so a changed total in a field is a difference", async () => {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  await writeFile(join(dir, "old.pdf"), formPdf("72000"));
  await writeFile(join(dir, "new.pdf"), formPdf("57000"));
  assert.ok((await extractPdf(join(dir, "old.pdf"))).lines.includes("form total: 72000"));
  assert.ok((await extractPdf(join(dir, "new.pdf"))).lines.includes("form total: 57000"));
});
