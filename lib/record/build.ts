import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { sep } from "node:path";
import type { RunReport } from "../pipeline";
import { redactSecrets } from "../redact";
import { newOnlyDeprecations, type StderrText } from "./deprecations";
import { renderRecord } from "./render";

/**
 * The record of a report as Markdown (render.ts), with the deprecations read from its runs' stderr.
 * The record is meant to be kept and handed on, so no local path stays in it (the repository's
 * root is dropped, the home directory becomes ~) and values that look like secrets are masked.
 */
export async function buildRecord(report: RunReport, root: string, now = new Date()): Promise<string> {
  const texts: StderrText[] = [];
  for (const c of report.cases) {
    for (const r of c.runs) {
      if (r.slot === "baseline") continue;
      // A run whose stderr is gone (runs/ cleaned by hand) simply has nothing to say.
      const text = await readFile(r.stderrPath, "utf8").catch(() => "");
      texts.push({ caseId: c.caseId, slot: r.slot, text });
    }
  }
  const markdown = renderRecord(report, { createdAt: now, deprecations: newOnlyDeprecations(texts) });
  const redacted = redactSecrets(tidyPaths(markdown, root));
  return redacted.count === 0
    ? redacted.text
    : `${redacted.text}\nこの記録を作るとき、パスワードや鍵に見える値 ${redacted.count} 個を *** にしました。\n`;
}

export function tidyPaths(text: string, root: string): string {
  return text.split(root + sep).join("").split(homedir()).join("~");
}
