import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Change } from "../../lib/compare/baseline";
import type { CaseVerdict } from "../../lib/judge/verdict";
import type { CaseReport, RunReport } from "../../lib/pipeline";
import { buildRecord } from "../../lib/record/build";
import { renderRecord } from "../../lib/record/render";
import type { SlotResult } from "../../lib/runner/run-case";

// The record of what was checked (DESIGN 4-5): every case, where the outputs came from, and what
// it cannot say. A record that drops an unjudged case, or reads as a guarantee, is worse than none.

const doc = { lines: [], pages: [], unreadable: [] };

function slot(caseId: string, s: "old" | "new", stderrPath = "/nowhere"): SlotResult {
  return {
    slot: s,
    env: s,
    command: "php",
    args: ["app.php", `data/${caseId}.json`, `runs/2026-11-03_10-00-00-abcd/${caseId}/${s}/output.pdf`],
    outcome: { kind: "exited", exitCode: 0 },
    durationMs: 1,
    outputPath: null,
    stdoutPath: "/nowhere",
    stderrPath,
  };
}

function caseOf(caseId: string, changes: Change[], verdict: CaseVerdict | null, extra: Partial<CaseReport> = {}): CaseReport {
  return {
    caseId,
    label: `入力 ${caseId}`,
    description: "説明",
    runs: [slot(caseId, "old"), slot(caseId, "new")],
    comparison: { kind: "compared", old: doc, new: doc, baseline: { kind: "used" }, changes },
    naive: null,
    verdict,
    ...extra,
  };
}

const date: Change = { oldStart: 0, oldLines: ["発行 10:00:01"], newStart: 0, newLines: ["発行 10:00:02"], explainedByBaseline: true };
const lost: Change = { oldStart: 1, oldLines: ["ギフト包装 | する"], newStart: 1, newLines: [], explainedByBaseline: false };
const harmless: CaseVerdict = { caseId: "a", verdict: "harmless", summary: "違いはありません", findings: [], judgedBy: { kind: "machine" } };
const broken: CaseVerdict = { caseId: "b", verdict: "broken", summary: "行が消えた", findings: [], judgedBy: { kind: "claude", model: "claude-opus-5-5" } };

function reportOf(cases: CaseReport[], extra: Partial<RunReport> = {}): RunReport {
  return {
    runId: "2026-11-03_10-00-00-abcd",
    origin: "run",
    subjectId: "demo",
    configName: "題材",
    configDescription: "説明",
    environments: { old: { label: "PHP 7.4", command: "php7" }, new: { label: "PHP 8.5", command: "php8" } },
    outputFormat: "pdf",
    startedAt: "2026-11-03T01:00:00.000Z",
    finishedAt: "2026-11-03T01:01:00.000Z",
    cases,
    ...extra,
  };
}

const opts = { createdAt: new Date("2026-11-03T02:00:00.000Z"), deprecations: [] };

test("every case is in the record, the unjudged ones too, and the conclusion does not let it through", () => {
  const md = renderRecord(reportOf([caseOf("a", [date], harmless), caseOf("b", [lost], broken), caseOf("c", [lost], null)], { judgeHeld: { count: 11, limit: 10 } }), opts);
  for (const label of ["入力 a", "入力 b", "入力 c"]) assert.match(md, new RegExp(`\\| ${label} /`));
  assert.match(md, /3 件: 壊れている 1・未判定 1・無害 1（うち差なし 1）/);
  assert.match(md, /このままでは移せません。\*\* 壊れている 1 件・未判定 1 件を先に見てください/);
  assert.match(md, /未判定（Claude に送る件数が多いので、送る前に止めた）/);
  assert.match(md, /壊れている（Claude claude-opus-5-5）/);
});

test("only when every case is harmless does it say the outputs were confirmed", () => {
  const md = renderRecord(reportOf([caseOf("a", [date], harmless)]), opts);
  assert.match(md, /試した入力では、旧と新の出力は同じか、違いは無害だと確かめました/);
});

test("a verdict carried over an edit is said to be the one from before, not a new one", () => {
  const md = renderRecord(reportOf([caseOf("b", [lost], null, { carried: broken })]), opts);
  assert.match(md, /壊れている（当てる前の判定。差は当てる前と同じで、判定し直していない）/);
});

test("it says where the outputs came from, and what it cannot say", () => {
  const bundled = renderRecord(reportOf([caseOf("a", [date], harmless)], { origin: "bundled" }), opts);
  assert.match(bundled, /この手元では実行も判定もしていません/);
  const rejudged = renderRecord(reportOf([caseOf("a", [date], harmless)], { origin: "rejudge" }), opts);
  assert.match(rejudged, /この手元では実行していません。判定だけを/);
  for (const md of [bundled, rejudged]) {
    assert.match(md, /試していない入力については、何も言えません/);
    assert.match(md, /本番で保証したことにはなりません/);
  }
});

test("the dropped difference is shown by example, the run's output path is not an input, and | does not break the table", () => {
  const md = renderRecord(reportOf([caseOf("a", [date, lost], broken)]), opts);
  assert.match(md, /1 か所（例: 「発行 10:00:01」→「発行 10:00:02」）/);
  assert.match(md, /`app\.php data\/a\.json \{出力\}`/);
  assert.doesNotMatch(md, /runs\/2026-11-03/);
});

test("the built record has no local path and no secret, and counts the deprecations of the new runs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "record-"));
  await writeFile(join(dir, "old.txt"), "");
  await writeFile(join(dir, "new.txt"), `PHP Deprecated:  f() is deprecated in ${dir}/lib/x.php on line 3\n`);
  const c = caseOf("a", [date], harmless, { runs: [slot("a", "old", join(dir, "old.txt")), slot("a", "new", join(dir, "new.txt"))] });
  const key = "AKIA" + "ABCDEFGHIJKLMNOP";
  const report = reportOf([c], { configDescription: `${homedir()}/secret-place で、鍵 ${key} を使って動く` });
  const md = await buildRecord(report, dir);
  assert.doesNotMatch(md, new RegExp(homedir().replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")));
  assert.ok(!md.includes(key));
  assert.match(md, /~\/secret-place/);
  assert.match(md, /1 種類（1 件の入力で）: x\.php 1/);
  assert.match(md, /in lib\/x\.php on line 3/);
  assert.match(md, /値 1 個を \*\*\* にしました/);
});

test("after an edit, what was sent before it is still listed, once, as before the edit", () => {
  const judgeSent = { purpose: "judge" as const, at: "", file: "j.txt", chars: 100, masked: 0, maskedKinds: [] };
  const causeSent = { purpose: "cause" as const, at: "", file: "c.txt", chars: 50, masked: 0, maskedKinds: [] };
  const before = reportOf([caseOf("b", [lost], { ...broken, sent: judgeSent }, { cause: { kind: "failed", reason: "r", nextStep: "n", sent: causeSent } })]);
  const after = reportOf([caseOf("b", [lost], null, { carried: { ...broken, sent: judgeSent } })], {
    fixAttempt: { caseId: "b", edit: { file: "app.php", oldText: "a", newText: "b" }, applied: { kind: "applied", file: "app.php", line: 3 }, original: before },
  });
  const md = renderRecord(after, opts);
  assert.match(md, /2 回・合わせて 150 字/);
  assert.match(md, /入力 b・判定（当てる前）: 100 字（j\.txt）/);
  assert.match(md, /入力 b・原因探し（当てる前）: 50 字（c\.txt）/);
});
