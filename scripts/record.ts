// Writes the record of what was checked (DESIGN 4-5) for a run, as record.md beside its report.
// Usage: npm run record                          the subject's newest run under runs/
//        npm run record -- <run id>              a specific run under runs/
//        npm run record -- --bundled             the bundled run, printed (the bundle is not written to)
//        npm run record -- --bundled-fix         the bundled run after applying its edit, printed
//        npm run record -- --subject <name> ...  a subject other than estimate

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadBundledFix, loadBundledReport } from "../lib/bundled";
import type { RunReport } from "../lib/pipeline";
import { buildRecord } from "../lib/record/build";
import { RUN_ID_PATTERN } from "../lib/runner/run-dir";
import { subjectIdOf } from "../lib/subject";

const root = process.cwd();
const runsRoot = join(root, "runs");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subjectArg = args.indexOf("--subject");
  const subjectId = subjectIdOf(subjectArg === -1 ? undefined : args.splice(subjectArg, 2)[1]);

  if (args.includes("--bundled") || args.includes("--bundled-fix")) {
    const report = args.includes("--bundled-fix") ? await loadBundledFix(root, subjectId) : await loadBundledReport(root, subjectId);
    if (!report) throw new Error(`題材「${subjectId}」に同梱の結果がありません`);
    process.stdout.write(await buildRecord(report, root));
    return;
  }

  const runId = args[0] ?? (await newestRun(subjectId));
  if (!runId || !RUN_ID_PATTERN.test(runId)) {
    throw new Error(`題材「${subjectId}」の実行が runs/ にありません。先に npm run samples -- --subject ${subjectId} で実行してください`);
  }
  const report = JSON.parse(await readFile(join(runsRoot, runId, "report.json"), "utf8")) as RunReport;
  const out = join(runsRoot, runId, "record.md");
  await writeFile(out, await buildRecord(report, root));
  console.log(`runs/${runId}/record.md に書きました`);
}

async function newestRun(subjectId: string): Promise<string | undefined> {
  const ids = (await readdir(runsRoot).catch(() => [])).filter((id) => RUN_ID_PATTERN.test(id)).sort().reverse();
  for (const id of ids) {
    const text = await readFile(join(runsRoot, id, "report.json"), "utf8").catch(() => null);
    if (text && (JSON.parse(text) as RunReport).subjectId === subjectId) return id;
  }
  return undefined;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
