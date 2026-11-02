import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { SetupError } from "../errors";
import { ExtractionError, type ExtractedDocument, type PageLayout } from "./document";

// The only file that knows about PDF. pdfjs-dist is the single extractor: both sides of a
// comparison go through it, so what matters is that it is deterministic, not perfect (DESIGN 4-2).

type TextItem = { str: string; transform: number[]; width: number };

/** Items whose baselines differ by less than this many points are on the same line. */
const SAME_LINE_TOLERANCE = 1;

export async function extractPdf(path: string): Promise<ExtractedDocument> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const assets = await pdfjsAssetDir();

  let data: Uint8Array;
  try {
    data = new Uint8Array(await readFile(path));
  } catch {
    throw new ExtractionError(`出力ファイルが読めません: ${path}`);
  }

  const task = pdfjs.getDocument({
    data,
    // Japanese text in CID fonts can only be decoded with the CMaps shipped with pdfjs.
    cMapUrl: join(assets, "cmaps") + "/",
    cMapPacked: true,
    standardFontDataUrl: join(assets, "standard_fonts") + "/",
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    throw new ExtractionError(`PDF として開けません: ${path}（${(e as Error).message}）`);
  }

  try {
    const lines = await metadataLines(doc);
    const pages: PageLayout[] = [];
    const unreadable: string[] = [];
    const imageOps = imageOperatorCodes(pdfjs.OPS);

    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      const items = (await page.getTextContent()).items.filter(
        (i): i is TextItem & typeof i => "str" in i && i.str.trim() !== "",
      );

      const layout = layoutOf(n, width, height, items);
      const images = (await page.getOperatorList()).fnArray.filter((op) => imageOps.has(op)).length;
      // What the text alone cannot show is put into lines too, so that it is compared like text:
      // a vanished logo or seal, a changed paper size, text pushed off the page.
      lines.push(`--- page ${n} ---`, ...groupIntoLines(items), ...layoutLines(layout, images));
      pages.push(layout);
      if (images > 0) unreadable.push(`page ${n}: 画像 ${images} 個（中の文字は比較できません）`);
    }
    return { lines, pages, unreadable };
  } finally {
    await task.destroy();
  }
}

type PdfDocument = {
  fingerprints: (string | null)[];
  getMetadata(): Promise<{ info: object; metadata: Iterable<[string, unknown]> | null }>;
};

/** Document info, XMP and file IDs as lines, so values that change on every run surface in the baseline. */
async function metadataLines(doc: PdfDocument): Promise<string[]> {
  const lines: string[] = [];
  const { info, metadata } = await doc.getMetadata();
  for (const [key, value] of sortedEntries(info)) {
    const text = typeof value === "string" ? value : isNamed(value) ? value.name : null;
    if (text !== null) lines.push(`meta ${key}: ${text}`);
  }
  const xmp = [...(metadata ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [key, value] of xmp) lines.push(`xmp ${key}: ${String(value)}`);
  doc.fingerprints.forEach((id, i) => {
    if (id) lines.push(`id ${i}: ${id}`);
  });
  return lines;
}

/** Joins text items into lines: top to bottom, then left to right. */
export function groupIntoLines(items: TextItem[]): string[] {
  const indexed = items.map((item, index) => ({ item, index, x: item.transform[4], y: item.transform[5] }));
  // Stable order: by y descending (PDF y grows upward), then x, then original order.
  indexed.sort((a, b) => b.y - a.y || a.x - b.x || a.index - b.index);

  const rows: (typeof indexed)[] = [];
  for (const entry of indexed) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - entry.y) < SAME_LINE_TOLERANCE) row.push(entry);
    else rows.push([entry]);
  }
  return rows.map((row) =>
    row
      .sort((a, b) => a.x - b.x || a.index - b.index)
      .map((e) => e.item.str.trim())
      .join(" ")
      .replace(/\s+/g, " "),
  );
}

function layoutOf(page: number, width: number, height: number, items: TextItem[]): PageLayout {
  let charCount = 0;
  let textRight = 0;
  let textBottom = 0;
  for (const item of items) {
    charCount += item.str.replace(/\s/g, "").length;
    textRight = Math.max(textRight, item.transform[4] + item.width);
    textBottom = Math.max(textBottom, height - item.transform[5]);
  }
  return { page, width: round(width), height: round(height), charCount, textRight: round(textRight), textBottom: round(textBottom) };
}

function layoutLines(p: PageLayout, images: number): string[] {
  const lines = [`layout page ${p.page}: 用紙 ${p.width}×${p.height}・画像 ${images} 個`];
  if (p.textRight > p.width || p.textBottom > p.height) lines.push(`layout page ${p.page}: 文字が用紙からはみ出している`);
  return lines;
}

function imageOperatorCodes(ops: Record<string, number>): Set<number> {
  return new Set(Object.entries(ops).filter(([name]) => /image/i.test(name)).map(([, code]) => code));
}

async function pdfjsAssetDir(): Promise<string> {
  const dir = join(process.cwd(), "node_modules", "pdfjs-dist");
  if (!(await stat(join(dir, "cmaps")).catch(() => null))?.isDirectory()) {
    throw new SetupError(`pdfjs-dist が見つかりません: ${dir}`, "npm install を実行してください");
  }
  return dir;
}

function sortedEntries(obj: unknown): [string, unknown][] {
  if (typeof obj !== "object" || obj === null) return [];
  return Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function isNamed(v: unknown): v is { name: string } {
  return typeof v === "object" && v !== null && typeof (v as { name?: unknown }).name === "string";
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
