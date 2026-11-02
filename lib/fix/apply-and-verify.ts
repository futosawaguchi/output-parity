import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter } from "../compare/adapters";
import type { ParityConfig } from "../config";
import { runPipeline, type ProgressEvent, type RunReport } from "../pipeline";
import { prepareWorkspace } from "../workspace";
import { applyEdit } from "./apply-edit";
import { assessFix, type FixAttempt } from "./verify";

export type ApplyOptions = {
  config: ParityConfig;
  adapter: Adapter;
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
  const original: RunReport = { ...(base.fixAttempt?.original ?? base), fixAttempt: undefined };

  // The edit was read from the source that produced this report. A run made here left that source
  // in work/; for the bundled outputs it is the original, so work/ starts from a fresh copy.
  if (base.origin !== "run") {
    say("work/ を作っています");
    await prepareWorkspace(opts.config.source, opts.workDir, opts.config.workspace.link);
  }
  say("直し方を work/ に当てています");
  const applied = await applyEdit(opts.workDir, edit);
  const attempt: FixAttempt = { caseId, edit, applied, original };
  if (applied.kind === "refused") return { ...base, fixAttempt: attempt };

  const after = await runPipeline({
    config: opts.config,
    adapter: opts.adapter,
    root: opts.workDir,
    runsRoot: opts.runsRoot,
    keepOld: new Map(original.cases.flatMap((c) => c.runs.filter((r) => r.slot === "old").map((r) => [c.caseId, r] as const))),
    client: null,
    onProgress: opts.onProgress,
  });
  attempt.verification = assessFix(caseId, base, after);
  // Saved with the edit and the verdict on it: the record of what was applied (DESIGN 4-5), and
  // what npm run bundle ships so the round trip can be seen without PHP.
  const report: RunReport = { ...after, fixAttempt: attempt };
  await writeFile(join(opts.runsRoot, after.runId, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}
