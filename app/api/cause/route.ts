import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { loadBundledReport } from "@/lib/bundled";
import { CASE_ID_PATTERN } from "@/lib/config";
import { addCause } from "@/lib/fix/add-cause";
import { currentJob, startJob } from "@/lib/jobs";
import { isFromOurPage } from "@/lib/same-origin";
import { alreadyRunning, NO_KEY, notFromOurPage } from "../responses";

// Reads the API key, like app/api/runs/ and app/api/rejudge/. The key never leaves the server.

const root = process.cwd();

/**
 * Starts looking for the cause of one case (DESIGN 7-4), in the report on screen: the last
 * finished job's, or the bundled one. Body: { caseId }. 202 with a job id, or 409 if busy.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) return notFromOurPage();
  const { caseId } = (await request.json().catch(() => ({}))) as { caseId?: unknown };
  const job = currentJob();
  if (job?.status === "running") return alreadyRunning(job.jobId);
  const base = job?.status === "done" ? job.report : await loadBundledReport(root);
  if (typeof caseId !== "string" || !CASE_ID_PATTERN.test(caseId) || !base?.cases.some((c) => c.caseId === caseId)) {
    return Response.json({ message: "その入力は結果にありません", nextStep: "画面を読み込み直してください" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) return Response.json(NO_KEY, { status: 400 });
  const client = new Anthropic();

  // The source that produced the outputs: work/ for a run made here, the original for the bundle.
  const source = base.origin === "run" ? join(root, "work") : join(root, "samples");
  const result = startJob("cause", (onProgress) => addCause(base, caseId, client, { root: source, runsRoot: join(root, "runs"), onProgress }));
  if (!result.started) return alreadyRunning(result.runningJobId);
  return Response.json({ jobId: result.jobId }, { status: 202 });
}
