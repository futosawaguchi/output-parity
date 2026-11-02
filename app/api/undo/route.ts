import { SetupError } from "@/lib/errors";
import { undoFixes } from "@/lib/fix/undo";
import { currentJob, runningJob, startJob } from "@/lib/jobs";
import { isFromOurPage } from "@/lib/same-origin";
import { loadSubject, subjectIdOf, whyNoApplying } from "@/lib/subject";
import { alreadyRunning, notFromOurPage } from "../responses";

const root = process.cwd();

/** Undoes the applied edits: work/ back to the original, the page back to the report before them. Body: { subject }. */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) return notFromOurPage();
  const subjectId = subjectIdOf(((await request.json().catch(() => ({}))) as { subject?: unknown }).subject);
  const running = runningJob();
  if (running) return alreadyRunning(running, subjectId);
  const job = currentJob(subjectId);
  if (job?.status !== "done" || !job.report.fixAttempt?.original) {
    return Response.json({ message: "元に戻すものがありません", nextStep: "画面を読み込み直してください" }, { status: 400 });
  }
  const report = job.report;
  let subject;
  try {
    subject = await loadSubject(root, subjectId);
  } catch (e) {
    if (e instanceof SetupError) return Response.json({ message: e.message, nextStep: e.nextStep }, { status: 400 });
    throw e;
  }
  const { config, workDir } = subject;
  if (!workDir) return Response.json(whyNoApplying(subject), { status: 400 });
  const result = startJob("undo", subjectId, () => undoFixes(report, config, workDir));
  if (!result.started) return alreadyRunning(result.running, subjectId);
  return Response.json({ jobId: result.jobId }, { status: 202 });
}
