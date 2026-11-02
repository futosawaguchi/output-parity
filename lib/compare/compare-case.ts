import type { CaseResult, Slot, SlotResult } from "../runner/run-case";
import { applyBaseline, unstableLines, type Change } from "./baseline";
import { ExtractionError, type ExtractedDocument, type Extractor } from "./document";
import { diffLines } from "./line-diff";

export type Comparison =
  | {
      kind: "compared";
      old: ExtractedDocument;
      new: ExtractedDocument;
      /** "unavailable" means nothing was dropped: without a baseline every change is kept. */
      baseline: { kind: "used" } | { kind: "unavailable"; reason: string };
      changes: Change[];
    }
  /** The old or new run produced no output (e.g. it crashed). Not an error: it is the finding. */
  | { kind: "missingOutput"; missing: Slot[] }
  /** An output exists but could not be read. Must surface as "needs review", never as harmless. */
  | { kind: "unreadable"; slot: Slot; message: string };

export type CaseComparison = { caseId: string; runs: SlotResult[]; comparison: Comparison };

/** Convert → baseline → compare, in that order (DESIGN 4-2). */
export async function compareCase(result: CaseResult, extract: Extractor): Promise<CaseComparison> {
  const bySlot = Object.fromEntries(result.slots.map((s) => [s.slot, s])) as Record<Slot, SlotResult>;
  const done = (comparison: Comparison): CaseComparison => ({ caseId: result.caseId, runs: result.slots, comparison });

  const missing = (["old", "new"] as const).filter((slot) => bySlot[slot].outputPath === null);
  if (missing.length > 0) return done({ kind: "missingOutput", missing });

  let oldDoc: ExtractedDocument;
  let newDoc: ExtractedDocument;
  try {
    oldDoc = await extract(bySlot.old.outputPath!);
  } catch (e) {
    return done(unreadable("old", e));
  }
  try {
    newDoc = await extract(bySlot.new.outputPath!);
  } catch (e) {
    return done(unreadable("new", e));
  }

  let unstable = new Set<number>();
  let baseline: Extract<Comparison, { kind: "compared" }>["baseline"] = { kind: "used" };
  const baselinePath = bySlot.baseline.outputPath;
  if (baselinePath === null) {
    baseline = { kind: "unavailable", reason: "ベースライン用の2回目の実行で出力が出ませんでした" };
  } else {
    try {
      unstable = unstableLines(newDoc.lines, (await extract(baselinePath)).lines);
    } catch (e) {
      baseline = { kind: "unavailable", reason: messageOf(e) };
    }
  }

  const changes = applyBaseline(diffLines(oldDoc.lines, newDoc.lines), unstable);
  return done({ kind: "compared", old: oldDoc, new: newDoc, baseline, changes });
}

function unreadable(slot: Slot, e: unknown): Comparison {
  return { kind: "unreadable", slot, message: messageOf(e) };
}

function messageOf(e: unknown): string {
  if (e instanceof ExtractionError) return e.message;
  throw e;
}
