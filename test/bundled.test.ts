import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadBundledFix, loadBundledReport } from "../lib/bundled";
import type { RunReport } from "../lib/pipeline";

/** A subject "demo" whose bundle says it came from another subject, with a run after an edit. */
async function setUp() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "output-parity-")));
  const bundled = join(root, "samples", "demo", "bundled");
  await mkdir(join(bundled, "fix"), { recursive: true });
  await writeFile(join(root, "samples", "demo", "parity.config.jsonc"), "{}");
  const run = { slot: "new", outputPath: "case-a/new/output.pdf", stdoutPath: "case-a/new/stdout.txt", stderrPath: "case-a/new/stderr.txt" };
  const report = { runId: "bundled", origin: "run", subjectId: "elsewhere", cases: [{ caseId: "case-a", runs: [run] }] };
  await writeFile(join(bundled, "report.json"), JSON.stringify(report));
  await writeFile(join(bundled, "fix", "report.json"), JSON.stringify({ ...report, runId: "bundled-fix", fixAttempt: { caseId: "case-a" } }));
  return { root, bundled };
}

test("a bundled report belongs to the subject it was found in, with its paths made absolute", async () => {
  const { root, bundled } = await setUp();
  const report = (await loadBundledReport(root, "demo")) as RunReport;
  assert.equal(report.subjectId, "demo");
  assert.equal(report.origin, "bundled");
  assert.equal(report.cases[0].runs[0].outputPath, join(bundled, "case-a/new/output.pdf"));
  assert.equal(await loadBundledReport(root, "other"), null);
});

test("the bundled run after an edit goes back to the bundled report of the same subject", async () => {
  const { root } = await setUp();
  const fix = (await loadBundledFix(root, "demo")) as RunReport;
  assert.equal(fix.subjectId, "demo");
  assert.equal(fix.fixAttempt?.original.runId, "bundled");
  assert.equal(fix.fixAttempt?.original.subjectId, "demo");
});
