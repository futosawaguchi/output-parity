import { join } from "node:path";
import { connection } from "next/server";
import { bundledDir } from "@/lib/bundled";
import { readSent } from "@/lib/sent-log";
import { subjectIdOf } from "@/lib/subject";

/**
 * What was sent to Claude for one verdict or one cause, exactly as sent (DESIGN 7-4e ④). From
 * runs/sent/, or from the bundle of ?subject= for the bundled results. Read-only; the name is checked by shape.
 * The page /check/sent/<file> shows the same text to read.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/sent/[file]">): Promise<Response> {
  await connection();
  const { file } = await ctx.params;
  const root = process.cwd();
  const bundled = await bundledDir(root, subjectIdOf(new URL(request.url).searchParams.get("subject")));
  const text = await readSent([join(root, "runs", "sent"), ...(bundled ? [join(bundled, "sent")] : [])], file);
  if (text === null) {
    return Response.json({ message: "送ったものの記録が見つかりません", nextStep: "runs/sent/ を消していないか確認してください" }, { status: 404 });
  }
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
