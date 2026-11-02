import type Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProgressEvent, RunReport } from "../pipeline";
import { locateCause } from "./locate-cause";
import type { ReadScope } from "./read-scope";

export type AddCauseOptions = {
  /** What Claude may read: work/ for a run made here, the original for the bundled outputs. */
  scope: ReadScope;
  runsRoot: string;
  onProgress?: (event: ProgressEvent) => void;
};

/** The same report with the cause of one case added. A run made here is saved again with it. */
export async function addCause(base: RunReport, caseId: string, client: Anthropic, opts: AddCauseOptions): Promise<RunReport> {
  const target = base.cases.find((c) => c.caseId === caseId);
  if (!target) throw new Error(`no case ${caseId} in the report`);
  const cause = await locateCause(client, target, { scope: opts.scope, environments: base.environments, onProgress: opts.onProgress });
  const report: RunReport = { ...base, cases: base.cases.map((c) => (c.caseId === caseId ? { ...c, cause } : c)) };
  if (report.origin === "run") {
    await writeFile(join(opts.runsRoot, report.runId, "report.json"), JSON.stringify(report, null, 2) + "\n");
  }
  opts.onProgress?.({ caseId, message: "終わりました" });
  return report;
}
