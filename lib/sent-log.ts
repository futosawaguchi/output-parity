import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Everything sent to Claude is kept, as sent (after redaction), under runs/sent/ (DESIGN 7-4e ④):
// a person can see exactly what left the machine, and the page links to it from each result.

export type SentPurpose = "judge" | "cause";

export type SentRecord = {
  purpose: SentPurpose;
  /** When it was sent (ISO time). */
  at: string;
  /** The file under runs/sent/ holding the whole text sent. */
  file: string;
  chars: number;
  /** How many values were replaced with *** (lib/redact.ts), and of what kinds. */
  masked: number;
  maskedKinds: string[];
};

/** Writes what was sent for one purpose and returns the record that points to it. */
export type SentRecorder = (r: { caseId: string; purpose: SentPurpose; text: string; masked: number; maskedKinds: string[] }) => Promise<SentRecord>;

/** File names under runs/sent/, for checking names that come back from the browser. */
export const SENT_FILE_PATTERN = /^\d{8}-\d{6}-[A-Za-z0-9_-]+-(?:judge|cause)-[0-9a-f]{4}\.txt$/;

export function sentRecorder(sentDir: string): SentRecorder {
  return async ({ caseId, purpose, text, masked, maskedKinds }) => {
    const now = new Date();
    const file = `${stamp(now)}-${caseId}-${purpose}-${randomBytes(2).toString("hex")}.txt`;
    await mkdir(sentDir, { recursive: true });
    await writeFile(join(sentDir, file), text);
    return { purpose, at: now.toISOString(), file, chars: text.length, masked, maskedKinds };
  };
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
