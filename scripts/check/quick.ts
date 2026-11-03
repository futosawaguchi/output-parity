// The quick check, after every change (regression check 1, 2, 2b): tests, types, lint, and the
// subjects run without Claude, every case compared with what is expected. About two minutes.
// Usage: npm run check

import { run } from "./command";
import { WITHOUT_CLAUDE } from "./expected";
import { Results, expect } from "./results";
import { compareCases, runSamples, tally } from "./samples";

export async function quickChecks(results: Results): Promise<void> {
  await Promise.all([
    results.step("1a", "テスト", async () => (await run("npm", ["test"])).match(/# pass (\d+)/)?.[0] ?? ""),
    results.step("1b", "型", async () => void (await run("npx", ["tsc", "--noEmit"]))),
    results.step("1c", "lint", async () => void (await run("npm", ["run", "lint"]))),
  ]);
  // The subjects use their own work/ copies and ports, so they can run side by side.
  await Promise.all(
    (["estimate", "worklog", "bookshop"] as const).map((id, i) =>
      results.step(`2${"abc"[i]}`, `題材 ${id}（Claude なし）`, async () => {
        const report = await runSamples(id);
        const wrong = compareCases(report, WITHOUT_CLAUDE[id]);
        expect(wrong.length === 0, wrong.slice(0, 5).join("／"));
        return tally(report);
      }),
    ),
  );
  await results.step("2d", "架空書店のサーバが残っていない", async () => {
    // Stopping is asked for at the end of the run; give the servers a moment to be gone.
    // Only processes that are php itself: a shell whose command line merely mentions the flags is not a server.
    let left: string[] = [];
    for (let i = 0; i < 6; i++) {
      left = (await run("ps", ["-axo", "pid=,command="])).split("\n").filter((l) => /^\s*\d+ \S*\/php -d display_errors=0 -S /.test(l));
      if (left.length === 0) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(false, `php のサーバが ${left.length} 個残っています（3 秒待っても止まらない）: ${left.map((l) => l.trim().slice(0, 80)).join("／")}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = new Results();
  quickChecks(results).then(() => {
    console.log(`\n${results.table()}`);
    process.exit(results.failed === 0 ? 0 : 1);
  });
}
