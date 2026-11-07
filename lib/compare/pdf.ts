import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { SetupError } from "../errors";
import { ExtractionError, type ExtractedDocument, type PageLayout } from "./document";
import { groupIntoLines, type TextItem } from "./pdf-lines";

// The only file that knows about PDF. pdfjs-dist is the single extractor: both sides of a
// comparison go through it, so what matters is that it is deterministic, not perfect (DESIGN 4-2).

export async function extractPdf(path: string): Promise<ExtractedDocument> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const assets = await pdfjsAssetDir();

  let data: Uint8Array;
  try {
    data = new Uint8Array(await readFile(path));
  } catch {
    throw new ExtractionError(`出力ファイルが読めません: ${path}`);
  }
  // Before pdf.js takes the bytes over.
  const file = fileLine(data);

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
    const metadata = await metadataLines(doc).catch((e) => {
      throw new ExtractionError(`PDF の文書の情報が読めません: ${path}（${(e as Error).message}）`);
    });
    const lines = [file, ...metadata];
    const pages: PageLayout[] = [];
    const unreadable: string[] = [];
    const imageOps = imageOperatorCodes(pdfjs.OPS);

    for (let n = 1; n <= doc.numPages; n++) {
      // A broken page is this file's problem, not the run's: it is reported like a file that cannot be opened.
      const { page, text, operators, annotations } = await readPage(doc, n).catch((e) => {
        throw new ExtractionError(`PDF の ${n} ページ目が読めません: ${path}（${(e as Error).message}）`);
      });
      const { width, height } = page.getViewport({ scale: 1 });
      const items = text.items.filter((i): i is TextItem & typeof i => "str" in i && i.str.trim() !== "");

      const layout = layoutOf(n, width, height, items);
      const images = operators.fnArray.filter((op) => imageOps.has(op)).length;
      const fields = formLines(annotations);
      // What the text alone cannot show is put into lines too, so that it is compared like text:
      // the values in form fields, a vanished logo or seal, a changed paper size, text pushed off the page.
      lines.push(`--- page ${n} ---`, ...groupIntoLines(items), ...fields, ...layoutLines(layout, images));
      pages.push(layout);
      if (images > 0) unreadable.push(`page ${n}: 画像 ${images} 個（中の文字は比較できません）`);
    }
    return { lines, pages, unreadable };
  } finally {
    await task.destroy();
  }
}

type PdfjsDocument = Awaited<ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs").getDocument>["promise"]>;

/** Everything read from one page, so that a page pdf.js cannot read fails in one place. */
async function readPage(doc: PdfjsDocument, n: number) {
  const page = await doc.getPage(n);
  return { page, text: await page.getTextContent(), operators: await page.getOperatorList(), annotations: (await page.getAnnotations()) as Annotation[] };
}

/**
 * Whether anything sits before %PDF- or after the last %%EOF, as a line. pdf.js reads past it, but
 * other readers do not: a PHP warning printed into the output ("Deprecated: …") makes the file one
 * that will not open, though its text is the same.
 */
function fileLine(data: Uint8Array): string {
  const text = Buffer.from(data).toString("latin1");
  const start = text.indexOf("%PDF-");
  const end = text.lastIndexOf("%%EOF");
  const before = start === -1 ? "%PDF- が無い" : start > 0 ? "あり" : "なし";
  const after = end === -1 ? "%%EOF が無い" : text.slice(end + 5).trim() !== "" ? "あり" : "なし";
  return `file: %PDF- の前の余分な文字 ${before}・%%EOF のうしろの余分な文字 ${after}`;
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

function layoutOf(page: number, width: number, height: number, items: TextItem[]): PageLayout {
  let charCount = 0;
  let textRight = 0;
  let textBottom = 0;
  let textLeft = 0;
  let textTop = 0;
  for (const item of items) {
    charCount += item.str.replace(/\s/g, "").length;
    textRight = Math.max(textRight, item.transform[4] + item.width);
    textBottom = Math.max(textBottom, height - item.transform[5]);
    textLeft = Math.min(textLeft, item.transform[4]);
    textTop = Math.min(textTop, height - item.transform[5]);
  }
  return {
    page,
    width: round(width),
    height: round(height),
    charCount,
    textRight: round(textRight),
    textBottom: round(textBottom),
    textLeft: round(textLeft),
    textTop: round(textTop),
  };
}

type Annotation = { subtype?: string; fieldName?: string; fieldValue?: unknown; options?: { displayValue?: string }[] };

/**
 * A form field (AcroForm) as a line: its name and value, with the choices offered for a list.
 * A value lives in the field, not in the page's text, so a total written into a field is compared here.
 * Radio buttons share one name and one value, so each name is one line.
 */
function formLines(annotations: Annotation[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const a of annotations) {
    if (a.subtype !== "Widget" || !a.fieldName || seen.has(a.fieldName)) continue;
    seen.add(a.fieldName);
    const value = Array.isArray(a.fieldValue) ? a.fieldValue.join(", ") : String(a.fieldValue ?? "");
    const choices = a.options?.length ? `（選択肢 ${a.options.map((o) => o.displayValue ?? "").join(" / ")}）` : "";
    lines.push(`form ${a.fieldName}: ${value}${choices}`);
  }
  return lines;
}

function layoutLines(p: PageLayout, images: number): string[] {
  const lines = [`layout page ${p.page}: 用紙 ${p.width}×${p.height}・画像 ${images} 個`];
  if (p.textRight > p.width || p.textBottom > p.height || p.textLeft < 0 || p.textTop < 0) lines.push(`layout page ${p.page}: 文字が用紙からはみ出している`);
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
