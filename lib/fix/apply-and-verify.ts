import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AdapterOf } from "../compare/adapters";
import type { ParityConfig } from "../config";
import { runPipeline, type ProgressEvent, type RunReport } from "../pipeline";
import { prepareWorkspace } from "../workspace";
import { applyEdit } from "./apply-edit";
import { carryVerdicts } from "./carry";
import { assessFix, editsIn, type FixAttempt } from "./verify";

export type ApplyOptions = {
  config: ParityConfig;
  adapters: AdapterOf;
  workDir: string;
  runsRoot: string;
  onProgress?: (event: ProgressEvent) => void;
};

/**
 * Writes one proposed edit into work/ and runs the new side of every case again (DESIGN 7-4): an
 * edit counts as a fix only when the outputs say so. Comparing is enough, so Claude is not called.
 * The old side is not run again: the edit would change it too, and a careless edit (dropping a
 * condition, say) would then make old and new agree while both are wrong. The old output from
 * the original code stays the reference. A refused edit is reported with nothing run.
 */
export async function applyAndVerify(base: RunReport, caseId: string, candidate: number, opts: ApplyOptions): Promise<RunReport> {
  const cause = base.cases.find((c) => c.caseId === caseId)?.cause;
  const edit = cause?.kind === "found" ? cause.candidates[candidate]?.edit : null;
  if (!edit) throw new Error(`no edit ${candidate} for ${caseId}`);
  const say = (message: string) => opts.onProgress?.({ caseId, message });

  // The edit was read from the source that produced this report. A run made here left that source
  // in work/; for the bundled outputs it is the original, so work/ starts from a fresh copy.
  let before = base;
  if (base.origin !== "run") {
    say("work/ を作っています");
    await prepareWorkspace(opts.config.source, opts.workDir, opts.config.workspace.link);
    before = await rebuildBefore(base, opts);
  }
  const original: RunReport = { ...(before.fixAttempt?.original ?? before), fixAttempt: undefined };
  say("コピー（work/）に直しを入れています");
  const applied = await applyEdit(opts.workDir, edit);
  // On a run made here, work/ still holds the edits applied before this one; a bundled report starts from a fresh copy.
  const earlier = base.origin === "run" ? editsIn(base) : [];
  const attempt: FixAttempt = { caseId, edit, applied, original, ...(earlier.length > 0 ? { earlier } : {}) };
  if (applied.kind === "refused") return { ...base, fixAttempt: attempt };

  const rerun = await runPipeline({
    subjectId: base.subjectId,
    config: opts.config,
    adapters: opts.adapters,
    root: opts.workDir,
    runsRoot: opts.runsRoot,
    keepOld: new Map(original.cases.flatMap((c) => c.runs.filter((r) => r.slot === "old").map((r) => [c.caseId, r] as const))),
    client: null,
    onProgress: opts.onProgress,
  });
  const after = carryVerdicts(original, rerun);
  attempt.verification = assessFix(caseId, before, after);
  // Saved with the edit and the verdict on it: the record of what was applied (DESIGN 4-5), and
  // what npm run bundle ships so the round trip can be seen without PHP.
  const report: RunReport = { ...after, fixAttempt: attempt };
  await writeFile(join(opts.runsRoot, after.runId, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

/**
 * The outputs before the edit, made here. The bundled outputs were made on another day, perhaps on
 * another machine: a date the program prints would differ from today's, and after the edit it would
 * read as a difference left over (the baseline sees only two runs a moment apart). So every side
 * runs once here on the original code, keeping the bundled verdicts where the difference is the
 * same, and the causes found (they are about the source, which is the same).
 */
async function rebuildBefore(bundled: RunReport, opts: ApplyOptions): Promise<RunReport> {
  opts.onProgress?.({ caseId: "", message: "当てる前の出力を、この環境で作り直しています（同梱の結果は別の日に作ったため）" });
  const fresh = await runPipeline({
    subjectId: bundled.subjectId,
    config: opts.config,
    adapters: opts.adapters,
    root: opts.workDir,
    runsRoot: opts.runsRoot,
    client: null,
    onProgress: opts.onProgress,
  });
  const causes = new Map(bundled.cases.map((c) => [c.caseId, c.cause]));
  const carried = carryVerdicts(bundled, fresh);
  return { ...carried, cases: carried.cases.map((c) => (causes.get(c.caseId) ? { ...c, cause: causes.get(c.caseId) } : c)) };
}
