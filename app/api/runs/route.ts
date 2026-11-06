import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { connection } from "next/server";
import { loadBundledFix, loadBundledReport } from "@/lib/bundled";
import { describeScope, whyNotSending } from "@/lib/claude-scope";
import { adaptersForConfig } from "@/lib/compare/adapters";
import { summarizeEnvironments, type ParityConfig } from "@/lib/config";
import { SetupError } from "@/lib/errors";
import { currentJob, runningJob, startJob } from "@/lib/jobs";
import { runPipeline } from "@/lib/pipeline";
import { preflight } from "@/lib/runner/preflight";
import { listSubjects, loadSubject, subjectIdOf, whyNoApplying, type SubjectEntry } from "@/lib/subject";
import { isFromOurPage } from "@/lib/same-origin";
import { NOT_BUNDLED_IN_SHOWCASE, NOT_IN_SHOWCASE, readShowcase } from "@/lib/showcase";
import { alreadyRunning, busyWithAnother, NO_BUNDLE, NO_KEY, notFromOurPage } from "../responses";
import { tally } from "@/app/check/case-order";

// With the other routes that call Claude (rejudge, cause, judge), the only places in the app that read the API key (CLAUDE.md).
// The key never leaves the server: it is not in any response, and errors are reported by type
// with fixed wording.

const root = process.cwd();

/** Starts a run of every case of a subject. Body: { subject }. 202 with a job id, or 409 if one is already running. */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) {
    return notFromOurPage();
  }
  // The showcase runs no programs, whatever is installed (DESIGN 7-2 revised).
  if (readShowcase(process.env)) return Response.json(NOT_IN_SHOWCASE, { status: 400 });
  const subjectId = subjectIdOf(((await request.json().catch(() => ({}))) as { subject?: unknown }).subject);
  let subject, adapters;
  try {
    subject = await loadSubject(root, subjectId);
    adapters = adaptersForConfig(subject.config);
  } catch (e) {
    if (e instanceof SetupError) return Response.json({ message: e.message, nextStep: e.nextStep }, { status: 400 });
    throw e;
  }
  const { config, runRoot } = subject;
  // With claude.send "none" nothing is sent: the run compares, and the machine settles what it can.
  const judging = whyNotSending(config, "judge") === null;
  if (judging && !process.env.ANTHROPIC_API_KEY) {
    return Response.json(NO_KEY, { status: 400 });
  }
  const client = judging ? new Anthropic() : null;

  const result = startJob("run", subjectId, (onProgress) =>
    runPipeline({ subjectId, config, adapters, root: runRoot, prepare: subject.workDir !== null, runsRoot: join(root, "runs"), client, onProgress }),
  );
  if (!result.started) return alreadyRunning(result.running, subjectId);
  return Response.json({ jobId: result.jobId }, { status: 202 });
}

/**
 * For the subject in ?subject= (the default one without it): what will be checked (shown before
 * anything runs), whether it can run or rejudge here, and the job that is running or finished
 * last, so a reloaded page can pick it up again. With no job yet, the bundled run is sent instead,
 * so the page shows a report without PHP or a key (DESIGN 7-2b). Also every subject there is, to
 * choose from. Commands are left out of the target: they are local paths.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const subjectId = subjectIdOf(new URL(request.url).searchParams.get("subject"));
  const job = currentJob(subjectId);
  // A job of another subject holds the programs and work/ until it ends.
  const elsewhere = runningJob();
  const busyElsewhere = elsewhere && elsewhere.subjectId !== subjectId ? busyWithAnother(elsewhere.subjectId) : null;
  let target = null;
  let cannotRun = null;
  let cannotApply = null;
  let cannotRejudge = null;
  let cannotAskClaude = null;
  const bundled = await loadBundledReport(root, subjectId);
  const noKey = process.env.ANTHROPIC_API_KEY ? null : NO_KEY;
  const showcase = readShowcase(process.env) !== null;
  try {
    const subject = await loadSubject(root, subjectId);
    const { config } = subject;
    target = {
      name: config.name,
      description: config.description,
      environments: { old: summarizeEnvironments(config.run).old.label, new: summarizeEnvironments(config.run).new.label },
      cases: config.cases.map((c) => ({ id: c.id, label: c.label, description: c.description })),
      // Shown before anything is pressed (DESIGN 7-4e ④).
      claudeScope: describeScope(config),
    };
    const cannotExecute = showcase ? NOT_IN_SHOWCASE : await whyCannotExecute(config);
    const notJudging = whyNotSending(config, "judge");
    cannotApply = busyElsewhere ?? whyNoApplying(subject) ?? cannotExecute;
    // A run without judging needs no key.
    cannotRun = busyElsewhere ?? cannotExecute ?? (notJudging ? null : noKey);
    // Judging the bundled outputs again needs the key, not PHP.
    cannotRejudge = bundled === null ? (showcase ? NOT_BUNDLED_IN_SHOWCASE : NO_BUNDLE) : (notJudging ?? noKey);
    // Looking for a cause needs the key and the source, not PHP.
    cannotAskClaude = whyNotSending(config, "cause") ?? noKey;
  } catch (e) {
    if (!(e instanceof SetupError)) throw e;
    cannotRun = cannotApply = cannotRejudge = cannotAskClaude = { message: e.message, nextStep: e.nextStep };
  }
  return Response.json({
    subjectId,
    // The page says it is the showcase, and what that means, on every subject.
    showcase,
    subjects: await withLatest(await listSubjects(root)),
    job: job ? { jobId: job.jobId, status: job.status } : null,
    target,
    cannotRun,
    // Applying an edit runs the programs again (PHP needed) but asks no one (no key needed).
    cannotApply,
    cannotRejudge,
    cannotAskClaude,
    bundled: job ? null : bundled,
    // The bundled run after applying the bundled cause's edit: shown instead of running, when this
    // machine cannot run the programs, so the round trip can still be followed (DESIGN 7-2b).
    bundledFix: job ? null : await loadBundledFix(root, subjectId),
  });
}

/**
 * Each subject with the counts of its latest result: the finished job of this server when there is
 * one, the bundled run otherwise, nothing for a subject that has neither (shown as "not run yet").
 */
async function withLatest(subjects: SubjectEntry[]) {
  return Promise.all(
    subjects.map(async (s) => {
      const job = currentJob(s.id);
      const latest = job?.status === "done" ? job.report : await loadBundledReport(root, s.id);
      return { ...s, latest: latest ? tally(latest.cases) : null };
    }),
  );
}

/** The check a run starts with (the programs can be executed), made up front for the page. */
async function whyCannotExecute(config: ParityConfig): Promise<{ message: string; nextStep: string } | null> {
  try {
    await preflight(config, config.source);
  } catch (e) {
    if (e instanceof SetupError) return { message: e.message, nextStep: e.nextStep };
    throw e;
  }
  return null;
}
