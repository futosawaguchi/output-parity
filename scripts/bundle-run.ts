// Copies one finished run into samples/bundled/, the run that ships with the repository so that
// the report can be seen without PHP, composer or an API key (DESIGN 7-2b).
// Usage: npm run bundle                   the newest run in which every case was judged
//        npm run bundle -- <run id>       a specific run under runs/
//
// Paths are rewritten relative to the bundle, and the result is checked for the home directory:
// the bundle is committed to a public repository.

import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { BUNDLED_RUN_ID, bundledDir } from "../lib/bundled";
import type { RunReport } from "../lib/pipeline";
import { RUN_ID_PATTERN } from "../lib/runner/run-dir";

const root = process.cwd();
const runsRoot = join(root, "runs");
const outDir = bundledDir(root);

async function main(): Promise<void> {
  const runId = process.argv[2] ?? (await newestJudgedRun());
  if (!runId) throw new Error("判定まで済んだ実行が runs/ にありません。先に npm run samples -- --judge を実行してください");
  if (!RUN_ID_PATTERN.test(runId)) throw new Error(`実行の ID の形ではありません: ${runId}`);
  const runDir = join(runsRoot, runId);
  const report = JSON.parse(await readFile(join(runDir, "report.json"), "utf8")) as RunReport;

  // Inside the run → relative to the bundle; anywhere else in the repository → relative to it.
  const strip = (s: string) => s.split(runDir + sep).join("").split(root + sep).join("");

  await rm(outDir, { recursive: true, force: true });
  for (const c of report.cases) {
    for (const r of c.runs) {
      const from = join(runDir, c.caseId, r.slot);
      const to = join(outDir, c.caseId, r.slot);
      await mkdir(to, { recursive: true });
      if (r.outputPath) await copyFile(r.outputPath, join(to, r.outputPath.slice(from.length + 1)));
      for (const name of ["stdout.txt", "stderr.txt"]) {
        await writeFile(join(to, name), strip(await readFile(join(from, name), "utf8")));
      }
    }
  }
  const bundled: RunReport = { ...mapStrings(report, strip), runId: BUNDLED_RUN_ID };
  await writeFile(join(outDir, "report.json"), JSON.stringify(bundled, null, 2) + "\n");

  await assertNoHomeDirectory(outDir);
  console.log(`${runId} を samples/bundled/ に写しました（${report.cases.map((c) => `${c.caseId}: ${c.verdict?.verdict ?? "判定なし"}`).join("・")}）`);
}

async function newestJudgedRun(): Promise<string | undefined> {
  const ids = (await readdir(runsRoot).catch(() => [])).filter((id) => RUN_ID_PATTERN.test(id)).sort().reverse();
  for (const id of ids) {
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
