import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { adapterFor } from "../../lib/compare/adapters";
import { compareCase } from "../../lib/compare/compare-case";
import { parseConfig, type FilesRun } from "../../lib/config";
import { casesFromFiles, collectCase, withFileCases } from "../../lib/runner/files";

// The files type: the outputs are already there, one folder per side. Nothing runs; the files are
// copied into the run so it keeps what was compared, and a missing file is a result, not an error.

async function setUp(baseline: boolean) {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  const put = async (side: string, name: string, text: string) => {
    await mkdir(join(dir, side), { recursive: true });
    await writeFile(join(dir, side, name), text);
  };
  await put("old", "a.csv", "x\n合計,1\n");
  await put("new", "a.csv", "x\n合計,2\n");
  await put("old", "only-old.csv", "y\n");
  if (baseline) await put("new2", "a.csv", "x\n合計,2\n");
  const config = parseConfig(
    {
      version: 1,
      name: "t",
      source: ".",
      claude: { send: "none" },
      run: { type: "files", old: { label: "旧", dir: "old" }, new: { label: "新", dir: "new" }, ...(baseline ? { baseline: { dir: "new2" } } : {}) },
      output: { format: "text", from: "file" },
    },
    join(dir, "parity.config.jsonc"),
  );
  return { dir, config: await withFileCases(config) };
}

test("with no cases written, every file in either folder is an input, named after the file", async () => {
  const { config } = await setUp(false);
  assert.deepEqual(
    config.cases.map((c) => [c.id, c.label, c.args]),
    [
      ["a", "a.csv", ["a.csv"]],
      ["only-old", "only-old.csv", ["only-old.csv"]],
    ],
  );
});

test("the files are copied into the run; a file missing on one side is no output, said in its record", async () => {
  const { dir, config } = await setUp(true);
  const run = config.run as FilesRun;
  const a = await collectCase(config, run, config.cases[0], join(dir, "runs", "a"));
  assert.deepEqual(a.slots.map((s) => s.slot), ["old", "new", "baseline"]);
  assert.equal(await readFile(a.slots[1].outputPath!, "utf8"), "x\n合計,2\n");
  assert.ok(a.slots[1].outputPath!.startsWith(join(dir, "runs", "a")));

  const missing = await collectCase(config, run, config.cases[1], join(dir, "runs", "only-old"));
  assert.equal(missing.slots[1].outputPath, null);
  assert.deepEqual(missing.slots[1].outcome, { kind: "given", found: false });
  assert.match(await readFile(missing.slots[1].stderrPath, "utf8"), /only-old\.csv がありません/);
});

test("without a second set of new outputs, the comparison says what varies on every run was not told apart", async () => {
  const { dir, config } = await setUp(false);
  const a = await collectCase(config, config.run as FilesRun, config.cases[0], join(dir, "runs", "a"));
  const { comparison } = await compareCase(a, adapterFor({ format: "text" }).extract);
  assert.equal(comparison.kind, "compared");
  assert.match(comparison.kind === "compared" && comparison.baseline.kind === "unavailable" ? comparison.baseline.reason : "", /2回目が無い/);
});

test("empty folders are reported with what to put there", async () => {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  await mkdir(join(dir, "old"));
  await mkdir(join(dir, "new"));
  const run: FilesRun = { type: "files", sides: { old: { label: "旧", dir: join(dir, "old") }, new: { label: "新", dir: join(dir, "new") } }, baselineDir: null };
  await assert.rejects(casesFromFiles(run), (e: Error & { nextStep?: string }) => /ファイルがありません/.test(e.message) && /同じ名前/.test(e.nextStep ?? ""));
});

test("the files type takes no case groups, and its folders are relative to the settings file", () => {
  const base = { version: 1, name: "t", source: ".", claude: { send: "none" }, output: { format: "text", from: "file" } };
  const run = { type: "files", old: { label: "旧", dir: "o" }, new: { label: "新", dir: "n" } };
  const c = parseConfig({ ...base, run }, "/x/samples/t/parity.config.jsonc");
  assert.equal((c.run as FilesRun).sides.old.dir, "/x/samples/t/o");
  assert.throws(() => parseConfig({ ...base, run, caseGroups: [{ each: { file: "*.csv" }, args: ["{file}"] }] }, "/x/p.jsonc"), /caseGroups は使えません/);
  assert.throws(() => parseConfig({ ...base, run: { type: "files", old: { label: "旧" }, new: run.new } }, "/x/p.jsonc"), /run\.old に label と dir/);
});
