import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { findSubjectDir } from "./subject";
import type { RunReport } from "./pipeline";

// The run that ships with the repository (DESIGN 7-2b), so the report can be seen without
// PHP, composer or an API key. Made by scripts/bundle-run.ts from finished runs:
//   bundled/report.json       a judged run, with the cause of a case found by Claude
//   bundled/fix/report.json   the run after applying that cause's edit (optional), so the whole
//                             round trip (cause → applied → fixed) can be followed without PHP

/** Stand in for run ids: the outputs route serves these from the bundle, not from runs/. */
export const BUNDLED_RUN_ID = "bundled";
export const BUNDLED_FIX_RUN_ID = "bundled-fix";
export const BUNDLED_FIX_DIR = "fix";

/** The bundled run of a subject: <subject>/bundled/. It may not exist. Found without reading the settings. */
export async function bundledDir(root: string, subjectId: string): Promise<string | null> {
  const dir = await findSubjectDir(root, subjectId);
  return dir && join(dir, "bundled");
}

/** The bundled report. null when there is no bundle. */
export async function loadBundledReport(root: string, subjectId: string): Promise<RunReport | null> {
  const dir = await bundledDir(root, subjectId);
  return dir ? readReport(dir, subjectId) : null;
}

/**
 * The bundled run after an edit, with the bundled report as the one to go back to.
 * null when only a judged run was bundled.
 */
export async function loadBundledFix(root: string, subjectId: string): Promise<RunReport | null> {
  const dir = await bundledDir(root, subjectId);
  if (!dir) return null;
  const [before, after] = await Promise.all([readReport(dir, subjectId), readReport(join(dir, BUNDLED_FIX_DIR), subjectId)]);
  if (!before || !after?.fixAttempt) return null;
  return { ...after, fixAttempt: { ...after.fixAttempt, original: before } };
}

/**
 * A report with its file paths made absolute again. The paths are stored relative to the
 * bundle so that no one's home directory ends up in the repository. The subject is the one the
 * bundle was found in, whatever the file says: a bundle can be moved to another subject's folder.
 */
async function readReport(dir: string, subjectId: string): Promise<RunReport | null> {
  const text = await readFile(join(dir, "report.json"), "utf8").catch(() => null);
  if (text === null) return null;
  const report: RunReport = { ...(JSON.parse(text) as RunReport), origin: "bundled", subjectId };
  const resolve = (p: string) => (isAbsolute(p) ? p : join(dir, p));
  for (const c of report.cases) {
    for (const r of c.runs) {
      r.outputPath = r.outputPath && resolve(r.outputPath);
      r.stdoutPath = resolve(r.stdoutPath);
      r.stderrPath = resolve(r.stderrPath);
    }
  }
  return report;
}
