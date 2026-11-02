import assert from "node:assert/strict";
import { test } from "node:test";
import type { CaseReport } from "../lib/pipeline";
import { countLine, inReadingOrder, MANY_CASES } from "../app/check/case-order";

const caseOf = (id: string, verdict: "harmless" | "needs_review" | "broken" | null) => ({ caseId: id, verdict: verdict && { verdict } }) as unknown as CaseReport;

test("with many inputs, what needs a look comes first, in the settings' order within each group", () => {
  const cases = [
    ...Array.from({ length: MANY_CASES }, (_, i) => caseOf(`ok-${i}`, "harmless")),
    caseOf("unjudged", null),
    caseOf("doubt", "needs_review"),
    caseOf("broken-1", "broken"),
    caseOf("broken-2", "broken"),
  ];
  assert.deepEqual(inReadingOrder(cases).slice(0, 5).map((c) => c.caseId), ["broken-1", "broken-2", "doubt", "unjudged", "ok-0"]);
  assert.equal(countLine(cases), `${MANY_CASES + 4} 件: 壊れている 2・要確認 1・未判定 1・無害 ${MANY_CASES}`);
});

test("with a few inputs, the order they were written in is kept", () => {
  const cases = [caseOf("a", "harmless"), caseOf("b", "needs_review"), caseOf("c", "broken")];
  assert.deepEqual(inReadingOrder(cases).map((c) => c.caseId), ["a", "b", "c"]);
  assert.equal(countLine(cases), "3 件: 壊れている 1・要確認 1・無害 1");
});
