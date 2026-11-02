import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { loadBundledReport } from "@/lib/bundled";
import { whyNotSending } from "@/lib/claude-scope";
import { CASE_ID_PATTERN } from "@/lib/config";
import { addCause } from "@/lib/fix/add-cause";
import { currentJob, runningJob, startJob } from "@/lib/jobs";
import { SetupError } from "@/lib/errors";
import { isFromOurPage } from "@/lib/same-origin";
import { loadSubject, subjectIdOf } from "@/lib/subject";
import { alreadyRunning, NO_KEY, notFromOurPage } from "../responses";

// Reads the API key, like app/api/runs/ and app/api/rejudge/. The key never leaves the server.

const root = process.cwd();

/**
 * Starts looking for the cause of one case (DESIGN 7-4), in the report on screen: the last
 * finished job's, or the bundled one. Body: { subject, caseId }. 202 with a job id, or 409 if busy.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) return notFromOurPage();
  const body = (await request.json().catch(() => ({}))) as { subject?: unknown; caseId?: unknown };
  const { caseId } = body;
  const subjectId = subjectIdOf(body.subject);
  const running = runningJob();
  if (running) return alreadyRunning(running, subjectId);
  const job = currentJob(subjectId);
  const base = job?.status === "done" ? job.report : await loadBundledReport(root, subjectId);
  if (typeof caseId !== "string" || !CASE_ID_PATTERN.test(caseId) || !base?.cases.some((c) => c.caseId === caseId)) {
    return Response.json({ message: "その入力は結果にありません", nextStep: "画面を読み込み直してください" }, { status: 400 });
  }
  let subject;
  try {
    subject = await loadSubject(root, subjectId);
  } catch (e) {
    if (e instanceof SetupError) return Response.json({ message: e.message, nextStep: e.nextStep }, { status: 400 });
    throw e;
  }
  const refused = whyNotSending(subject.config, "cause");
  if (refused) return Response.json(refused, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json(NO_KEY, { status: 400 });
  const client = new Anthropic();

  // The source that produced the outputs: work/ for a run made here, the original for the bundle.
  const source = base.origin === "run" ? subject.runRoot : subject.config.source;
  // Links in work/ lead to the original's dependencies, which may be read; keys never are.
  const scope = { root: source, alsoAllow: [subject.config.source], neverRead: subject.config.claude.neverRead };
  const result = startJob("cause", subjectId, (onProgress) => addCause(base, caseId, client, { scope, runsRoot: join(root, "runs"), onProgress }));
  if (!result.started) return alreadyRunning(result.running, subjectId);
  return Response.json({ jobId: result.jobId }, { status: 202 });
}
