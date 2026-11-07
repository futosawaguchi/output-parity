import type Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { sep } from "node:path";
import type { Change } from "../compare/baseline";
import type { CaseComparison } from "../compare/compare-case";
import { redactSecrets } from "../redact";
import { describeOutcome, differentEndings } from "../runner/outcome";
import type { Slot, SlotResult } from "../runner/run-case";
import type { SentRecorder } from "../sent-log";
import { checkArithmetic } from "./arithmetic";
import { askClaude } from "./call-claude";
import { buildUserMessage, changeId, excerptFor, SYSTEM_PROMPT, type JudgeInput } from "./prompt";
import type { JudgeResponse } from "./schema";
import { worstOf, type CaseVerdict, type Finding } from "./verdict";

export type JudgeContext = {
  client: Anthropic;
  oldLabel: string;
  newLabel: string;
  outputDescription: string;
  /** Keeps what is sent (DESIGN 7-4e ④). Left out in tests. */
  record?: SentRecorder;
};

type Labels = Pick<JudgeContext, "oldLabel" | "newLabel">;

/**
 * The verdicts the machine reaches on its own: no difference left, no output, unreadable output,
 * and the same output reached by a different ending or read through a wrong encoding (needs review).
 * null when only judgement can decide. Used without Claude too (the run after an edit).
 */
export async function judgeByMachine(c: CaseComparison, ctx: Labels): Promise<CaseVerdict | null> {
  const cmp = c.comparison;
  const run = (slot: Slot) => c.runs.find((r) => r.slot === slot)!;

  if (cmp.kind === "missingOutput") return judgeMissingOutput(c.caseId, cmp.missing, run, ctx);

  if (cmp.kind === "unreadable") {
    return machine(c.caseId, "needs_review", "出力が読めなかったので、比べられませんでした", [
      finding("needs_review", `${labelOf(cmp.slot, ctx)} の出力をテキストにできませんでした`, cmp.message, [], "出力ファイルそのもの"),
    ]);
  }

  const kept = cmp.changes.filter((ch) => !ch.explainedByBaseline);
  const dropped = cmp.changes.filter((ch) => ch.explainedByBaseline);
  if (kept.length > 0) return null;
  // "No difference" holds only for what the machine compared: how the runs ended, and text it could decode.
  const [floor] = await machineFloors(c, ctx, false);
  if (floor) return machine(c.caseId, "needs_review", floor.what, [floor]);
  const note = dropped.length > 0 ? `（毎回変わる値 ${dropped.length} か所は除外）` : "";
  return machine(c.caseId, "harmless", `旧と新の出力に違いはありません${note}`, []);
}

/**
 * What the comparison of the text cannot see, as "needs review" findings: the runs ended
 * differently, or part of the output could not be decoded. These hold with or without differences
 * in the text, so a "harmless" from Claude about the text cannot clear them.
 */
async function machineFloors(c: CaseComparison, ctx: Labels, textDiffers: boolean): Promise<Finding[]> {
  const cmp = c.comparison as Extract<CaseComparison["comparison"], { kind: "compared" }>;
  const floors: Finding[] = [];
  const ending = differentEndings(c.runs);
  if (ending) {
    const what = `${textDiffers ? "" : "出力は同じですが、"}終わり方が違います（${ctx.oldLabel}: ${ending.old}／${ctx.newLabel}: ${ending.new}）`;
    const newRun = c.runs.find((r) => r.slot === "new")!;
    floors.push(
      finding("needs_review", what, "出力のあとで失敗した・別のページへ移すようになった、などは出力の比較には出ません", [`${ctx.oldLabel}: ${ending.old}`, `${ctx.newLabel}: ${ending.new}`, ...(await stderrHead(newRun))], "実行の記録（終了コード・HTTP の状態・stderr）"),
    );
  }
  const misread = [
    ...(cmp.old.undecodable ? [`${ctx.oldLabel}: 読めない文字 ${cmp.old.undecodable} か所`] : []),
    ...(cmp.new.undecodable ? [`${ctx.newLabel}: 読めない文字 ${cmp.new.undecodable} か所`] : []),
  ];
  if (misread.length > 0) {
    const what = `${textDiffers ? "" : "差は見つかりませんでしたが、"}文字コードとして読めない部分があります`;
    floors.push(finding("needs_review", what, "読めない文字はどれも同じ記号（�）になるので、その部分の違いは比べられていません", misread, "設定の output.encoding（出力の文字コード）"));
  }
  return floors;
}

/**
 * Turns one compared case into a verdict. Claude is asked only when judgement is needed:
 * a crash or an empty difference is decided by the machine (DESIGN 4 / 4-3).
 */
export async function judgeCase(c: CaseComparison, ctx: JudgeContext): Promise<CaseVerdict> {
  const byMachine = await judgeByMachine(c, ctx);
  if (byMachine) return byMachine;
  const cmp = c.comparison as Extract<CaseComparison["comparison"], { kind: "compared" }>;
  const run = (slot: Slot) => c.runs.find((r) => r.slot === slot)!;
  const kept = cmp.changes.filter((ch) => !ch.explainedByBaseline);
  const dropped = cmp.changes.filter((ch) => ch.explainedByBaseline);

  const input: JudgeInput = {
    oldLabel: ctx.oldLabel,
    newLabel: ctx.newLabel,
    outputDescription: ctx.outputDescription,
    oldExit: describeOutcome(run("old").outcome),
    newExit: describeOutcome(run("new").outcome),
    oldLines: cmp.old.lines,
    newLines: cmp.new.lines,
    kept,
    dropped,
    oldPages: cmp.old.pages,
    newPages: cmp.new.pages,
    unreadable: [...cmp.old.unreadable.map((u) => `旧 ${u}`), ...cmp.new.unreadable.map((u) => `新 ${u}`)],
    excerpt: excerptFor(cmp.new.lines),
  };
  // Said on the page with the verdict: Claude did not read the whole output (DESIGN 3-②).
  const excerpt = input.excerpt === null ? {} : { excerpt: { around: input.excerpt, totalLines: cmp.new.lines.length } };
  // Secrets are masked before anything leaves the machine, and what leaves is kept (DESIGN 7-4e ③④).
  const message = redactSecrets(buildUserMessage(input));
  const sent = await ctx.record?.({
    caseId: c.caseId,
    purpose: "judge",
    text: `${SYSTEM_PROMPT}\n\n---\n\n${message.text}`,
    masked: message.count,
    maskedKinds: message.kinds,
  });
  const answer = await askClaude(ctx.client, SYSTEM_PROMPT, message.text);
  const ids = kept.map((_, i) => changeId(i));

  if (answer.kind === "failed") {
    // DESIGN 8-5 G2: when judging fails, every change becomes "needs review", never "harmless".
    const { reason, nextStep } = answer.failure;
    return {
      caseId: c.caseId,
      verdict: "needs_review",
      summary: `判定できませんでした: ${reason}`,
      findings: ids.map((id, i) =>
        finding("needs_review", `変更 ${id} は判定できませんでした`, reason, [...kept[i].oldLines, ...kept[i].newLines], "変更された行", [id]),
      ),
      judgedBy: { kind: "failed", reason, nextStep },
      sent,
      ...excerpt,
    };
  }

  // Claude saw the masked text, so a quote of it is a quote of the output.
  const raw = [...cmp.old.lines, ...cmp.new.lines];
  const quotable = [...raw, ...raw.map((l) => redactSecrets(l).text)];
  const findings = [
    ...fromClaude(answer.response, ids).map((f) => reviewByMachine(f, quotable)),
    ...unanswered(answer.response, ids, kept),
    // What the machine knows outside the compared text holds whatever Claude says about the text.
    ...(await machineFloors(c, ctx, true)),
  ];
  return {
    caseId: c.caseId,
    verdict: worstOf(findings.map((f) => f.verdict)),
    summary: answer.response.summary,
    findings,
    judgedBy: { kind: "claude", model: answer.model },
    sent,
    ...excerpt,
  };
}

function fromClaude(response: JudgeResponse, ids: string[]): Finding[] {
  const known = new Set(ids);
  return response.findings.map((f) => ({
    verdict: f.verdict,
    changeIds: f.change_ids.filter((id) => known.has(id)),
    what: f.what,
    why: f.why,
    evidence: f.evidence,
    calculation: f.calculation,
    checkHere: f.check_here,
  }));
}

/**
 * The machine checks what it can of Claude's finding: the arithmetic and the quotes (DESIGN 8-3).
 * A finding Claude calls harmless but whose own grounds do not hold cannot stay harmless.
 * Nothing is lowered: a broken finding stays broken, with the note shown.
 */
export function reviewByMachine(f: Finding, outputLines: string[]): Finding {
  const notes: string[] = [];
  const wrong = f.calculation ? checkArithmetic(f.calculation).filter((c) => !c.ok) : [];
  if (wrong.length > 0) notes.push(`計算が合いません: ${wrong.map((c) => c.text).join("、")}`);
  // Spacing differs between how a line was grouped and how it was quoted, so it is ignored.
  const squash = (t: string) => t.replace(/\s+/g, "");
  const lines = outputLines.map(squash);
  const missing = f.evidence.filter((e) => squash(e) !== "" && !lines.some((l) => l.includes(squash(e))));
  if (missing.length > 0) notes.push(`根拠の引用が出力に見つかりません: ${missing.map((e) => `「${e}」`).join("")}`);
  if (notes.length === 0) return f;
  if (f.verdict !== "harmless") return { ...f, machineNotes: notes };
  return { ...f, verdict: "needs_review", machineNotes: [...notes, "Claude は無害としていましたが、要確認に上げました"] };
}

/** Changes Claude did not mention are not dropped silently (CLAUDE.md, DESIGN 8-5 G2). */
function unanswered(response: JudgeResponse, ids: string[], kept: Change[]): Finding[] {
  const covered = new Set(response.findings.flatMap((f) => f.change_ids));
  return ids.flatMap((id, i) =>
    covered.has(id)
      ? []
      : [finding("needs_review", `変更 ${id} に判定が返ってきませんでした`, "Claude の返事にこの変更が含まれていませんでした", [...kept[i].oldLines, ...kept[i].newLines], "変更された行", [id])],
  );
}

async function judgeMissingOutput(
  caseId: string,
  missing: Slot[],
  run: (slot: Slot) => SlotResult,
  ctx: Labels,
): Promise<CaseVerdict> {
  if (missing.length === 2) {
    return machine(caseId, "needs_review", "旧でも新でも出力が出ませんでした", [
      finding("needs_review", "どちらの環境でも出力が出ませんでした", "移行の前から動いていない可能性があり、移行の影響かは決められません", await stderrHead(run("new")), "実行の記録（stderr）"),
    ]);
  }
  const slot = missing[0];
  const other = slot === "new" ? "old" : "new";
  const r = run(slot);
  const verdict = slot === "new" ? "broken" : "needs_review";
  const what = `${labelOf(slot, ctx)} では出力が出ませんでした（${describeOutcome(r.outcome)}）`;
  const why =
    slot === "new"
      ? `${labelOf(other, ctx)} では出力が出ていたので、移行で動かなくなっています`
      : `${labelOf(other, ctx)} でだけ出力が出ました。移行で直った可能性もありますが、決められません`;
  return machine(caseId, verdict, what, [finding(verdict, what, why, await stderrHead(r), "実行の記録（stderr）")]);
}

function machine(caseId: string, verdict: CaseVerdict["verdict"], summary: string, findings: Finding[]): CaseVerdict {
  return { caseId, verdict, summary, findings, judgedBy: { kind: "machine" } };
}

function finding(
  verdict: Finding["verdict"],
  what: string,
  why: string,
  evidence: string[],
  checkHere: string,
  changeIds: string[] = [],
): Finding {
  return { verdict, changeIds, what, why, evidence, calculation: null, checkHere };
}

async function stderrHead(r: SlotResult, lines = 3): Promise<string[]> {
  const text = await readFile(r.stderrPath, "utf8").catch(() => "");
  // Paths are shown relative to the repository: the absolute ones carry the user's home directory.
  const repo = process.cwd() + sep;
  return [...new Set(text.split("\n").map((l) => l.trim().split(repo).join("")).filter(Boolean))].slice(0, lines);
}

function labelOf(slot: Slot, ctx: Labels): string {
  return slot === "old" ? ctx.oldLabel : ctx.newLabel;
}
