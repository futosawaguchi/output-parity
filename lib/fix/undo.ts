import type { RunReport } from "../pipeline";
import { prepareWorkspace } from "../workspace";

/**
 * Puts work/ back to a fresh copy of the original and returns the report from before any edit
 * (DESIGN 7-4: what was applied can be taken back). Nothing runs; it takes a moment.
 */
export async function undoFixes(report: RunReport, samplesDir: string, workDir: string): Promise<RunReport> {
  const original = report.fixAttempt?.original;
  if (!original) throw new Error("nothing to undo");
  await prepareWorkspace(samplesDir, workDir);
  return original;
}
