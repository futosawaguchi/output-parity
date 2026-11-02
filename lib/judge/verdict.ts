/** The three levels of DESIGN 8-1. */
export type Verdict = "harmless" | "needs_review" | "broken";

export const VERDICT_LABEL: Record<Verdict, string> = {
  harmless: "無害",
  needs_review: "要確認",
  broken: "壊れている",
};

const SEVERITY: Record<Verdict, number> = { harmless: 0, needs_review: 1, broken: 2 };

/** The worst verdict in a list. An empty list is harmless: there is nothing to worry about. */
export function worstOf(verdicts: Verdict[]): Verdict {
  return verdicts.reduce<Verdict>((worst, v) => (SEVERITY[v] > SEVERITY[worst] ? v : worst), "harmless");
}

/** One judged finding, in the shape of DESIGN 8-3: what a person needs to check it in seconds. */
export type Finding = {
  verdict: Verdict;
  /** Which compared changes (C1, C2, ...) this finding covers. Empty for findings about the run itself. */
  changeIds: string[];
  what: string;
  why: string;
  /** Lines quoted verbatim from the output. */
  evidence: string[];
  /** The arithmetic behind the verdict, when numbers were involved. */
  calculation: string | null;
  checkHere: string;
};

/** Who reached the verdict: the machine (no judgement needed) or Claude. */
export type JudgedBy = { kind: "machine" } | { kind: "claude"; model: string } | { kind: "failed"; reason: string; nextStep: string };

export type CaseVerdict = {
  caseId: string;
  verdict: Verdict;
  summary: string;
  findings: Finding[];
  judgedBy: JudgedBy;
};
