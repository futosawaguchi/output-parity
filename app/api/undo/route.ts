import { SetupError } from "@/lib/errors";
import { undoFixes } from "@/lib/fix/undo";
import { currentJob, startJob } from "@/lib/jobs";
import { isFromOurPage } from "@/lib/same-origin";
import { loadSubject, whyNoApplying } from "@/lib/subject";
import { alreadyRunning, notFromOurPage } from "../responses";

const root = process.cwd();

/** Undoes the applied edits: work/ back to the original, the page back to the report before them. */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) return notFromOurPage();
  const job = currentJob();
  if (job?.status === "running") return alreadyRunning(job.jobId);
  if (job?.status !== "done" || !job.report.fixAttempt?.original) {
    return Response.json({ message: "元に戻すものがありません", nextStep: "画面を読み込み直してください" }, { status: 400 });
  }
  const report = job.report;
  let subject;
  try {
    subject = await loadSubject(root);
  } catch (e) {
    if (e instanceof SetupError) return Response.json({ message: e.message, nextStep: e.nextStep }, { status: 400 });
    throw e;
  }
  const { config, workDir } = subject;
  if (!workDir) return Response.json(whyNoApplying(subject), { status: 400 });
  const result = startJob("undo", () => undoFixes(report, config, workDir));
  if (!result.started) return alreadyRunning(result.runningJobId);
  return Response.json({ jobId: result.jobId }, { status: 202 });
}
