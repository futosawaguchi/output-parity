import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { findSubjectDir } from "./subject";
import type { RunReport } from "./pipeline";

// The run that ships with the repository (DESIGN 7-2b), so the report can be seen without
// PHP, composer or an API key. Made by scripts/bundle-run.ts from one finished run.

/** Stands in for a run id: the outputs route serves this one from the bundle, not from runs/. */
export const BUNDLED_RUN_ID = "bundled";

/** The bundled run of a subject: <subject>/bundled/. It may not exist. Found without reading the settings. */
export async function bundledDir(root: string, subjectId?: string): Promise<string | null> {
  const dir = await findSubjectDir(root, subjectId);
  return dir && join(dir, "bundled");
}

/**
 * The bundled report, with its file paths made absolute again. The paths are stored relative
 * to the bundle so that no one's home directory ends up in the repository.
 * null when there is no bundle.
 */
export async function loadBundledReport(root: string, subjectId?: string): Promise<RunReport | null> {
  const dir = await bundledDir(root, subjectId);
  if (!dir) return null;
  const text = await readFile(join(dir, "report.json"), "utf8").catch(() => null);
  if (text === null) return null;
  const report: RunReport = { ...(JSON.parse(text) as RunReport), origin: "bundled" };
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
