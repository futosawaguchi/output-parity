import { connection } from "next/server";
import { loadBundledFix, loadBundledReport } from "@/lib/bundled";
import { getJob } from "@/lib/jobs";
import { buildRecord } from "@/lib/record/build";
import { subjectIdOf } from "@/lib/subject";

/**
 * The record of what was checked (DESIGN 4-5), as Markdown, for the report on the page: a finished
 * job's (?job=), or the bundled run (?from=bundled|bundled-fix) of ?subject=. Built when asked;
 * nothing is written. With ?download=1 it comes as a file to save.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const params = new URL(request.url).searchParams;
  const subjectId = subjectIdOf(params.get("subject"));
  const root = process.cwd();
  const from = params.get("from");
  let report = null;
  if (from === "bundled") report = await loadBundledReport(root, subjectId);
  else if (from === "bundled-fix") report = await loadBundledFix(root, subjectId);
  else {
    const job = getJob(params.get("job") ?? "");
    if (job?.status === "done" && job.subjectId === subjectId) report = job.report;
  }
  if (!report) {
    return Response.json(
      { message: "記録を作る結果が見つかりません", nextStep: "画面を読み込み直してください。サーバを起動し直した場合は npm run record で runs/ から作れます" },
      { status: 404 },
    );
  }
  const text = await buildRecord(report, root);
  const headers: Record<string, string> = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (params.get("download") === "1") {
    headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(`record-${subjectId}-${report.runId}.md`)}`;
  }
  return new Response(text, { headers });
}
