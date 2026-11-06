// Everything the regression check covers (.claude/skills/regression-check), in one command, with
// the table at the end (also saved to runs/check/). Calls Claude about six times. About ten minutes;
// meant to run in the background at milestones and before a push.
// Usage: npm run check:all
//
// Uses ports 3100 (this repository, built) and 3200 (a fresh clone of the committed state, as a
// judge would have it). The dev server on 3000 is left alone, but the checks share work/ and runs/:
// do not press buttons on the dev page meanwhile.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openBrowser } from "./browser";
import { run } from "./command";
import { WITH_CLAUDE, WITHOUT_CLAUDE } from "./expected";
import { claudeFlows, sendScopeChecks, tcpdfOnPage, withoutPhpFlows } from "./flows";
import { quickChecks } from "./quick";
import { Results, expect } from "./results";
import { compareCases, LOG_DIR, machineNotes, runSamples, tally } from "./samples";
import { screenChecks } from "./screen";
import { buildApp, startApp, type Server } from "./server";

const root = process.cwd();
const cloneDir = join(tmpdir(), "output-parity-check-clone");

async function main(): Promise<void> {
  const results = new Results();
  const started = Date.now();
  await quickChecks(results);

  // These do not touch each other: the CLI runs use work/ and runs/, the builds use .next/.
  const [, , localBuilt, cloneBuilt] = await Promise.all([
    results.step("3", "見積書を Claude ありで（npm run samples -- --judge）", async () => {
      const report = await runSamples("estimate", ["--judge"]);
      const wrong = compareCases(report, WITH_CLAUDE);
      expect(wrong.length === 0, wrong.join("／"));
      const notes = machineNotes(report);
      expect(notes.length === 0, `機械が Claude の根拠を崩した: ${notes.join("／")}`);
      return tally(report);
    }),
    results.step("5a", "TCPDF の例 65 本（npm run samples）", async () => {
      const report = await runSamples("tcpdf-examples");
      const wrong = compareCases(report, WITHOUT_CLAUDE["tcpdf-examples"]);
      expect(wrong.length === 0, wrong.slice(0, 5).join("／"));
      return tally(report);
    }),
    results.step("4-", "画面のサーバを組み立てる（ポート 3100）", async () => void (await buildApp(root))),
    results.step("6-", "コミット済みの状態を clone して npm ci と build（審査員のローカル環境）", async () => {
      await rm(cloneDir, { recursive: true, force: true });
      await run("git", ["clone", "-q", root, cloneDir]);
      await run("npm", ["ci", "--silent"], { cwd: cloneDir });
      const build = await run("npx", ["next", "build"], { cwd: cloneDir });
      const warnings = (build.match(/Dynamic filesystem access/g) ?? []).length;
      return `build の警告「Dynamic filesystem access」${warnings} 件（既知は 5 件）`;
    }),
  ]);

  const browser = await openBrowser();
  const servers: Server[] = [];
  try {
    await Promise.all([
      (async () => {
        if (!localBuilt) return;
        const local = await startApp(root, 3100);
        servers.push(local);
        // Before any job of these subjects exists in this server: the page shows the bundles.
        await screenChecks(results, local.base, browser, "local");
        await withoutPhpFlows(results, local.base, browser, root);
        await sendScopeChecks(results, local.base, root);
        await claudeFlows(results, local.base, browser, root);
        await tcpdfOnPage(results, local.base, browser);
      })(),
      (async () => {
        if (!cloneBuilt) return;
        const clone = await startApp(cloneDir, 3200);
        servers.push(clone);
        await screenChecks(results, clone.base, browser, "clone");
      })(),
    ]);
  } finally {
    await browser.close();
    await Promise.all(servers.map((s) => s.stop()));
    await rm(cloneDir, { recursive: true, force: true });
  }

  const table = `${results.table()}\n\n所要 ${Math.round((Date.now() - started) / 60000)} 分。clone はコミット済みの内容です（まだコミットしていない変更は 6 に入りません）。`;
  await mkdir(LOG_DIR, { recursive: true });
  const file = join(LOG_DIR, `check-all-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  await writeFile(file, `${table}\n`);
  console.log(`\n${table}\n（表は ${file.slice(root.length + 1)} にも残しました）`);
  process.exit(results.failed === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
