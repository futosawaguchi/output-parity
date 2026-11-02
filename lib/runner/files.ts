import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { CASE_ID_PATTERN, type Case, type FilesRun, type ParityConfig } from "../config";
import { ConfigError } from "../errors";
import type { CaseResult, Slot, SlotResult } from "./run-case";

// The files type (DESIGN 7-4c): the old and new outputs are already there, one folder each, with
// the same name for the same input. Nothing runs. Each file is copied into the run's folder, so a
// run keeps exactly what was compared, like any other (the record of what was checked, DESIGN 4-5).

/** One case per file name found in the old or new folder, in name order, when the settings list none. */
export async function casesFromFiles(run: FilesRun): Promise<Case[]> {
  const names = new Set<string>();
  for (const dir of [run.sides.old.dir, run.sides.new.dir]) {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.isFile() && !e.name.startsWith(".")) names.add(e.name);
    }
  }
  if (names.size === 0) {
    throw new ConfigError(`出力のフォルダにファイルがありません: ${run.sides.old.dir}・${run.sides.new.dir}`, "旧と新の出力を、同じ入力には同じ名前でそれぞれのフォルダに置いてください");
  }
  const seen = new Map<string, string>();
  return [...names].sort().map((file) => {
    const id = file.slice(0, file.length - extname(file).length).replace(/[^A-Za-z0-9_-]/g, "_") || "_";
    if (seen.has(id)) throw new ConfigError(`ファイル ${seen.get(id)} と ${file} から同じ id「${id}」ができます`, "どちらかの名前を変えるか、設定の cases で id を書いてください");
    seen.set(id, file);
    if (!CASE_ID_PATTERN.test(id)) throw new ConfigError(`ファイル ${file} から id を作れません`, "設定の cases で id を書いてください");
    return { id, label: file, description: "", args: [file] };
  });
}

/** The settings with the cases filled in from the folders, for the files type when none are written. */
export async function withFileCases(config: ParityConfig): Promise<ParityConfig> {
  if (config.run.type !== "files" || config.cases.length > 0) return config;
  return { ...config, cases: await casesFromFiles(config.run) };
}

/** Copies one case's files into `caseDir`, as a run would have written them. A file that is not there is no output. */
export async function collectCase(config: ParityConfig, run: FilesRun, testCase: Case, caseDir: string): Promise<CaseResult> {
  const file = testCase.args[0] ?? testCase.id;
  const sides: { slot: Slot; env: "old" | "new"; dir: string }[] = [
    { slot: "old", env: "old", dir: run.sides.old.dir },
    { slot: "new", env: "new", dir: run.sides.new.dir },
    ...(run.baselineDir ? [{ slot: "baseline" as const, env: "new" as const, dir: run.baselineDir }] : []),
  ];
  const slots: SlotResult[] = [];
  for (const { slot, env, dir } of sides) {
    const slotDir = join(caseDir, slot);
    await mkdir(slotDir, { recursive: true });
    const from = join(dir, file);
    const found = (await stat(from).catch(() => null))?.isFile() ?? false;
    const outputPath = join(slotDir, `output.${config.output.format}`);
    if (found) await copyFile(from, outputPath);
    const stdoutPath = join(slotDir, "stdout.txt");
    const stderrPath = join(slotDir, "stderr.txt");
    await writeFile(stdoutPath, "");
    await writeFile(stderrPath, found ? "" : `${from} がありません\n`);
    const result: SlotResult = { slot, env, command: dir, args: [file], outcome: { kind: "given", found }, durationMs: 0, outputPath: found ? outputPath : null, stdoutPath, stderrPath };
    await writeFile(join(slotDir, "result.json"), JSON.stringify(result, null, 2) + "\n");
    slots.push(result);
  }
  return { caseId: testCase.id, slots };
}
