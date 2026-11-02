// Copies one finished run into samples/<subject>/bundled/, the run that ships with the repository
// so that the report can be seen without PHP, composer or an API key (DESIGN 7-2b).
// Usage: npm run bundle                          the newest run in which every case was judged
//        npm run bundle -- <run id>              a specific run under runs/
// When an edit was applied to that run's report (the "apply and check" button), the newest such
// run is shipped too, in bundled/fix/.
//        npm run bundle -- --subject <name> ...  a subject other than estimate
//
// Paths are rewritten relative to the bundle, and the result is checked for the home directory:
// the bundle is committed to a public repository.

import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { BUNDLED_FIX_DIR, BUNDLED_FIX_RUN_ID, BUNDLED_RUN_ID, bundledDir } from "../lib/bundled";
import type { FixAttempt } from "../lib/fix/verify";
import type { RunReport } from "../lib/pipeline";
import { RUN_ID_PATTERN } from "../lib/runner/run-dir";

const root = process.cwd();
const runsRoot = join(root, "runs");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subjectArg = args.indexOf("--subject");
  const subjectId = subjectArg === -1 ? undefined : args.splice(subjectArg, 2)[1];
  const outDir = await bundledDir(root, subjectId);
  if (!outDir) throw new Error(`題材「${subjectId}」の設定が見つかりません`);
  const runId = args[0] ?? (await newestJudgedRun());
  if (!runId) throw new Error("判定まで済んだ実行が runs/ にありません。先に npm run samples -- --judge を実行してください");
  if (!RUN_ID_PATTERN.test(runId)) throw new Error(`実行の ID の形ではありません: ${runId}`);
  const report = await readReport(runId);
  // The run after an edit to this one, if one was made: shipped too, so the round trip can be seen.
  const fixId = await newestFixOf(runId);

  await rm(outDir, { recursive: true, force: true });
  await bundle(runId, report, outDir, BUNDLED_RUN_ID);
  if (fixId) {
    const fix = await readReport(fixId);
    // The report to go back to is the bundled one; the loader puts it back (lib/bundled.ts).
    const attempt: Partial<FixAttempt> = { ...fix.fixAttempt };
    delete attempt.original;
    await bundle(fixId, { ...fix, fixAttempt: attempt as FixAttempt }, join(outDir, BUNDLED_FIX_DIR), BUNDLED_FIX_RUN_ID);
  }

  await assertNoHomeDirectory(outDir);
  const verdicts = report.cases.map((c) => `${c.caseId}: ${c.verdict?.verdict ?? "判定なし"}${c.cause ? "・原因あり" : ""}`).join("・");
  console.log(`${runId} を ${outDir.slice(root.length + 1)}/ に写しました（${verdicts}）`);
  if (fixId) console.log(`直し方を当てたあとの ${fixId} も ${BUNDLED_FIX_DIR}/ に写しました（${(await readReport(fixId)).fixAttempt?.verification?.outcome}）`);
}

async function readReport(runId: string): Promise<RunReport> {
  return JSON.parse(await readFile(join(runsRoot, runId, "report.json"), "utf8")) as RunReport;
}

/** Copies the outputs and stderr/stdout of one run into `to`, with paths relative to it. */
async function bundle(runId: string, report: RunReport, to: string, asRunId: string): Promise<void> {
  const runDir = join(runsRoot, runId);
  // Inside the run → relative to the bundle; anywhere else in the repository → relative to it.
  const strip = (s: string) => s.split(runDir + sep).join("").split(root + sep).join("");
  for (const c of report.cases) {
    for (const r of c.runs) {
      const from = join(runDir, c.caseId, r.slot);
      const dest = join(to, c.caseId, r.slot);
      await mkdir(dest, { recursive: true });
      if (r.outputPath) await copyFile(r.outputPath, join(dest, r.outputPath.slice(from.length + 1)));
      for (const name of ["stdout.txt", "stderr.txt"]) {
        await writeFile(join(dest, name), strip(await readFile(join(from, name), "utf8")));
      }
    }
  }
  const bundled: RunReport = { ...mapStrings(report, strip), runId: asRunId };
  await writeFile(join(to, "report.json"), JSON.stringify(bundled, null, 2) + "\n");
}

/** The newest run made by applying an edit to `runId`'s report that was applied and ran. */
async function newestFixOf(runId: string): Promise<string | undefined> {
  for (const id of await runIdsNewestFirst()) {
    const text = await readFile(join(runsRoot, id, "report.json"), "utf8").catch(() => null);
    const fix = text ? (JSON.parse(text) as RunReport).fixAttempt : undefined;
    if (fix?.verification && fix.original.runId === runId) return id;
  }
  return undefined;
}

async function runIdsNewestFirst(): Promise<string[]> {
  return (await readdir(runsRoot).catch(() => [])).filter((id) => RUN_ID_PATTERN.test(id)).sort().reverse();
}

async function newestJudgedRun(): Promise<string | undefined> {
  for (const id of await runIdsNewestFirst()) {
    const text = await readFile(join(runsRoot, id, "report.json"), "utf8").catch(() => null);
    if (text && (JSON.parse(text) as RunReport).cases.every((c) => c.verdict !== null)) return id;
  }
  return undefined;
}

function mapStrings<T>(value: T, f: (s: string) => string): T {
  if (typeof value === "string") return f(value) as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, f)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, f)])) as T;
  }
  return value;
}

async function assertNoHomeDirectory(dir: string): Promise<void> {
  const files = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
  for (const f of files) {
    const path = join(f.parentPath, f.name);
    if ((await readFile(path)).includes(homedir())) {
      throw new Error(`ホームディレクトリのパスが残っています: ${path.slice(root.length + 1)}`);
    }
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
