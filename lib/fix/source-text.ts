import { isUtf8 } from "node:buffer";
import { readFile } from "node:fs/promises";

// The tool writes source files back as UTF-8. A source in Shift_JIS or EUC-JP (common in old
// Japanese systems) read as UTF-8 turns every Japanese character into �, and writing that back
// would ruin the file. So a source that is not UTF-8 is never written, and a patch is not made for it.

/** A source file's text, "notUtf8" when its bytes are not UTF-8, or null when it cannot be read. */
export async function readSourceText(path: string): Promise<string | "notUtf8" | null> {
  const bytes = await readFile(path).catch(() => null);
  if (bytes === null) return null;
  return isUtf8(bytes) ? bytes.toString("utf8") : "notUtf8";
}
