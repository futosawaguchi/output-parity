import { VERDICT_LABEL } from "@/lib/judge/verdict";
import type { CaseReport } from "@/lib/pipeline";

// With many inputs, what a person must look at comes first and the rest is counted (DESIGN 7-4d:
// "65 本中、見るべきは 1 本"). With a few, the order of the settings is kept: it is the order
// the inputs were written in, and the one a reader expects.

/** Above this many cases the list is sorted by what needs looking at, and harmless ones are folded. */
export const MANY_CASES = 10;

export type Group = "broken" | "needs_review" | "unjudged" | "harmless";
export const ORDER: Group[] = ["broken", "needs_review", "unjudged", "harmless"];
export const GROUP_LABEL: Record<Group, string> = { ...VERDICT_LABEL, unjudged: "未判定" };

/** How many cases there are, and how many in each group, those with none left out (in ORDER). */
export type Tally = { total: number; groups: { group: Group; count: number }[] };

export function groupOf(c: CaseReport): Group {
  return (c.verdict ?? c.carried)?.verdict ?? "unjudged";
}

export function tally(cases: CaseReport[]): Tally {
  const groups = ORDER.map((group) => ({ group, count: cases.filter((c) => groupOf(c) === group).length })).filter((g) => g.count > 0);
  return { total: cases.length, groups };
}

/** "65 件: 壊れている 1・無害 64", groups with none left out. */
export function countLine(cases: CaseReport[]): string {
  const { total, groups } = tally(cases);
  return `${total} 件: ${groups.map((g) => `${GROUP_LABEL[g.group]} ${g.count}`).join("・")}`;
}

/** What needs looking at first, in the settings' order within each group. Kept as is when there are few. */
export function inReadingOrder(cases: CaseReport[]): CaseReport[] {
  if (cases.length <= MANY_CASES) return cases;
  return ORDER.flatMap((g) => cases.filter((c) => groupOf(c) === g));
}
