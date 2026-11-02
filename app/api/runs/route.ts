import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { connection } from "next/server";
import { loadBundledFix, loadBundledReport } from "@/lib/bundled";
import { adapterFor } from "@/lib/compare/adapters";
import type { ParityConfig } from "@/lib/config";
import { SetupError } from "@/lib/errors";
import { currentJob, startJob } from "@/lib/jobs";
import { runPipeline } from "@/lib/pipeline";
import { preflight } from "@/lib/runner/preflight";
import { loadSubject, whyNoApplying } from "@/lib/subject";
import { isFromOurPage } from "@/lib/same-origin";
import { alreadyRunning, NO_BUNDLE, NO_KEY, notFromOurPage } from "../responses";

// Together with app/api/rejudge/, the only places in the app that read the API key (CLAUDE.md).
// The key never leaves the server: it is not in any response, and errors are reported by type
// with fixed wording.

const root = process.cwd();

/** Starts a run of every sample case. 202 with a job id, or 409 if one is already running. */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) {
    return notFromOurPage();
  }
  let subject, adapter;
  try {
    subject = await loadSubject(root);
    adapter = adapterFor(subject.config.output.format);
  } catch (e) {
    if (e instanceof SetupError) return Response.json({ message: e.message, nextStep: e.nextStep }, { status: 400 });
    throw e;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(NO_KEY, { status: 400 });
  }
  const client = new Anthropic();
  const { config, runRoot } = subject;

  const result = startJob("run", (onProgress) =>
    runPipeline({ config, adapter, root: runRoot, prepare: subject.workDir !== null, runsRoot: join(root, "runs"), client, onProgress }),
  );
  if (!result.started) return alreadyRunning(result.runningJobId);
  return Response.json({ jobId: result.jobId }, { status: 202 });
}

/**
 * What will be checked (shown before anything runs), whether it can run or rejudge here, and
 * the job that is running or finished last, so a reloaded page can pick it up again. With no job
 * yet, the bundled run is sent instead, so the page shows a report without PHP or a key (DESIGN 7-2b).
 * Commands are left out of the target: they are local paths.
 */
export async function GET(): Promise<Response> {
  await connection();
  const job = currentJob();
  let target = null;
  let cannotRun = null;
  let cannotApply = null;
  const bundled = await loadBundledReport(root);
  try {
    const subject = await loadSubject(root);
    const { config } = subject;
    target = {
      name: config.name,
      description: config.description,
      environments: { old: config.run.environments.old.label, new: config.run.environments.new.label },
      cases: config.cases.map((c) => ({ id: c.id, label: c.label, description: c.description })),
    };
    const cannotExecute = await whyCannotExecute(config);
    cannotApply = whyNoApplying(subject) ?? cannotExecute;
    cannotRun = cannotExecute ?? (process.env.ANTHROPIC_API_KEY ? null : NO_KEY);
  } catch (e) {
    if (!(e instanceof SetupError)) throw e;
    cannotRun = cannotApply = { message: e.message, nextStep: e.nextStep };
  }
  return Response.json({
    job: job ? { jobId: job.jobId, status: job.status } : null,
    target,
    cannotRun,
    // Applying an edit runs the programs again (PHP needed) but asks no one (no key needed).
    cannotApply,
    // Judging the bundled outputs again needs the key, not PHP.
    cannotRejudge: bundled === null ? NO_BUNDLE : process.env.ANTHROPIC_API_KEY ? null : NO_KEY,
    // Looking for a cause needs the key and the source, not PHP.
    cannotAskClaude: process.env.ANTHROPIC_API_KEY ? null : NO_KEY,
    bundled: job ? null : bundled,
    // The bundled run after applying the bundled cause's edit: shown instead of running, when this
    // machine cannot run the programs, so the round trip can still be followed (DESIGN 7-2b).
    bundledFix: job ? null : await loadBundledFix(root),
  });
}

/** The check a run starts with (the programs can be executed), made up front for the page. */
async function whyCannotExecute(config: ParityConfig): Promise<{ message: string; nextStep: string } | null> {
  try {
    await preflight(config, join(config.source, config.run.cwd));
  } catch (e) {
    if (e instanceof SetupError) return { message: e.message, nextStep: e.nextStep };
    throw e;
  }
  return null;
}
