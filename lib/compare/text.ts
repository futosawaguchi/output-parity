import { readFile } from "node:fs/promises";
import { ExtractionError, type ExtractedDocument } from "./document";

// Text outputs (logs, CSV, JSON, standard output) are already lines: the adapter only decodes
// them (DESIGN 4-4: "テキスト・ログ そのまま 0行"). Old systems in Japan often write Shift_JIS
// or EUC-JP, so the encoding comes from the settings.

/**
 * Reads text written in `encoding` (a WHATWG name: utf-8, shift_jis, euc-jp, ...) as lines.
 * Splitting into lines drops the line ends, a leading BOM and the final line end, which a program
 * importing the file may care about, so one last "layout" line states them and they are compared too.
 */
export async function extractText(path: string, encoding: string): Promise<ExtractedDocument> {
  const bytes = await readBytes(path);
  const decoded = decode(bytes, encoding);
  const { lines, ...rest } = splitLines(decoded);
  return { lines: [...lines, textLayout(bytes, decoded.text)], ...rest, pages: [] };
}

/** "layout: 改行 CRLF・先頭の BOM なし・最後の改行 あり": what splitting into lines leaves out. */
export function textLayout(bytes: Uint8Array, text: string): string {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  const ends = crlf > 0 && lf > 0 ? "CRLF と LF が混在" : crlf > 0 ? "CRLF" : lf > 0 ? "LF" : "なし";
  const bom = startsWith(bytes, [0xef, 0xbb, 0xbf]) || startsWith(bytes, [0xfe, 0xff]) || startsWith(bytes, [0xff, 0xfe]);
  const lastEnd = text.endsWith("\n");
  return `layout: 改行 ${ends}・先頭の BOM ${bom ? "あり" : "なし"}・最後の改行 ${lastEnd ? "あり" : "なし"}`;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((b, i) => bytes[i] === b);
}

export async function readBytes(path: string): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch {
    throw new ExtractionError(`出力ファイルが読めません: ${path}`);
  }
}

/**
 * Bytes that are not valid in the encoding become U+FFFD and are counted, never dropped: a
 * wrong encoding setting must show up in the report, not quietly garble the comparison.
 */
export function decode(bytes: Uint8Array, encoding: string): Decoded {
  const text = new TextDecoder(encoding).decode(bytes);
  const bad = text.split("�").length - 1;
  return { text, unreadable: bad > 0 ? [`文字コード ${encoding} として読めない部分が ${bad} か所あります（� に置き換えました）`] : [], undecodable: bad };
}

type Decoded = { text: string; unreadable: string[]; undecodable: number };

/** Lines without their line ends (\n or \r\n); a final line end does not make an empty last line. */
export function splitLines({ text, ...rest }: Decoded): { lines: string[]; unreadable: string[]; undecodable: number } {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return { lines, ...rest };
}
