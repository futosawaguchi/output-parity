import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { connection } from "next/server";
import { loadBundledReport } from "@/lib/bundled";
import { adapterFor } from "@/lib/compare/adapters";
import { loadConfig, type ParityConfig } from "@/lib/config";
import { SetupError } from "@/lib/errors";
import { currentJob, startJob } from "@/lib/jobs";
import { runPipeline } from "@/lib/pipeline";
import { preflight } from "@/lib/runner/preflight";
import { isFromOurPage } from "@/lib/same-origin";
import { alreadyRunning, NO_BUNDLE, NO_KEY, notFromOurPage } from "../responses";

// Together with app/api/rejudge/, the only places in the app that read the API key (CLAUDE.md).
// The key never leaves the server: it is not in any response, and errors are reported by type
// with fixed wording.

const root = process.cwd();
const samplesDir = join(root, "samples");
const workDir = join(root, "work");

/** Starts a run of every sample case. 202 with a job id, or 409 if one is already running. */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) {
    return notFromOurPage();
  }
  let config, adapter;
  try {
    config = await loadConfig(join(samplesDir, "parity.config.json"));
    adapter = adapterFor(config.output.format);
  } catch (e) {
    if (e instanceof SetupError) return Response.json({ message: e.message, nextStep: e.nextStep }, { status: 400 });
    throw e;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(NO_KEY, { status: 400 });
  }
  const client = new Anthropic();

  const result = startJob("run", (onProgress) =>
    runPipeline({ config, adapter, cwd: workDir, prepareFrom: samplesDir, runsRoot: join(root, "runs"), client, onProgress }),
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
  const bundled = await loadBundledReport(root);
  try {
    const config = await loadConfig(join(samplesDir, "parity.config.json"));
    target = {
      name: config.name,
      description: config.description,
      environments: { old: config.environments.old.label, new: config.environments.new.label },
      cases: config.cases.map((c) => ({ id: c.id, label: c.label, description: c.description })),
    };
    cannotRun = await whyCannotRun(config);
  } catch (e) {
    if (!(e instanceof SetupError)) throw e;
    cannotRun = { message: e.message, nextStep: e.nextStep };
  }
  return Response.json({
    job: job ? { jobId: job.jobId, status: job.status } : null,
    target,
    cannotRun,
    // Judging the bundled outputs again needs the key, not PHP.
    cannotRejudge: bundled === null ? NO_BUNDLE : process.env.ANTHROPIC_API_KEY ? null : NO_KEY,
    // Looking for a cause needs the key and the source, not PHP.
    cannotAskClaude: process.env.ANTHROPIC_API_KEY ? null : NO_KEY,
    bundled: job ? null : bundled,
  });
}

/** The same checks a run starts with, made up front so the page can say so before the click. */
async function whyCannotRun(config: ParityConfig): Promise<{ message: string; nextStep: string } | null> {
  try {
    await preflight(config, samplesDir);
  } catch (e) {
    if (e instanceof SetupError) return { message: e.message, nextStep: e.nextStep };
    throw e;
  }
  return process.env.ANTHROPIC_API_KEY ? null : NO_KEY;
}
