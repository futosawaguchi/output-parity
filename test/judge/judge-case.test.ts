import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Change } from "../../lib/compare/baseline";
import type { CaseComparison } from "../../lib/compare/compare-case";
import { judgeByMachine, judgeCase, reviewByMachine } from "../../lib/judge/judge-case";
import type { JudgeResponse } from "../../lib/judge/schema";
import type { Finding } from "../../lib/judge/verdict";

// The safety rules around Claude are deterministic, so they are tested with a stand-in for Claude.

const OLD = ["A-100 基本料 15,000", "A-101 出張費 8,000", "合計 23,000"];
const NEW = ["A-100 基本料 15,000", "合計 23,000"];
const removed: Change = { oldStart: 1, newStart: 1, oldLines: ["A-101 出張費 8,000"], newLines: [], explainedByBaseline: false } as Change;

const compared = (changes: Change[]): CaseComparison =>
  ({
    caseId: "c",
    runs: [
      { slot: "old", outcome: { kind: "exited", exitCode: 0 } },
      { slot: "new", outcome: { kind: "exited", exitCode: 0 } },
    ],
    comparison: {
      kind: "compared",
      old: { lines: OLD, pages: [], unreadable: [] },
      new: { lines: NEW, pages: [], unreadable: [] },
      baseline: { kind: "used" },
      changes,
    },
  }) as unknown as CaseComparison;

/** A client whose only call returns `answer`, or throws it if it is an error. */
const fakeClient = (answer: JudgeResponse | Error) =>
  ({
    beta: {
      messages: {
        parse: async () => {
          if (answer instanceof Error) throw answer;
          return { stop_reason: "end_turn", parsed_output: answer, model: "stand-in" };
        },
      },
    },
  }) as unknown as Anthropic;

const ctx = (client: Anthropic) => ({ client, oldLabel: "旧", newLabel: "新", outputDescription: "テキスト" });

test("when Claude cannot be reached, every change is needs review, never harmless", async () => {
  const v = await judgeCase(compared([removed]), ctx(fakeClient(new Anthropic.APIConnectionError({ message: "offline" }))));
  assert.equal(v.verdict, "needs_review");
  assert.equal(v.judgedBy.kind, "failed");
  assert.deepEqual(v.findings.map((f) => f.verdict), ["needs_review"]);
});

test("a change Claude did not mention comes back as needs review", async () => {
  const v = await judgeCase(compared([removed]), ctx(fakeClient({ summary: "問題なし", findings: [] })));
  assert.equal(v.verdict, "needs_review");
  assert.deepEqual(v.findings[0].changeIds, ["C1"]);
});

test("change ids Claude made up are dropped from its findings", async () => {
  const answer: JudgeResponse = {
    summary: "s",
    findings: [{ change_ids: ["C1", "C9"], verdict: "broken", what: "w", why: "y", evidence: ["A-101 出張費 8,000"], calculation: null, check_here: "h" }],
  };
  const v = await judgeCase(compared([removed]), ctx(fakeClient(answer)));
  assert.deepEqual(v.findings[0].changeIds, ["C1"]);
});

test("no difference left: harmless without asking Claude", async () => {
  const v = await judgeCase(compared([]), ctx(fakeClient(new Error("must not be called"))));
  assert.equal(v.verdict, "harmless");
  assert.equal(v.judgedBy.kind, "machine");
});

test("the same output with a different ending is needs review, with both endings as evidence", async () => {
  const c = compared([]);
  (c.runs[1] as { outcome: unknown }).outcome = { kind: "exited", exitCode: 255 };
  const v = await judgeByMachine(c, { oldLabel: "旧", newLabel: "新" });
  assert.equal(v?.verdict, "needs_review");
  assert.deepEqual(v?.findings[0].evidence.slice(0, 2), ["旧: 終了コード 0", "新: 終了コード 255"]);
});

test("a page that now redirects elsewhere is not harmless, even with the same body", async () => {
  const c = compared([]);
  (c.runs[0] as { outcome: unknown }).outcome = { kind: "http", status: 302, location: "/order.php?id=1" };
  (c.runs[1] as { outcome: unknown }).outcome = { kind: "http", status: 302, location: "/index.php" };
  assert.equal((await judgeByMachine(c, { oldLabel: "旧", newLabel: "新" }))?.verdict, "needs_review");
});

test("no difference in text the encoding could not read is needs review, not harmless", async () => {
  const c = compared([]);
  if (c.comparison.kind === "compared") c.comparison.new.undecodable = 4;
  const v = await judgeByMachine(c, { oldLabel: "旧", newLabel: "新" });
  assert.equal(v?.verdict, "needs_review");
  assert.match(v?.findings[0].checkHere ?? "", /output\.encoding/);
});

const harmless: Finding = { verdict: "harmless", changeIds: ["C1"], what: "w", why: "y", evidence: ["合計 23,000"], calculation: "15,000 + 8,000 = 23,000", checkHere: "h" };

test("a harmless finding whose grounds hold stays harmless", () => {
  assert.equal(reviewByMachine(harmless, [...OLD, ...NEW]).verdict, "harmless");
});

test("a harmless finding quoting text that is not in the output is raised to needs review", () => {
  const f = reviewByMachine({ ...harmless, evidence: ["合計 99,000"] }, [...OLD, ...NEW]);
  assert.equal(f.verdict, "needs_review");
  assert.match(f.machineNotes!.join(), /見つかりません/);
});

test("a harmless finding whose arithmetic does not hold is raised to needs review", () => {
  assert.equal(reviewByMachine({ ...harmless, calculation: "15,000 + 8,000 = 24,000" }, OLD).verdict, "needs_review");
});

test("a broken finding is never lowered, only annotated", () => {
  const f = reviewByMachine({ ...harmless, verdict: "broken", evidence: ["存在しない行"] }, OLD);
  assert.equal(f.verdict, "broken");
  assert.equal(f.machineNotes!.length, 1);
});

test("without Claude, a difference that needs judgement is left unjudged, not guessed", async () => {
  assert.equal(await judgeByMachine(compared([removed]), { oldLabel: "旧", newLabel: "新" }), null);
  assert.equal((await judgeByMachine(compared([]), { oldLabel: "旧", newLabel: "新" }))?.verdict, "harmless");
});

test("what is sent is masked first, and kept exactly as sent", async () => {
  const leaking = { ...removed, oldLines: ["DB_PASSWORD=hunter2"] } as Change;
  let seen = "";
  const client = {
    beta: {
      messages: {
        parse: async (req: { messages: { content: string }[] }) => {
          seen = req.messages[0].content;
          return { stop_reason: "end_turn", parsed_output: { summary: "s", findings: [] }, model: "stand-in" };
        },
      },
    },
  } as unknown as Anthropic;
  const kept: { text: string; masked: number }[] = [];
  const record = async (r: { caseId: string; purpose: "judge" | "cause"; text: string; masked: number; maskedKinds: string[] }) => {
    kept.push(r);
    return { purpose: r.purpose, at: "", file: "f.txt", chars: r.text.length, masked: r.masked, maskedKinds: r.maskedKinds };
  };
  const v = await judgeCase(compared([leaking]), { ...ctx(client), record });
  assert.ok(!seen.includes("hunter2") && seen.includes("DB_PASSWORD=***"));
  assert.ok(kept[0].text.endsWith(seen));
  assert.equal(kept[0].masked, 1);
  assert.equal(v.sent?.file, "f.txt");
});

const allHarmless: JudgeResponse = {
  summary: "問題なし",
  findings: [{ verdict: "harmless", change_ids: ["C1"], what: "w", why: "y", evidence: ["合計 23,000"], calculation: null, check_here: "h" }],
};

test("a harmless answer from Claude does not clear a different ending", async () => {
  const c = compared([removed]);
  (c.runs[1] as { outcome: unknown }).outcome = { kind: "exited", exitCode: 255 };
  const v = await judgeCase(c, ctx(fakeClient(allHarmless)));
  assert.equal(v.verdict, "needs_review");
  assert.ok(v.findings.some((f) => f.what.startsWith("終わり方が違います")));
});

test("a harmless answer from Claude does not clear text the encoding could not read", async () => {
  const c = compared([removed]);
  if (c.comparison.kind === "compared") c.comparison.new.undecodable = 2;
  const v = await judgeCase(c, ctx(fakeClient(allHarmless)));
  assert.equal(v.verdict, "needs_review");
});

test("a broken answer from Claude stays broken when the ending also differs", async () => {
  const c = compared([removed]);
  (c.runs[1] as { outcome: unknown }).outcome = { kind: "exited", exitCode: 255 };
  const broken: JudgeResponse = { ...allHarmless, findings: [{ ...allHarmless.findings[0], verdict: "broken" }] };
  assert.equal((await judgeCase(c, ctx(fakeClient(broken)))).verdict, "broken");
});

test("an answer the SDK cannot parse makes that case needs review instead of stopping the run", async () => {
  const unreadable = new Anthropic.AnthropicError("Failed to parse structured output: Unexpected end of JSON input");
  const v = await judgeCase(compared([removed]), ctx(fakeClient(unreadable)));
  assert.equal(v.verdict, "needs_review");
  assert.equal(v.judgedBy.kind, "failed");
});
