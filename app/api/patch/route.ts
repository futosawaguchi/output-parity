import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { connection } from "next/server";
import { SetupError } from "@/lib/errors";
import { applyAll, makePatch } from "@/lib/fix/patch";
import { editsIn } from "@/lib/fix/verify";
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
  // Every edit the copy holds, in order: a second press of "apply" builds on the first.
  const edits = report && report.fixAttempt?.applied.kind === "applied" ? editsIn(report) : [];
  if (edits.length === 0) {
    return problem(404, "当てた直し方が見つかりません", "画面を読み込み直してください。サーバを起動し直した場合は、もう一度当てて確かめてください");
  }
  let source;
  try {
    source = (await loadSubject(root, subjectId)).config.source;
  } catch (e) {
    if (e instanceof SetupError) return problem(400, e.message, e.nextStep);
    throw e;
  }
  const files = [...new Set(edits.map((e) => e.file))];
  const originals = new Map<string, string>();
  for (const name of files) {
    const path = insideRoot(source, name);
    const text = path ? await readFile(path, "utf-8").catch(() => null) : null;
    if (text === null) return problem(404, `元のソースに ${name} がありません`, "設定の source が元のソースを指しているか確かめてください");
    originals.set(name, text);
  }
  // The original may have been edited since the copy was made: a patch is only made where it still applies as checked.
  const result = applyAll(edits, originals);
  if (!result.ok) {
    return problem(409, `元のソースの ${result.file} に、書き換える前の文がそのままの形で1か所だけありません（コピーを作ったあとに変わったか、もう直してあります）`, "元のソースを開いて、画面の差分のとおりに直してください");
  }
  const patch = files.flatMap((name) => makePatch(name, originals.get(name)!, result.after.get(name)!) ?? []).join("");
  if (patch === "") return problem(409, "直し方を当てても元のソースが変わりません", "画面の差分を見て、元のソースが直っているか確かめてください");
  const fileName = files.length === 1 ? `kawarime-${basename(files[0])}.patch` : "kawarime.patch";
  return new Response(patch, {
    headers: {
      "content-type": "text/x-diff; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function problem(status: number, message: string, nextStep: string): Response {
  return Response.json({ message, nextStep }, { status });
}
