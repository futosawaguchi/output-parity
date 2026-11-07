import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { adaptersForConfig } from "../../lib/compare/adapters";
import { parseConfig } from "../../lib/config";
import { applyAndVerify } from "../../lib/fix/apply-and-verify";
import type { CauseReport } from "../../lib/fix/locate-cause";
import { runPipeline, type RunReport } from "../../lib/pipeline";

// The bundled outputs were made on another day. A program that prints today's date must not read
// as "not fixed" after an edit only because the old output kept from the bundle has an older date.

/** Prints today's date and a total; the new side gets the total wrong until FIXED is true. */
const PROGRAM = `const FIXED = false;
const broken = process.env.SIDE === "new" && !FIXED;
console.log("出力 " + new Date().toISOString().slice(0, 10));
console.log("合計 " + (broken ? 57000 : 72000));
`;

async function setUp() {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  await mkdir(join(dir, "app"));
  await writeFile(join(dir, "app", "prog.js"), PROGRAM);
  const side = (name: string) => ({ label: name, command: process.execPath, args: ["prog.js"], env: { SIDE: name } });
  const config = parseConfig(
    {
      version: 1,
      name: "t",
      source: "app",
      claude: { send: "none" },
      run: { type: "command", environments: { old: side("old"), new: side("new") } },
      output: { format: "text", from: "stdout" },
      cases: [{ id: "a", args: [] }],
    },
    join(dir, "parity.config.jsonc"),
  );
  const opts = { config, adapters: adaptersForConfig(config), workDir: join(dir, "work"), runsRoot: join(dir, "runs") };
  return { opts };
}

test("an edit applied from the bundled outputs is checked against outputs made here, not on the day they were bundled", async () => {
  const { opts } = await setUp();
  const run = await runPipeline({ subjectId: "t", ...opts, root: opts.workDir, prepare: true, client: null });
  // As if bundled on another day: the old output carries an older date.
  const old = run.cases[0].runs.find((r) => r.slot === "old")!;
  await writeFile(old.outputPath!, (await readFile(old.outputPath!, "utf8")).replace(/\d{4}-\d{2}-\d{2}/, "2026-11-03"));
  const edit = { file: "prog.js", oldText: "const FIXED = false", newText: "const FIXED = true" };
  // Only what applyAndVerify reads is filled in.
  const cause = { kind: "found", summary: "", model: "", reads: [], candidates: [{ file: "prog.js", line: 1, edit }] } as unknown as CauseReport;
  const bundled: RunReport = { ...run, origin: "bundled", cases: run.cases.map((c) => ({ ...c, cause })) };

  const after = await applyAndVerify(bundled, "a", 0, opts);
  assert.equal(after.fixAttempt?.verification?.outcome, "fixed");
});
