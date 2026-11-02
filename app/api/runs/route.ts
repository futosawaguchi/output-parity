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

// The only place in the app that reads the API key (CLAUDE.md). The key never leaves the server:
// it is not in any response, and errors are reported by type with fixed wording.

const root = process.cwd();
const samplesDir = join(root, "samples");
const NO_KEY = { message: "API キーが設定されていません", nextStep: ".env の ANTHROPIC_API_KEY を設定して、npm run dev を起動し直してください" };

/** Starts a run of every sample case. 202 with a job id, or 409 if one is already running. */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) {
    return Response.json({ message: "この画面以外からの実行は受け付けません", nextStep: "画面の「実行」ボタンから実行してください" }, { status: 403 });
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

  const result = startJob((onProgress) =>
    runPipeline({ config, adapter, cwd: samplesDir, runsRoot: join(root, "runs"), client, onProgress }),
  );
  if (!result.started) {
    return Response.json(
      { message: "すでに実行中です", nextStep: "終わるまで待ってください", jobId: result.runningJobId },
      { status: 409 },
    );
  }
  return Response.json({ jobId: result.jobId }, { status: 202 });
}

/**
 * What will be checked (shown before anything runs), whether it can run here, and the job that
 * is running or finished last, so a reloaded page can pick it up again. With no job yet, the
 * bundled run is sent instead, so the page shows a report without PHP or a key (DESIGN 7-2b).
 * Commands are left out of the target: they are local paths.
 */
export async function GET(): Promise<Response> {
  await connection();
  const job = currentJob();
  let target = null;
  let cannotRun = null;
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
    bundled: job ? null : await loadBundledReport(root),
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
