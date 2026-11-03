import { connection } from "next/server";
import { buildRecord, reportForRecord } from "@/lib/record/build";
import { subjectIdOf } from "@/lib/subject";

/**
 * The record of what was checked (DESIGN 4-5), as a Markdown file to save, for the report on the
 * page: a finished job's (?job=), or the bundled run (?from=bundled|bundled-fix) of ?subject=.
 * Built when asked; nothing is written. The page /check/record shows the same record to read.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const params = new URL(request.url).searchParams;
  const subjectId = subjectIdOf(params.get("subject"));
  const root = process.cwd();
  const report = await reportForRecord(root, subjectId, { from: params.get("from"), job: params.get("job") });
  if (!report) {
    return Response.json(
      { message: "記録を作る結果が見つかりません", nextStep: "画面を読み込み直してください。サーバを起動し直した場合は npm run record で runs/ から作れます" },
      { status: 404 },
    );
  }
  return new Response(await buildRecord(report, root), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`record-${subjectId}-${report.runId}.md`)}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
