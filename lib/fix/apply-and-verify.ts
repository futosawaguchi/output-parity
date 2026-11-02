import type { Adapter } from "../compare/adapters";
import type { ParityConfig } from "../config";
import { runPipeline, type ProgressEvent, type RunReport } from "../pipeline";
import { prepareWorkspace } from "../workspace";
import { applyEdit } from "./apply-edit";
import { assessFix, type FixAttempt } from "./verify";

export type ApplyOptions = {
  config: ParityConfig;
  adapter: Adapter;
  samplesDir: string;
  workDir: string;
  runsRoot: string;
  onProgress?: (event: ProgressEvent) => void;
};

/**
 * Writes one proposed edit into work/ and runs every case again (DESIGN 7-4): an edit counts as a
 * fix only when the outputs say so. Comparing is enough to decide that, so Claude is not called.
 * A refused edit is reported on the report it was taken from, with nothing run.
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
    await prepareWorkspace(opts.samplesDir, opts.workDir);
  }
  say("直し方を work/ に当てています");
  const applied = await applyEdit(opts.workDir, edit);
  const attempt: FixAttempt = { caseId, edit, applied, original };
  if (applied.kind === "refused") return { ...base, fixAttempt: attempt };

  const after = await runPipeline({
    config: opts.config,
    adapter: opts.adapter,
    cwd: opts.workDir,
    runsRoot: opts.runsRoot,
    client: null,
    onProgress: opts.onProgress,
  });
  attempt.verification = assessFix(caseId, base, after);
  return { ...after, fixAttempt: attempt };
}
