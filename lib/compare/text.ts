import { readFile } from "node:fs/promises";
import { ExtractionError, type ExtractedDocument } from "./document";

// Text outputs (logs, CSV, JSON, standard output) are already lines: the adapter only decodes
// them (DESIGN 4-4: "テキスト・ログ そのまま 0行"). Old systems in Japan often write Shift_JIS
// or EUC-JP, so the encoding comes from the settings.

/** Reads text written in `encoding` (a WHATWG name: utf-8, shift_jis, euc-jp, ...) as lines. */
export async function extractText(path: string, encoding: string): Promise<ExtractedDocument> {
  return { ...splitLines(decode(await readBytes(path), encoding)), pages: [] };
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
