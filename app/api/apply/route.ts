import { join } from "node:path";
import { loadBundledReport } from "@/lib/bundled";
import { adapterFor } from "@/lib/compare/adapters";
import { CASE_ID_PATTERN } from "@/lib/config";
import { SetupError } from "@/lib/errors";
import { applyAndVerify } from "@/lib/fix/apply-and-verify";
import { currentJob, runningJob, startJob } from "@/lib/jobs";
import { preflight } from "@/lib/runner/preflight";
import { isFromOurPage } from "@/lib/same-origin";
import { loadSubject, subjectIdOf, whyNoApplying } from "@/lib/subject";
import { alreadyRunning, notFromOurPage } from "../responses";

// No API key here: whether an edit worked is decided by comparing outputs, not by Claude.

const root = process.cwd();

/**
 * Applies one proposed edit to work/ and runs every case again (DESIGN 7-4). Only a person
 * pressing the button gets here. Body: { subject, caseId, candidate }. The edit itself is taken
 * from the report on the server, never from the request. 202 with a job id, or 409 if busy.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) return notFromOurPage();
  const body = (await request.json().catch(() => ({}))) as { subject?: unknown; caseId?: unknown; candidate?: unknown };
  const { caseId, candidate } = body;
  const subjectId = subjectIdOf(body.subject);
  const running = runningJob();
  if (running) return alreadyRunning(running, subjectId);
  const job = currentJob(subjectId);
  const base = job?.status === "done" ? job.report : await loadBundledReport(root, subjectId);
  const cause = typeof caseId === "string" && CASE_ID_PATTERN.test(caseId) ? base?.cases.find((c) => c.caseId === caseId)?.cause : undefined;
  if (!base || cause?.kind !== "found" || typeof candidate !== "number" || !cause.candidates[candidate]?.edit) {
    return Response.json({ message: "当てる直し方が見つかりません", nextStep: "画面を読み込み直し、原因をもう一度探してください" }, { status: 400 });
  }

  let subject, adapter;
  try {
    subject = await loadSubject(root, subjectId);
    adapter = adapterFor(subject.config.output.format);
    // Running again needs the interpreters; say so now rather than after writing to work/.
    await preflight(subject.config, join(subject.config.source, subject.config.run.cwd));
  } catch (e) {
    if (e instanceof SetupError) return Response.json({ message: e.message, nextStep: e.nextStep }, { status: 400 });
    throw e;
  }
  const { config, workDir } = subject;
  if (!workDir) return Response.json(whyNoApplying(subject), { status: 400 });

  const result = startJob("verify", subjectId, (onProgress) =>
    applyAndVerify(base, caseId as string, candidate, {
      config,
      adapter,
      workDir,
      runsRoot: join(root, "runs"),
      onProgress,
    }),
  );
  if (!result.started) return alreadyRunning(result.running, subjectId);
  return Response.json({ jobId: result.jobId }, { status: 202 });
}
