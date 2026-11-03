import type Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AdapterOf } from "./compare/adapters";
import { checkCase, JUDGE_WITHOUT_ASKING, judgeWaiting, type CheckOptions, type Checked, type ProgressEvent, type RunReport } from "./pipeline";
import { createRunDir } from "./runner/run-dir";
import { sentRecorder } from "./sent-log";

export type RejudgeOptions = {
  adapters: AdapterOf;
  client: Anthropic;
  runsRoot: string;
  onProgress?: (event: ProgressEvent) => void;
};

/**
 * Compares and judges the bundled outputs again, without running any program: anyone with an
 * API key can see Claude judge, even without PHP (DESIGN 7-2b). The steps are the same as in a
 * fresh run (checkCase, then judgeWaiting with the same limit); only the execution is skipped.
 *
 * The report keeps the bundled run id, because the outputs it shows are the bundled ones.
 * It is recorded under runs/ like any other run.
 */
export async function rejudgeBundled(bundled: RunReport, opts: RejudgeOptions): Promise<RunReport> {
  const startedAt = new Date();
  const checkOpts = optionsFor(bundled, opts);
  const checked: Checked[] = [];
  for (const c of bundled.cases) {
    const result = { caseId: c.caseId, slots: c.runs };
    checked.push({ result, report: await checkCase(result, c, { ...checkOpts, client: null }) });
  }
  const { cases, held } = await judgeWaiting(checked, checkOpts, JUDGE_WITHOUT_ASKING);

  const report: RunReport = { ...bundled, origin: "rejudge", startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), cases };
  delete report.judgeHeld;
  if (held) report.judgeHeld = held;
  await save(report, opts.runsRoot);
  opts.onProgress?.({ caseId: "", message: "終わりました" });
  return report;
}

/**
 * Judges the cases a run held back because there were more than may be sent without asking:
 * a person saw the count and pressed the button. Nothing runs again; the outputs are the run's.
 */
export async function judgeHeldCases(held: RunReport, opts: RejudgeOptions): Promise<RunReport> {
  const checked = held.cases.map((c) => ({ result: { caseId: c.caseId, slots: c.runs }, report: c }));
  const { cases } = await judgeWaiting(checked, optionsFor(held, opts), null);
  const report: RunReport = { ...held, finishedAt: new Date().toISOString(), cases };
  delete report.judgeHeld;
  await save(report, opts.runsRoot);
  opts.onProgress?.({ caseId: "", message: "終わりました" });
  return report;
}

function optionsFor(report: RunReport, opts: RejudgeOptions): CheckOptions {
  return {
    adapters: opts.adapters,
    client: opts.client,
    environments: report.environments,
    record: sentRecorder(join(opts.runsRoot, "sent")),
    onProgress: opts.onProgress,
  };
}

/** A run's report goes back into its own folder, beside its outputs; any other gets a folder of its own. */
async function save(report: RunReport, runsRoot: string): Promise<void> {
  const dir = report.origin === "run" ? join(runsRoot, report.runId) : (await createRunDir(runsRoot, new Date())).path;
  await writeFile(join(dir, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
