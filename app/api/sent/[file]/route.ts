import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { connection } from "next/server";
import { bundledDir } from "@/lib/bundled";
import { SENT_FILE_PATTERN } from "@/lib/sent-log";

/**
 * What was sent to Claude for one verdict or one cause, exactly as sent (DESIGN 7-4e ④). From
 * runs/sent/, or from the bundle for the bundled results. Read-only; the name is checked by shape.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/sent/[file]">): Promise<Response> {
  await connection();
  const { file } = await ctx.params;
  if (!SENT_FILE_PATTERN.test(file)) return notFound();
  const root = process.cwd();
  const bundled = await bundledDir(root);
  const places = [join(root, "runs", "sent"), ...(bundled ? [join(bundled, "sent")] : [])];
  for (const dir of places) {
    const text = await readFile(join(dir, file), "utf8").catch(() => null);
    if (text !== null) {
      return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }
  }
  return notFound();
}

function notFound(): Response {
  return Response.json({ message: "送ったものの記録が見つかりません", nextStep: "runs/sent/ を消していないか確認してください" }, { status: 404 });
}
