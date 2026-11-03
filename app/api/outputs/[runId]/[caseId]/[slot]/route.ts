import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { connection } from "next/server";
import { BUNDLED_FIX_DIR, BUNDLED_FIX_RUN_ID, BUNDLED_RUN_ID, bundledDir } from "@/lib/bundled";
import { CASE_ID_PATTERN } from "@/lib/config";
import { RUN_ID_PATTERN } from "@/lib/runner/run-dir";
import { insideRoot } from "@/lib/safe-path";
import { subjectIdOf } from "@/lib/subject";

const SLOTS = new Set(["old", "new", "baseline"]);
const CONTENT_TYPES: Record<string, string> = { pdf: "application/pdf" };

/**
 * An HTML output drawn as a page (?view=page) comes from the program under test, so it gets
 * nothing: no script, no request to anywhere (an old page may point at a production server), no
 * form, and it cannot be framed by another site. The page in the tool also puts it in a sandboxed
 * frame; this header holds even if the address is opened on its own.
 */
const PAGE_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
  "sandbox",
].join("; ");

/** The output file of one execution, from runs/ or from the bundled run of ?subject=. Read-only. */
export async function GET(request: Request, ctx: RouteContext<"/api/outputs/[runId]/[caseId]/[slot]">): Promise<Response> {
  await connection();
  const { runId, caseId, slot } = await ctx.params;
  const bundled = runId === BUNDLED_RUN_ID || runId === BUNDLED_FIX_RUN_ID;
  if (!(bundled || RUN_ID_PATTERN.test(runId)) || !CASE_ID_PATTERN.test(caseId) || !SLOTS.has(slot)) {
    return notFound();
  }
  const root = process.cwd();
  const bundledBase = bundled ? await bundledDir(root, subjectIdOf(new URL(request.url).searchParams.get("subject"))) : null;
  const bundledRoot = bundledBase && (runId === BUNDLED_FIX_RUN_ID ? join(bundledBase, BUNDLED_FIX_DIR) : bundledBase);
  const dir = bundled ? bundledRoot && insideRoot(bundledRoot, caseId, slot) : insideRoot(join(root, "runs"), runId, caseId, slot);
  if (!dir) return notFound();

  const name = (await readdir(dir).catch(() => [])).find((f) => f.startsWith("output."));
  if (!name) return notFound();
  const data = await readFile(join(dir, name));
  const ext = name.slice("output.".length);
  const params = new URL(request.url).searchParams;
  if (params.get("view") === "page") {
    if (ext !== "html") return notFound();
    const charset = params.get("charset") ?? "utf-8";
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(charset) || !isEncoding(charset)) return notFound();
    return new Response(data, {
      headers: {
        "content-type": `text/html; charset=${charset}`,
        "content-security-policy": PAGE_POLICY,
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "cache-control": "no-store",
      },
    });
  }
  return new Response(data, {
    headers: { "content-type": CONTENT_TYPES[ext] ?? "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function isEncoding(label: string): boolean {
  try {
    new TextDecoder(label);
    return true;
  } catch {
    return false;
  }
}

function notFound(): Response {
  return Response.json({ message: "出力ファイルが見つかりません", nextStep: "もう一度実行してください" }, { status: 404 });
}
