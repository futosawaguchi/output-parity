import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { loadBundledReport } from "@/lib/bundled";
import { whyNotSending } from "@/lib/claude-scope";
import { adapterFor } from "@/lib/compare/adapters";
import { SetupError } from "@/lib/errors";
import { startJob } from "@/lib/jobs";
import { rejudgeBundled } from "@/lib/rejudge";
import { isFromOurPage } from "@/lib/same-origin";
import { loadSubject, subjectIdOf } from "@/lib/subject";
import { alreadyRunning, NO_BUNDLE, NO_KEY, notFromOurPage } from "../responses";

// Reads the API key, like app/api/runs/. The key never leaves the server.

const root = process.cwd();

/** Starts judging a subject's bundled outputs again (no PHP needed). Body: { subject }. 202 with a job id, or 409 if busy. */
export async function POST(request: Request): Promise<Response> {
  if (!isFromOurPage(request)) return notFromOurPage();
  const subjectId = subjectIdOf(((await request.json().catch(() => ({}))) as { subject?: unknown }).subject);
  const bundled = await loadBundledReport(root, subjectId);
  if (!bundled) {
    return Response.json(NO_BUNDLE, { status: 400 });
  }
  let adapter;
  try {
    adapter = adapterFor(bundled.outputFormat);
    // The bundle belongs to a subject; its settings decide what may be sent.
    const refused = whyNotSending((await loadSubject(root, subjectId)).config, "judge");
    if (refused) return Response.json(refused, { status: 400 });
  } catch (e) {
    if (e instanceof SetupError) return Response.json({ message: e.message, nextStep: e.nextStep }, { status: 400 });
    throw e;
  }
  if (!process.env.ANTHROPIC_API_KEY) return Response.json(NO_KEY, { status: 400 });
  const client = new Anthropic();

  const result = startJob("rejudge", subjectId, (onProgress) =>
    rejudgeBundled(bundled, { adapter, client, runsRoot: join(root, "runs"), onProgress }),
  );
  if (!result.started) return alreadyRunning(result.running, subjectId);
  return Response.json({ jobId: result.jobId }, { status: 202 });
}
