import type Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter } from "./compare/adapters";
import { compareCase, type Comparison } from "./compare/compare-case";
import { naiveDiff, type NaiveDiff } from "./compare/naive";
import type { ParityConfig } from "./config";
import { judgeCase } from "./judge/judge-case";
import type { CaseVerdict } from "./judge/verdict";
import { preflight } from "./runner/preflight";
import { runCase, type CaseResult, type SlotResult } from "./runner/run-case";
import { createRunDir } from "./runner/run-dir";

export type ProgressEvent = { caseId: string; message: string };

export type CaseReport = {
  caseId: string;
  label: string;
  description: string;
  runs: SlotResult[];
  comparison: Comparison;
  /** What a plain diff of the raw files says. null when the old or new run produced no output. */
  naive: NaiveDiff | null;
  /** null when the run was made without judging. */
  verdict: CaseVerdict | null;
};

/** Everything about one run, saved as report.json: the record of what was checked and when (DESIGN 4-5). */
export type RunReport = {
  runId: string;
  configName: string;
  configDescription: string;
  environments: ParityConfig["environments"];
  outputFormat: string;
  startedAt: string;
  finishedAt: string;
  cases: CaseReport[];
};

export type PipelineOptions = {
  config: ParityConfig;
  adapter: Adapter;
  /** Directory the programs run in. */
  cwd: string;
  runsRoot: string;
  /** Pass a client to judge; null to stop after comparing. The client is created by the caller. */
  client: Anthropic | null;
  onProgress?: (event: ProgressEvent) => void;
};

/** Run → compare → judge, one case at a time. Throws only SetupError (the user's setup is broken). */
export async function runPipeline(opts: PipelineOptions): Promise<RunReport> {
  const { config, adapter, client } = opts;
  const report = (message: string, caseId = "") => opts.onProgress?.({ caseId, message });

  await preflight(config, opts.cwd);
  const startedAt = new Date();
  const run = await createRunDir(opts.runsRoot, startedAt);

  const cases: CaseReport[] = [];
  for (const testCase of config.cases) {
    const caseId = testCase.id;
    report(`${config.environments.old.label} で1回、${config.environments.new.label} で2回実行しています`, caseId);
    const result = await runCase(config, testCase, opts.cwd, join(run.path, caseId));
    cases.push(await checkCase(result, testCase, { adapter, client, environments: config.environments, onProgress: opts.onProgress }));
  }

  const runReport: RunReport = {
    runId: run.id,
    configName: config.name,
    configDescription: config.description,
    environments: config.environments,
    outputFormat: config.output.format,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    cases,
  };
  await writeFile(join(run.path, "report.json"), JSON.stringify(runReport, null, 2) + "\n");
  report("終わりました");
  return runReport;
}

export type CheckOptions = {
  adapter: Adapter;
  client: Anthropic | null;
  environments: ParityConfig["environments"];
  onProgress?: (event: ProgressEvent) => void;
};

/**
 * Compare → judge for one case whose programs have already run. Shared by a fresh run and by
 * judging the bundled outputs again, so both go through exactly the same steps.
 */
export async function checkCase(
  result: CaseResult,
  about: { label: string; description: string },
  opts: CheckOptions,
): Promise<CaseReport> {
  const { adapter, client, environments } = opts;
  const caseId = result.caseId;
  const report = (message: string) => opts.onProgress?.({ caseId, message });

  report("出力をテキストにして比べています");
  const compared = await compareCase(result, adapter.extract);
  const [oldOut, newOut] = (["old", "new"] as const).map((slot) => result.slots.find((s) => s.slot === slot)?.outputPath);
  const naive = oldOut && newOut ? await naiveDiff(oldOut, newOut) : null;

  let verdict: CaseVerdict | null = null;
  if (client) {
    const needsClaude = compared.comparison.kind === "compared" && compared.comparison.changes.some((c) => !c.explainedByBaseline);
    report(needsClaude ? "Claude が新しい出力の全文を読んで判定しています" : "判定しています");
    verdict = await judgeCase(compared, {
      client,
      oldLabel: environments.old.label,
      newLabel: environments.new.label,
      outputDescription: adapter.description,
    });
  }
  return { caseId, label: about.label, description: about.description, runs: result.slots, comparison: compared.comparison, naive, verdict };
}
