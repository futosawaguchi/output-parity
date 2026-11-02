// Runs every case in samples/parity.config.json and prints what happened.
// Usage: npm run samples

import { join } from "node:path";
import { loadConfig } from "../lib/config";
import { SetupError } from "../lib/errors";
import type { ExecOutcome } from "../lib/runner/exec";
import { runAll } from "../lib/runner/run-all";

const root = process.cwd();
const samplesDir = join(root, "samples");

async function main(): Promise<void> {
  const config = await loadConfig(join(samplesDir, "parity.config.json"));
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
