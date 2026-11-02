import type Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter } from "./compare/adapters";
import { checkCase, type ProgressEvent, type RunReport } from "./pipeline";
import { createRunDir } from "./runner/run-dir";
import { sentRecorder } from "./sent-log";

export type RejudgeOptions = {
  adapter: Adapter;
  client: Anthropic;
  runsRoot: string;
  onProgress?: (event: ProgressEvent) => void;
};

/**
 * Compares and judges the bundled outputs again, without running any program: anyone with an
 * API key can see Claude judge, even without PHP (DESIGN 7-2b). The steps are the same as in a
 * fresh run (checkCase); only the execution is skipped.
 *
 * The report keeps the bundled run id, because the outputs it shows are the bundled ones.
 * It is recorded under runs/ like any other run.
 */
export async function rejudgeBundled(bundled: RunReport, opts: RejudgeOptions): Promise<RunReport> {
  const startedAt = new Date();
  const run = await createRunDir(opts.runsRoot, startedAt);

  const cases = [];
  for (const c of bundled.cases) {
    cases.push(
      await checkCase({ caseId: c.caseId, slots: c.runs }, c, {
        adapter: opts.adapter,
        client: opts.client,
        environments: bundled.environments,
        record: sentRecorder(join(opts.runsRoot, "sent")),
        onProgress: opts.onProgress,
      }),
    );
  }

  const report: RunReport = { ...bundled, origin: "rejudge", startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), cases };
  await writeFile(join(run.path, "report.json"), JSON.stringify(report, null, 2) + "\n");
  opts.onProgress?.({ caseId: "", message: "終わりました" });
  return report;
}
