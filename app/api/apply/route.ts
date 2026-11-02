import { join } from "node:path";
import { loadBundledReport } from "@/lib/bundled";
import { adapterFor } from "@/lib/compare/adapters";
import { CASE_ID_PATTERN, loadConfig } from "@/lib/config";
import { SetupError } from "@/lib/errors";
import { applyAndVerify } from "@/lib/fix/apply-and-verify";
import { currentJob, startJob } from "@/lib/jobs";
import { preflight } from "@/lib/runner/preflight";
import { isFromOurPage } from "@/lib/same-origin";
import { alreadyRunning, notFromOurPage } from "../responses";

// No API key here: whether an edit worked is decided by comparing outputs, not by Claude.

const root = process.cwd();
const samplesDir = join(root, "samples");

/**
 * Applies one proposed edit to work/ and runs every case again (DESIGN 7-4). Only a person
 * pressing the button gets here. Body: { caseId, candidate }. The edit itself is taken from the
 * report on the server, never from the request. 202 with a job id, or 409 if busy.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) return notFromOurPage();
  const { caseId, candidate } = (await request.json().catch(() => ({}))) as { caseId?: unknown; candidate?: unknown };
  const job = currentJob();
  if (job?.status === "running") return alreadyRunning(job.jobId);
  const base = job?.status === "done" ? job.report : await loadBundledReport(root);
  const cause = typeof caseId === "string" && CASE_ID_PATTERN.test(caseId) ? base?.cases.find((c) => c.caseId === caseId)?.cause : undefined;
  if (!base || cause?.kind !== "found" || typeof candidate !== "number" || !cause.candidates[candidate]?.edit) {
    return Response.json({ message: "当てる直し方が見つかりません", nextStep: "画面を読み込み直し、原因をもう一度探してください" }, { status: 400 });
  }

  let config, adapter;
  try {
    config = await loadConfig(join(samplesDir, "parity.config.json"));
    adapter = adapterFor(config.output.format);
    // Running again needs the interpreters; say so now rather than after writing to work/.
    await preflight(config, samplesDir);
  } catch (e) {
    if (e instanceof SetupError) return Response.json({ message: e.message, nextStep: e.nextStep }, { status: 400 });
    throw e;
  }

  const result = startJob("verify", (onProgress) =>
    applyAndVerify(base, caseId as string, candidate, {
      config,
      adapter,
      samplesDir,
      workDir: join(root, "work"),
      runsRoot: join(root, "runs"),
      onProgress,
    }),
  );
  if (!result.started) return alreadyRunning(result.runningJobId);
  return Response.json({ jobId: result.jobId }, { status: 202 });
}
