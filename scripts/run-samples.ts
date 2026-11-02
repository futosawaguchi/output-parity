// Runs every case in samples/parity.config.json, compares the outputs and prints what happened.
// Usage: npm run samples

import { join } from "node:path";
import { extractorFor } from "../lib/compare/adapters";
import { compareCase, type Comparison } from "../lib/compare/compare-case";
import { loadConfig } from "../lib/config";
import { SetupError } from "../lib/errors";
import type { ExecOutcome } from "../lib/runner/exec";
import { runAll } from "../lib/runner/run-all";

const root = process.cwd();
const samplesDir = join(root, "samples");

async function main(): Promise<void> {
  const config = await loadConfig(join(samplesDir, "parity.config.json"));
  const extract = extractorFor(config.output.format);
  const manifest = await runAll(config, samplesDir, join(root, "runs"));

  console.log(`${manifest.configName}`);
  console.log(`記録: ${manifest.runDir}\n`);
  for (const c of manifest.cases) {
    console.log(c.caseId);
    for (const s of c.slots) {
      const label = config.environments[s.env].label;
      const output = s.outputPath ? "出力あり" : "出力なし";
      console.log(`  ${s.slot.padEnd(8)} ${label.padEnd(8)} ${describe(s.outcome)}・${output}（${s.durationMs} ms）`);
    }
    printComparison((await compareCase(c, extract)).comparison);
    console.log();
  }
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

function describe(o: ExecOutcome): string {
  switch (o.kind) {
    case "exited":
      return `終了コード ${o.exitCode}`;
    case "signaled":
      return `シグナル ${o.signal} で終了`;
    case "timedOut":
      return `${o.timeoutMs} ms で打ち切り`;
    case "outputTooLarge":
      return `出力が ${o.maxBufferBytes} バイトを超えたので打ち切り`;
    case "spawnFailed":
      return `起動できませんでした（${o.code}）`;
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
