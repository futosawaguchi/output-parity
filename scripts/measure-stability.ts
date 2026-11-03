// Measures how steady the judge is: the same bundled outputs are judged again several times, and
// the verdicts are counted per case. The programs do not run, so a difference between rounds can
// only come from the judge (Opus 5.5 takes no temperature, so this is measured, not set).
// Usage: npm run stability -- --subject bookshop --times 5   (default: estimate, 5 times; at most 10)
// ⚠️ Calls Claude (the cases the machine cannot settle) × times. The count is printed before it starts.

import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadBundledReport } from "../lib/bundled";
import { whyNotSending } from "../lib/claude-scope";
import { adaptersForReport } from "../lib/compare/adapters";
import { SetupError } from "../lib/errors";
import { VERDICT_LABEL } from "../lib/judge/verdict";
import { rejudgeBundled } from "../lib/rejudge";
import { loadSubject } from "../lib/subject";

const root = process.cwd();
const runsRoot = join(root, "runs");
const MAX_TIMES = 10;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const { id, config } = await loadSubject(root, arg("--subject"));
  const times = Number(arg("--times") ?? 5);
  if (!Number.isInteger(times) || times < 2 || times > MAX_TIMES) throw new SetupError(`--times は 2〜${MAX_TIMES} にしてください`, "例: --times 5");
  const refused = whyNotSending(config, "judge");
  if (refused) throw new SetupError(refused.message, refused.nextStep);
  const bundled = await loadBundledReport(root, id);
  if (!bundled) throw new SetupError(`題材 ${id} に同梱の結果がありません`, "npm run bundle -- --subject <名前> で作ってから測ってください");

  const byClaude = bundled.cases.filter((c) => c.verdict?.judgedBy.kind === "claude").map((c) => c.caseId);
  console.log(`題材 ${id}: Claude が判定する ${byClaude.length} 件 × ${times} 回 = ${byClaude.length * times} 回 Claude を呼びます`);

  const client = createClient();
  const adapters = adaptersForReport(bundled);
  const rounds: { runId: string; verdicts: Record<string, string> }[] = [];
  for (let round = 1; round <= times; round++) {
    const report = await rejudgeBundled(bundled, { adapters, client, runsRoot });
    if (report.judgeHeld) throw new SetupError(`判定が ${report.judgeHeld.count} 件あり、止まりました`, "測るのは Claude に判定させる入力が 10 件以下の題材だけです");
    const verdicts = Object.fromEntries(report.cases.map((c) => [c.caseId, c.verdict ? `${c.verdict.verdict}（${c.verdict.judgedBy.kind}）` : "未判定"]));
    rounds.push({ runId: report.runId, verdicts });
    console.log(`${round} 回目: 終わりました`);
  }

  // Every case is listed, the machine's too: a verdict that was settled without Claude must not move either.
  const rows = bundled.cases.map((c) => {
    const seen = rounds.map((r) => r.verdicts[c.caseId]);
    return { caseId: c.caseId, bundled: c.verdict?.verdict ?? "未判定", seen, steady: seen.every((v) => v === seen[0]) };
  });
  const claudeRows = rows.filter((r) => byClaude.includes(r.caseId));
  console.log("");
  for (const r of rows) {
    const counts = Object.entries(r.seen.reduce<Record<string, number>>((m, v) => ({ ...m, [v]: (m[v] ?? 0) + 1 }), {}));
    console.log(`${r.steady ? "  " : "⚠️"} ${r.caseId}: ${counts.map(([v, n]) => `${label(v)} ${n}`).join("・")}`);
  }
  const steady = claudeRows.filter((r) => r.steady).length;
  console.log(`\nClaude が判定した ${claudeRows.length} 件のうち、${times} 回とも同じ判定だったのは ${steady} 件`);

  await mkdir(join(runsRoot, "stability"), { recursive: true });
  const out = join(runsRoot, "stability", `${new Date().toISOString().replace(/[:.]/g, "-")}-${id}.json`);
  await writeFile(out, JSON.stringify({ subjectId: id, times, rounds, rows }, null, 2) + "\n");
  console.log(`記録: ${out}`);
}

function label(v: string): string {
  const [verdict, rest] = v.split("（");
  return (VERDICT_LABEL as Record<string, string>)[verdict] ? `${(VERDICT_LABEL as Record<string, string>)[verdict]}（${rest}` : v;
}

function createClient(): Anthropic {
  if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new SetupError("API キーが設定されていません", ".env の ANTHROPIC_API_KEY を設定してください（.env.example を参照）");
  }
  return new Anthropic();
}

main().catch((e) => {
  if (e instanceof SetupError) {
    console.error(`${e.message}\n→ ${e.nextStep}`);
    process.exit(1);
  }
  throw e;
});
