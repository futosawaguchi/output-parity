import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { sep } from "node:path";
import { loadBundledFix, loadBundledReport } from "../bundled";
import { getJob } from "../jobs";
import type { RunReport } from "../pipeline";
import { redactSecrets } from "../redact";
import { newOnlyDeprecations, type StderrText } from "./deprecations";
import { mapText, toMarkdown, type RecordDoc } from "./doc";
import { recordDoc } from "./render";

/**
 * The record of a report (render.ts), with the deprecations read from its runs' stderr. The record
 * is meant to be kept and handed on, so no local path stays in it (the repository's root is
 * dropped, the home directory becomes ~) and values that look like secrets are masked.
 */
export async function buildRecordDoc(report: RunReport, root: string, now = new Date()): Promise<RecordDoc> {
  const texts: StderrText[] = [];
  for (const c of report.cases) {
    for (const r of c.runs) {
      if (r.slot === "baseline") continue;
      // A run whose stderr is gone (runs/ cleaned by hand) simply has nothing to say.
      const text = await readFile(r.stderrPath, "utf8").catch(() => "");
      texts.push({ caseId: c.caseId, slot: r.slot, text });
    }
  }
  let masked = 0;
  const doc = mapText(recordDoc(report, { createdAt: now, deprecations: newOnlyDeprecations(texts) }), (s) => {
    const r = redactSecrets(tidyPaths(s, root));
    masked += r.count;
    return r.text;
  });
  return masked === 0 ? doc : [...doc, { kind: "paragraph", text: `この記録を作るとき、パスワードや鍵に見える値 ${masked} 個を *** にしました。` }];
}

export async function buildRecord(report: RunReport, root: string, now = new Date()): Promise<string> {
  return toMarkdown(await buildRecordDoc(report, root, now));
}

export function tidyPaths(text: string, root: string): string {
  return text.split(root + sep).join("").split(homedir()).join("~");
}

/**
 * The report the page shows, for its record: a finished job's (`job`), or the bundled run of the
 * subject (`from` = bundled | bundled-fix). null when there is none (the server was restarted).
 */
export async function reportForRecord(root: string, subjectId: string, which: { from: string | null; job: string | null }): Promise<RunReport | null> {
  if (which.from === "bundled") return loadBundledReport(root, subjectId);
  if (which.from === "bundled-fix") return loadBundledFix(root, subjectId);
  const job = getJob(which.job ?? "");
  return job?.status === "done" && job.subjectId === subjectId ? job.report : null;
}
