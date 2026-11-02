import { VERDICT_LABEL } from "@/lib/judge/verdict";
import type { CaseReport } from "@/lib/pipeline";

// With many inputs, what a person must look at comes first and the rest is counted (DESIGN 7-4d:
// "65 本中、見るべきは 1 本"). With a few, the order of the settings is kept: it is the order
// the inputs were written in, and the one a reader expects.

/** Above this many cases the list is sorted by what needs looking at, and harmless ones are folded. */
export const MANY_CASES = 10;

type Group = "broken" | "needs_review" | "unjudged" | "harmless";
const ORDER: Group[] = ["broken", "needs_review", "unjudged", "harmless"];
const GROUP_LABEL: Record<Group, string> = { ...VERDICT_LABEL, unjudged: "未判定" };

export function groupOf(c: CaseReport): Group {
  return c.verdict?.verdict ?? "unjudged";
}

/** "65 件: 壊れている 1・無害 64", groups with none left out. */
export function countLine(cases: CaseReport[]): string {
  const counts = ORDER.map((g) => [g, cases.filter((c) => groupOf(c) === g).length] as const).filter(([, n]) => n > 0);
  return `${cases.length} 件: ${counts.map(([g, n]) => `${GROUP_LABEL[g]} ${n}`).join("・")}`;
}

/** What needs looking at first, in the settings' order within each group. Kept as is when there are few. */
export function inReadingOrder(cases: CaseReport[]): CaseReport[] {
  if (cases.length <= MANY_CASES) return cases;
  return ORDER.flatMap((g) => cases.filter((c) => groupOf(c) === g));
}
