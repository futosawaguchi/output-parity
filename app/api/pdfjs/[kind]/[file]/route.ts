import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { insideRoot } from "@/lib/safe-path";

// Serves the CMaps and standard fonts that ship with pdfjs-dist, so the browser can draw
// Japanese text in PDFs that do not embed their fonts. Only these two folders, read-only.

const KINDS = new Set(["cmaps", "standard_fonts"]);
const FILE_PATTERN = /^[A-Za-z0-9._-]+$/;

export async function GET(_req: Request, ctx: RouteContext<"/api/pdfjs/[kind]/[file]">): Promise<Response> {
  const { kind, file } = await ctx.params;
  const path = KINDS.has(kind) && FILE_PATTERN.test(file) ? insideRoot(join(process.cwd(), "node_modules", "pdfjs-dist", kind), file) : null;
  const data = path ? await readFile(path).catch(() => null) : null;
  if (!data) return new Response("not found", { status: 404 });
  return new Response(data, { headers: { "content-type": "application/octet-stream", "cache-control": "public, max-age=86400" } });
}
