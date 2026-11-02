// Runs every case in samples/parity.config.json, compares the outputs and prints what happened.
// Usage: npm run samples            run and compare (no API calls)
//        npm run samples -- --judge also ask Claude to judge (uses ANTHROPIC_API_KEY from .env)

import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { adapterFor } from "../lib/compare/adapters";
import { compareCase, type Comparison } from "../lib/compare/compare-case";
import { loadConfig } from "../lib/config";
import { SetupError } from "../lib/errors";
import { judgeCase } from "../lib/judge/judge-case";
import { VERDICT_LABEL, type CaseVerdict } from "../lib/judge/verdict";
import { describeOutcome } from "../lib/runner/exec";
import { runAll } from "../lib/runner/run-all";

const root = process.cwd();
const samplesDir = join(root, "samples");
const withJudge = process.argv.includes("--judge");

async function main(): Promise<void> {
  const config = await loadConfig(join(samplesDir, "parity.config.json"));
  const adapter = adapterFor(config.output.format);
  const client = withJudge ? createClient() : null;
  const manifest = await runAll(config, samplesDir, join(root, "runs"));

  console.log(`${manifest.configName}`);
  console.log(`記録: ${manifest.runDir}\n`);
  const verdicts: CaseVerdict[] = [];
  for (const c of manifest.cases) {
    console.log(c.caseId);
    for (const s of c.slots) {
      const label = config.environments[s.env].label;
      const output = s.outputPath ? "出力あり" : "出力なし";
      console.log(`  ${s.slot.padEnd(8)} ${label.padEnd(8)} ${describeOutcome(s.outcome)}・${output}（${s.durationMs} ms）`);
    }
    const compared = await compareCase(c, adapter.extract);
    printComparison(compared.comparison);
    if (client) {
      const verdict = await judgeCase(compared, {
        client,
        oldLabel: config.environments.old.label,
        newLabel: config.environments.new.label,
        outputDescription: adapter.description,
      });
      printVerdict(verdict);
      verdicts.push(verdict);
    }
    console.log();
  }
  if (client) await writeFile(join(manifest.runDir, "verdicts.json"), JSON.stringify(verdicts, null, 2) + "\n");
}

function createClient(): Anthropic {
  if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new SetupError("API キーが設定されていません", ".env の ANTHROPIC_API_KEY を設定してください（.env.example を参照）");
  }
  return new Anthropic();
}

function printComparison(c: Comparison): void {
  switch (c.kind) {
    case "missingOutput":
      console.log(`  比較: できません（${c.missing.join("・")} の出力がありません）`);
      return;
    case "unreadable":
      console.log(`  比較: できません（${c.slot} の出力が読めません: ${c.message}）`);
      return;
    case "compared": {
      const kept = c.changes.filter((ch) => !ch.explainedByBaseline);
      const dropped = c.changes.filter((ch) => ch.explainedByBaseline);
      const baseline = c.baseline.kind === "used" ? "" : `（⚠️ ベースライン無し: ${c.baseline.reason}）`;
      const lines = kept.reduce((n, ch) => n + Math.max(ch.oldLines.length, ch.newLines.length), 0);
      console.log(`  比較: 残った差 ${kept.length} か所（${lines} 行）・ベースラインで落とした差 ${dropped.length} か所${baseline}`);
      for (const ch of kept) {
        for (const line of ch.oldLines) console.log(`    - ${line}`);
        for (const line of ch.newLines) console.log(`    + ${line}`);
      }
      for (const ch of dropped) {
        console.log(`    （落とした）${ch.newLines.join(" / ")}`);
      }
      for (const u of [...c.old.unreadable, ...c.new.unreadable]) console.log(`    ⚠️ 読めなかった部分: ${u}`);
    }
  }
}

function printVerdict(v: CaseVerdict): void {
  const by = v.judgedBy.kind === "claude" ? `Claude（${v.judgedBy.model}）` : v.judgedBy.kind === "machine" ? "機械" : "判定失敗";
  console.log(`  判定: ${VERDICT_LABEL[v.verdict]} — ${v.summary}（${by}）`);
  if (v.judgedBy.kind === "failed") console.log(`    → ${v.judgedBy.nextStep}`);
  for (const f of v.findings) {
    const ids = f.changeIds.length > 0 ? `[${f.changeIds.join(",")}] ` : "";
    console.log(`    ${ids}${VERDICT_LABEL[f.verdict]}: ${f.what}`);
    console.log(`      理由: ${f.why}`);
    for (const e of f.evidence) console.log(`      根拠:「${e}」`);
    if (f.calculation) console.log(`      計算: ${f.calculation}`);
    console.log(`      見る場所: ${f.checkHere}`);
  }
}


main().catch((e: unknown) => {
  if (e instanceof SetupError) {
    console.error(`${e.message}\n→ ${e.nextStep}`);
  } else {
    console.error(e);
  }
  process.exitCode = 1;
});
