import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describeRemaining, remainingOf } from "../../lib/fix/verify";
import { VERDICT_LABEL } from "../../lib/judge/verdict";
import type { CaseReport, RunReport } from "../../lib/pipeline";
import { RUN_ID_PATTERN } from "../../lib/runner/run-dir";
import type { CaseExpectation } from "./expected";

// Runs subjects the way `npm run samples` does and compares every case with what is expected.

const root = process.cwd();
const runsRoot = join(root, "runs");
export const LOG_DIR = join(runsRoot, "check");

/** "差なし / 無害（機械）": what is left of the difference, and the verdict with who reached it. */
export function describeCase(c: CaseReport): string {
  const v = c.verdict;
  const verdict = v ? `${VERDICT_LABEL[v.verdict]}（${v.judgedBy.kind === "claude" ? "Claude" : v.judgedBy.kind === "machine" ? "機械" : "判定できず"}）` : "未判定";
  return `${describeRemaining(remainingOf(c))} / ${verdict}`;
}

/** Runs `npm run samples` for one subject and returns the report it wrote. The output goes to runs/check/. */
export async function runSamples(subjectId: string, extra: string[] = []): Promise<RunReport> {
  const before = new Set(await runIds());
  await mkdir(LOG_DIR, { recursive: true });
  const log = join(LOG_DIR, `samples-${subjectId}${extra.join("")}.log`);
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("npx", ["tsx", "scripts/run-samples.ts", "--subject", subjectId, ...extra], { cwd: root });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(text) : reject(new Error(`npm run samples が終了コード ${code}（ログ: runs/check/${log.split("/").at(-1)}）`))));
  });
  await writeFile(log, output);
  for (const id of (await runIds()).filter((id) => !before.has(id)).reverse()) {
    // Another subject running side by side may not have written its report yet.
    const text = await readFile(join(runsRoot, id, "report.json"), "utf8").catch(() => null);
    const report = text ? (JSON.parse(text) as RunReport) : null;
    if (report?.subjectId === subjectId) {
      // A case without a verdict must still say so on the terminal, not just leave the line out.
      const unjudged = report.cases.filter((c) => !c.verdict).length;
      const said = (output.match(/^ {2}未判定 — /gm) ?? []).length;
      if (said !== unjudged) throw new Error(`判定の無い入力 ${unjudged} 件のうち、「未判定」と出たのは ${said} 件（ログ: runs/check/${log.split("/").at(-1)}）`);
      return report;
    }
  }
  throw new Error(`題材 ${subjectId} の新しい実行が runs/ に見つかりません`);
}

/** Every case that is not as expected, as "case: seen (expected …)". Empty when all match. */
export function compareCases(report: RunReport, expected: CaseExpectation): string[] {
  const wrong: string[] = [];
  for (const c of report.cases) {
    const want = expected.cases[c.caseId] ?? expected.default;
    const seen = describeCase(c);
    if (want === undefined) wrong.push(`${c.caseId}: 期待値がありません（${seen}）`);
    else if (seen !== want) wrong.push(`${c.caseId}: ${seen}（期待 ${want}）`);
  }
  for (const id of Object.keys(expected.cases)) {
    if (!report.cases.some((c) => c.caseId === id)) wrong.push(`${id}: 入力がありません`);
  }
  return wrong;
}

/** Notes the machine left on Claude's findings: each one says Claude's reasoning did not hold up. */
export function machineNotes(report: RunReport): string[] {
  return report.cases.flatMap((c) => (c.verdict?.findings ?? []).flatMap((f) => (f.machineNotes ?? []).map((n) => `${c.caseId}: ${n}`)));
}

/** "31 件: 差なし / 無害（機械） 23・…" for the table. */
export function tally(report: RunReport): string {
  const counts = new Map<string, number>();
  for (const c of report.cases) counts.set(describeCase(c), (counts.get(describeCase(c)) ?? 0) + 1);
  return `${report.cases.length} 件: ${[...counts].map(([k, n]) => `${k} ${n}`).join("・")}`;
}

async function runIds(): Promise<string[]> {
  return (await readdir(runsRoot).catch(() => [])).filter((id) => RUN_ID_PATTERN.test(id)).sort();
}
