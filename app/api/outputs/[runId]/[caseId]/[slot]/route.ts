import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { connection } from "next/server";
import { CASE_ID_PATTERN } from "@/lib/config";
import { RUN_ID_PATTERN } from "@/lib/runner/run-dir";
import { insideRoot } from "@/lib/safe-path";

const SLOTS = new Set(["old", "new", "baseline"]);
const CONTENT_TYPES: Record<string, string> = { pdf: "application/pdf" };

/** The output file of one execution, for the side-by-side view. Read-only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/outputs/[runId]/[caseId]/[slot]">): Promise<Response> {
  await connection();
  const { runId, caseId, slot } = await ctx.params;
  if (!RUN_ID_PATTERN.test(runId) || !CASE_ID_PATTERN.test(caseId) || !SLOTS.has(slot)) {
    return notFound();
  }
  const dir = insideRoot(join(process.cwd(), "runs"), runId, caseId, slot);
  if (!dir) return notFound();

  const name = (await readdir(dir).catch(() => [])).find((f) => f.startsWith("output."));
  if (!name) return notFound();
  const data = await readFile(join(dir, name));
  const ext = name.slice("output.".length);
  return new Response(data, {
    headers: { "content-type": CONTENT_TYPES[ext] ?? "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function notFound(): Response {
  return Response.json({ message: "出力ファイルが見つかりません", nextStep: "もう一度実行してください" }, { status: 404 });
}
