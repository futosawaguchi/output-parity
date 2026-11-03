import type { ProgressEvent } from "@/lib/pipeline";
import { CASE_CHECKED, CASE_JUDGING } from "@/lib/progress";
import type { Group } from "./case-order";

/** A square's state: a verdict (or none yet) once checked; while running, also waiting or being worked on. */
export type SquareState = Group | "waiting" | "working";

export type Square = { id: string; label: string; state: SquareState };

/**
 * Each input's square and the two counts, from the progress so far. A square is empty until its
 * input starts, pulses while it is worked on, takes its verdict's colour once checked, and stays
 * outlined while it waits for Claude.
 */
export function followProgress(cases: { id: string; label: string }[], progress: ProgressEvent[]) {
  const state = new Map<string, Square["state"]>();
  const comparedIds = new Set<string>();
  const sentToClaude = new Set<string>();
  const judgedIds = new Set<string>();
  let judging: number | null = null;
  for (const p of progress) {
    if (p.judging !== undefined) judging = p.judging;
    if (!p.caseId) continue;
    if (p.message === CASE_CHECKED) {
      comparedIds.add(p.caseId);
      if (sentToClaude.has(p.caseId)) judgedIds.add(p.caseId);
      state.set(p.caseId, p.verdict ?? "unjudged");
    } else {
      if (p.message === CASE_JUDGING) sentToClaude.add(p.caseId);
      state.set(p.caseId, "working");
    }
  }
  const squares: Square[] = cases.map((c) => ({ id: c.id, label: c.label, state: state.get(c.id) ?? "waiting" }));
  return { squares, compared: comparedIds.size, judging, judged: judgedIds.size };
}
