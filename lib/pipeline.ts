import type Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter } from "./compare/adapters";
import { compareCase, type Comparison } from "./compare/compare-case";
import { naiveDiff, type NaiveDiff } from "./compare/naive";
import { summarizeEnvironments, type EnvironmentSummaries, type ParityConfig } from "./config";
import { judgeByMachine, judgeCase } from "./judge/judge-case";
import type { CauseReport } from "./fix/locate-cause";
import type { FixAttempt } from "./fix/verify";
import type { CaseVerdict } from "./judge/verdict";
import { preflight } from "./runner/preflight";
import { runCase, type CaseResult, type SlotResult } from "./runner/run-case";
import { createRunDir } from "./runner/run-dir";
import { sentRecorder, type SentRecorder } from "./sent-log";
import { prepareWorkspace } from "./workspace";

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
  /** Where in the source the difference comes from; present once someone asked (DESIGN 7-4). */
  cause?: CauseReport;
};

/** Everything about one run, saved as report.json: the record of what was checked and when (DESIGN 4-5). */
export type RunReport = {
  runId: string;
  /** run: executed here / rejudge: the bundled outputs judged again here / bundled: shipped as is. */
  origin: "run" | "rejudge" | "bundled";
  /** The subject the run belongs to (samples/<id>/ or targets/<id>/), so reports of different subjects are never mixed. */
  subjectId: string;
  configName: string;
  configDescription: string;
  environments: EnvironmentSummaries;
  outputFormat: string;
  startedAt: string;
  finishedAt: string;
  cases: CaseReport[];
  /** Set when this report is the run after applying an edit, or the refusal to apply it. */
  fixAttempt?: FixAttempt;
};

export type PipelineOptions = {
  /** Recorded in the report (lib/subject.ts). */
  subjectId: string;
  config: ParityConfig;
  adapter: Adapter;
  /** The program's root for this run: work/ (DESIGN 7-4), or the source itself when fixes is suggest-only. run.cwd is inside it. */
  root: string;
  /** Copy the source into `root` first, for a fresh start. Left out when re-running after an edit. */
  prepare?: boolean;
  runsRoot: string;
  /** Old runs to reuse instead of running the old side again, by case id (after an edit). */
  keepOld?: Map<string, SlotResult>;
  /** Pass a client to judge; null to stop after comparing. The client is created by the caller. */
  client: Anthropic | null;
  onProgress?: (event: ProgressEvent) => void;
};

/** Run → compare → judge, one case at a time. Throws only SetupError (the user's setup is broken). */
export async function runPipeline(opts: PipelineOptions): Promise<RunReport> {
  const { config, adapter, client } = opts;
  const report = (message: string, caseId = "") => opts.onProgress?.({ caseId, message });

  if (opts.prepare) {
    report("work/ を作り直しています");
    await prepareWorkspace(config.source, opts.root, config.workspace.link);
  }
  const cwd = join(opts.root, config.run.cwd);
  await preflight(config, cwd);
  const startedAt = new Date();
  const run = await createRunDir(opts.runsRoot, startedAt);

  const cases: CaseReport[] = [];
  const environments = summarizeEnvironments(config.run.environments);
  const record = sentRecorder(join(opts.runsRoot, "sent"));
  for (const testCase of config.cases) {
    const caseId = testCase.id;
    report(
      opts.keepOld?.has(caseId)
        ? `${environments.new.label} で2回実行しています（${environments.old.label} は当てる前の出力と比べます）`
        : `${environments.old.label} で1回、${environments.new.label} で2回実行しています`,
      caseId,
    );
    const result = await runCase(config, testCase, cwd, join(run.path, caseId), opts.keepOld?.get(caseId));
    cases.push(await checkCase(result, testCase, { adapter, client, environments, record, onProgress: opts.onProgress }));
  }

  const runReport: RunReport = {
    runId: run.id,
    origin: "run",
    subjectId: opts.subjectId,
    configName: config.name,
    configDescription: config.description,
    environments,
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
  environments: EnvironmentSummaries;
  /** Keeps what is sent to Claude (runs/sent/). */
  record: SentRecorder;
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
  const { adapter, client, environments, record } = opts;
  const caseId = result.caseId;
  const report = (message: string) => opts.onProgress?.({ caseId, message });

  report("出力をテキストにして比べています");
  const compared = await compareCase(result, adapter.extract);
  const [oldOut, newOut] = (["old", "new"] as const).map((slot) => result.slots.find((s) => s.slot === slot)?.outputPath);
  const naive = oldOut && newOut ? await naiveDiff(oldOut, newOut) : null;

  // Without Claude, the machine still settles what it can (no difference, no output); the rest
  // stays unjudged rather than guessed.
  let verdict: CaseVerdict | null = await judgeByMachine(compared, { oldLabel: environments.old.label, newLabel: environments.new.label });
  if (client && !verdict) {
    report("Claude が新しい出力の全文を読んで判定しています");
    verdict = await judgeCase(compared, {
      client,
      oldLabel: environments.old.label,
      newLabel: environments.new.label,
      outputDescription: adapter.description,
      record,
    });
  }
  return { caseId, label: about.label, description: about.description, runs: result.slots, comparison: compared.comparison, naive, verdict };
}
