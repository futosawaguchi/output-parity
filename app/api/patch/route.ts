import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { connection } from "next/server";
import { SetupError } from "@/lib/errors";
import { makePatch } from "@/lib/fix/patch";
import { reportForRecord } from "@/lib/record/build";
import { insideRoot } from "@/lib/safe-path";
import { loadSubject, subjectIdOf } from "@/lib/subject";

/**
 * The edit that was applied to the copy in work/ and checked, as a patch for the original source,
 * to save and apply with `git apply` (DESIGN 7-4: the tool does not write the original). For the
 * report on the page: a finished job's (?job=), or the bundled run after its edit (?from=bundled-fix).
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const params = new URL(request.url).searchParams;
  const subjectId = subjectIdOf(params.get("subject"));
  const root = process.cwd();
  const report = await reportForRecord(root, subjectId, { from: params.get("from"), job: params.get("job") });
  const edit = report?.fixAttempt?.applied.kind === "applied" ? report.fixAttempt.edit : null;
  if (!edit) {
    return problem(404, "当てた直し方が見つかりません", "画面を読み込み直してください。サーバを起動し直した場合は、もう一度当てて確かめてください");
  }
  let source;
  try {
    source = (await loadSubject(root, subjectId)).config.source;
  } catch (e) {
    if (e instanceof SetupError) return problem(400, e.message, e.nextStep);
    throw e;
  }
  const file = insideRoot(source, edit.file);
  const original = file ? await readFile(file, "utf-8").catch(() => null) : null;
  if (original === null) return problem(404, `元のソースに ${edit.file} がありません`, "設定の source が元のソースを指しているか確かめてください");
  // The original may have been edited since the copy was made: a patch is only made where it still applies as checked.
  if (original.split(edit.oldText).length !== 2) {
    return problem(409, `元のソースの ${edit.file} に、書き換える前の文がそのままの形で1か所だけありません（写しを作ったあとに変わったか、もう直してあります）`, "元のソースを開いて、画面の差分のとおりに直してください");
  }
  const patch = makePatch(edit.file, original, original.replace(edit.oldText, () => edit.newText));
  if (!patch) return problem(409, "直し方を当てても元のソースが変わりません", "画面の差分を見て、元のソースが直っているか確かめてください");
  return new Response(patch, {
    headers: {
      "content-type": "text/x-diff; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`kawarime-${basename(edit.file)}.patch`)}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function problem(status: number, message: string, nextStep: string): Response {
  return Response.json({ message, nextStep }, { status });
}
