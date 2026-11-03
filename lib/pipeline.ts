import type Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AdapterOf } from "./compare/adapters";
import { compareCase, type Comparison } from "./compare/compare-case";
import { naiveDiff, type NaiveDiff } from "./compare/naive";
import { summarizeEnvironments, type CaseOutput, type EnvironmentSummaries, type ParityConfig } from "./config";
import { judgeByMachine, judgeCase } from "./judge/judge-case";
import type { CauseReport } from "./fix/locate-cause";
import type { FixAttempt } from "./fix/verify";
import type { CaseVerdict } from "./judge/verdict";
import { preflight } from "./runner/preflight";
import { collectCase } from "./runner/files";
import { runCase, type CaseResult, type SlotResult } from "./runner/run-case";
import { webRunner } from "./runner/web";
import { createRunDir } from "./runner/run-dir";
import { sentRecorder, type SentRecorder } from "./sent-log";
import { prepareWorkspace } from "./workspace";

export type ProgressEvent = { caseId: string; message: string };

export type CaseReport = {
  caseId: string;
  label: string;
  description: string;
  /** How this case's output was read, when not as the report's outputFormat says (a CSV among pages). */
  output?: CaseOutput;
  runs: SlotResult[];
  comparison: Comparison;
  /** What a plain diff of the raw files says. null when the old or new run produced no output. */
  naive: NaiveDiff | null;
  /** null when the run was made without judging. */
  verdict: CaseVerdict | null;
  /**
   * After an edit (not judged again), the verdict from before the edit when the difference is
   * exactly the same (lib/fix/carry.ts). Shown as that, never as a new verdict.
   */
  carried?: CaseVerdict;
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
  /** The encoding text and HTML outputs were read in. Missing in reports from before it was recorded: utf-8. */
  outputEncoding?: string;
  startedAt: string;
  finishedAt: string;
  cases: CaseReport[];
  /** Set when this report is the run after applying an edit, or the refusal to apply it. */
  fixAttempt?: FixAttempt;
  /**
   * Set when more cases needed Claude than may be sent without asking: none was sent, and these
   * many wait for a person to confirm (judgeWaiting).
   */
  judgeHeld?: { count: number; limit: number };
};

/**
 * How many cases may be sent to Claude for judging in one go before a person is asked. Each case
 * is one call with the whole new output; a system where everything differs would otherwise send
 * every case at once.
 */
export const JUDGE_WITHOUT_ASKING = 10;

export type PipelineOptions = {
  /** Recorded in the report (lib/subject.ts). */
  subjectId: string;
  config: ParityConfig;
  /** The adapter for each case (adaptersFor): a case may be read in its own format. */
  adapters: AdapterOf;
  /** The program's root for this run: work/ (DESIGN 7-4), or the source itself when fixes is suggest-only. run.cwd is inside it. */
  root: string;
  /** Copy the source into `root` first, for a fresh start. Left out when re-running after an edit. */
  prepare?: boolean;
  runsRoot: string;
  /** Old runs to reuse instead of running the old side again, by case id (after an edit). */
  keepOld?: Map<string, SlotResult>;
  /** Pass a client to judge; null to stop after comparing. The client is created by the caller. */
  client: Anthropic | null;
  /** At most this many cases are judged without asking (default JUDGE_WITHOUT_ASKING); null for no limit. */
  judgeLimit?: number | null;
  onProgress?: (event: ProgressEvent) => void;
};

/**
 * Run → compare for every case, then judge the cases the machine could not settle. Throws only
 * SetupError (the user's setup is broken).
 */
export async function runPipeline(opts: PipelineOptions): Promise<RunReport> {
  const { config, adapters, client } = opts;
  const report = (message: string, caseId = "") => opts.onProgress?.({ caseId, message });

  if (opts.prepare) {
    report("work/ を作り直しています");
    await prepareWorkspace(config.source, opts.root, config.workspace.link);
  }
  await preflight(config, opts.root);
  const runSpec = config.run;
  const startedAt = new Date();
  const run = await createRunDir(opts.runsRoot, startedAt);

  const environments = summarizeEnvironments(config.run);
  const checkOpts: CheckOptions = { adapters, client, environments, record: sentRecorder(join(opts.runsRoot, "sent")), onProgress: opts.onProgress };
  const web = runSpec.type === "web" ? webRunner(config, runSpec, opts.root, run.path) : null;
  const verb = web ? "開いています" : "実行しています";
  // Cases may run side by side (run.parallel); the report keeps the order of the settings.
  const checked: Checked[] = new Array(config.cases.length);
  const parallel = runSpec.type === "command" ? runSpec.parallel : 1;
  try {
    await eachWithLimit(config.cases, parallel, async (testCase, index) => {
      const caseId = testCase.id;
      let result: CaseResult;
      if (runSpec.type === "files") {
        report("渡された出力のファイルを写しています", caseId);
        result = await collectCase(config, runSpec, testCase, join(run.path, caseId));
      } else {
        report(
          opts.keepOld?.has(caseId)
            ? `${environments.new.label} で2回${verb}（${environments.old.label} は当てる前の出力と比べます）`
            : `${environments.old.label} で1回、${environments.new.label} で2回${verb}`,
          caseId,
        );
        const caseDir = join(run.path, caseId);
        const keepOld = opts.keepOld?.get(caseId);
        result = web ? await web.runCase(testCase, caseDir, keepOld) : await runCase(config, testCase, join(opts.root, runSpec.cwd), caseDir, keepOld);
      }
      checked[index] = { result, report: await checkCase(result, testCase, { ...checkOpts, client: null }) };
    });
  } finally {
    await web?.stop();
  }
  const { cases, held } = await judgeWaiting(checked, checkOpts, opts.judgeLimit === undefined ? JUDGE_WITHOUT_ASKING : opts.judgeLimit);

  const runReport: RunReport = {
    runId: run.id,
    origin: "run",
    subjectId: opts.subjectId,
    configName: config.name,
    configDescription: config.description,
    environments,
    outputFormat: config.output.format,
    outputEncoding: config.output.encoding,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    cases,
    ...(held ? { judgeHeld: held } : {}),
  };
  await writeFile(join(run.path, "report.json"), JSON.stringify(runReport, null, 2) + "\n");
  report("終わりました");
  return runReport;
}

/**
 * Calls `work` on every item, at most `limit` at a time. After a failure no new item starts (as
 * with one at a time); the ones already running finish, then the first failure is thrown.
 */
export async function eachWithLimit<T>(items: T[], limit: number, work: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const failures: unknown[] = [];
  const worker = async () => {
    while (next < items.length && failures.length === 0) {
      const index = next++;
      await work(items[index], index).catch((e) => failures.push(e));
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failures.length > 0) throw failures[0];
}

/** A case that has run and been compared, with what is needed to judge it later. */
export type Checked = { result: CaseResult; report: CaseReport };

/**
 * Asks Claude about the cases the machine could not settle (DESIGN 7-4e). When there are more
 * than `limit` (null: no limit), none is sent: the count is returned for a person to confirm, and
 * those cases stay unjudged rather than guessed. Without a client nothing is sent either.
 */
export async function judgeWaiting(
  checked: Checked[],
  opts: CheckOptions,
  limit: number | null,
): Promise<{ cases: CaseReport[]; held: RunReport["judgeHeld"] | null }> {
  const waiting = checked.filter((c) => c.report.verdict === null).length;
  if (!opts.client || waiting === 0) return { cases: checked.map((c) => c.report), held: null };
  if (limit !== null && waiting > limit) {
    opts.onProgress?.({ caseId: "", message: `Claude に判定させる入力が ${waiting} 件あるので、送らずに止めました` });
    return { cases: checked.map((c) => c.report), held: { count: waiting, limit } };
  }
  const cases: CaseReport[] = [];
  for (const c of checked) cases.push(c.report.verdict === null ? await checkCase(c.result, c.report, opts) : c.report);
  return { cases, held: null };
}

export type CheckOptions = {
  adapters: AdapterOf;
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
  about: { label: string; description: string; output?: CaseOutput },
  opts: CheckOptions,
): Promise<CaseReport> {
  const { client, environments, record } = opts;
  const caseId = result.caseId;
  const adapter = opts.adapters(caseId);
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
  const output = about.output ? { output: about.output } : {};
  return { caseId, label: about.label, description: about.description, ...output, runs: result.slots, comparison: compared.comparison, naive, verdict };
}
