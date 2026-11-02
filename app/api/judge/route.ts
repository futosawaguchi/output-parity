import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { whyNotSending } from "@/lib/claude-scope";
import { adapterFor } from "@/lib/compare/adapters";
import { SetupError } from "@/lib/errors";
import { currentJob, runningJob, startJob } from "@/lib/jobs";
import { judgeHeldCases } from "@/lib/rejudge";
import { isFromOurPage } from "@/lib/same-origin";
import { loadSubject, subjectIdOf } from "@/lib/subject";
import { alreadyRunning, NO_KEY, notFromOurPage } from "../responses";

// Reads the API key, like app/api/runs/. The key never leaves the server.

const root = process.cwd();

/**
 * Judges the cases the report on screen held back (more than may be sent without asking). Only a
 * person who saw the count and pressed the button gets here. Body: { subject }. 202 with a job id.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) return notFromOurPage();
  const subjectId = subjectIdOf(((await request.json().catch(() => ({}))) as { subject?: unknown }).subject);
  const running = runningJob();
  if (running) return alreadyRunning(running, subjectId);
  const job = currentJob(subjectId);
  if (job?.status !== "done" || !job.report.judgeHeld) {
    return Response.json({ message: "判定を待っている入力がありません", nextStep: "画面を読み込み直してください" }, { status: 400 });
  }
  const held = job.report;
  let adapter;
  try {
    adapter = adapterFor(held.outputFormat);
    const refused = whyNotSending((await loadSubject(root, subjectId)).config, "judge");
    if (refused) return Response.json(refused, { status: 400 });
  } catch (e) {
    if (e instanceof SetupError) return Response.json({ message: e.message, nextStep: e.nextStep }, { status: 400 });
    throw e;
  }
  if (!process.env.ANTHROPIC_API_KEY) return Response.json(NO_KEY, { status: 400 });
  const client = new Anthropic();

  const result = startJob("judge", subjectId, (onProgress) => judgeHeldCases(held, { adapter, client, runsRoot: join(root, "runs"), onProgress }));
  if (!result.started) return alreadyRunning(result.running, subjectId);
  return Response.json({ jobId: result.jobId }, { status: 202 });
}
