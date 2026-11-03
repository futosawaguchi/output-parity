import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { OUTPUT_PLACEHOLDER, type Case, type EnvironmentName, type ParityConfig } from "../config";
import { execOnce, type ExecOutcome } from "./exec";

/**
 * The three executions per case (DESIGN 4-2): old once, new twice.
 * The second new run is the baseline that reveals values which change on every run.
 */
export const SLOTS = [
  { slot: "old", env: "old" },
  { slot: "new", env: "new" },
  { slot: "baseline", env: "new" },
] as const satisfies readonly { slot: string; env: EnvironmentName }[];

export type Slot = (typeof SLOTS)[number]["slot"];

export type SlotResult = {
  slot: Slot;
  env: EnvironmentName;
  command: string;
  args: string[];
  /** The page requested, as "GET /order.php?id=1" (run.type "web"; command and args then start the server). */
  request?: string;
  outcome: ExecOutcome;
  durationMs: number;
  /** Path of the output file, or null when the program did not produce one. */
  outputPath: string | null;
  stdoutPath: string;
  stderrPath: string;
};

export type CaseResult = { caseId: string; slots: SlotResult[] };

/** stdout may be the output itself; stderr is evidence only, so far less of it is kept. */
export const MAX_STDOUT_BYTES = 100 * 1024 * 1024;
export const MAX_STDERR_BYTES = 1024 * 1024;

/**
 * Runs one case three times, writing everything under `caseDir`. Runs sequentially.
 * `keepOld` is an old run made earlier: it is copied in instead of running the old side again
 * (after an edit, the old output from the original code is what "fixed" is measured against).
 */
export async function runCase(
  config: ParityConfig,
  testCase: Case,
  cwd: string,
  caseDir: string,
  keepOld?: SlotResult,
): Promise<CaseResult> {
  return runSlots(testCase.id, caseDir, keepOld, (slot, env, slotDir) => runSlot(config, testCase, cwd, slotDir, slot, env));
}

/**
 * The three slots of one case in order, each written under `caseDir`/<slot>, with the old slot
 * copied from `keepOld` when given. Shared by the command type and the web type (runner/web.ts).
 */
export async function runSlots(
  caseId: string,
  caseDir: string,
  keepOld: SlotResult | undefined,
  runOne: (slot: Slot, env: EnvironmentName, slotDir: string) => Promise<SlotResult>,
): Promise<CaseResult> {
  const slots: SlotResult[] = [];
  let newFinishedAt = 0;
  for (const { slot, env } of SLOTS) {
    if (slot === "old" && keepOld) {
      slots.push(await copySlot(keepOld, join(caseDir, slot)));
      continue;
    }
    // Timestamps are commonly written with 1-second resolution. If the baseline wrote the same
    // second as the new run, a timestamp would look stable and later show up as a false
    // difference between old and new. A program stamps its output at some point before it
    // exits, so starting the baseline more than a second after the new run *finished*
    // guarantees a different second.
    if (slot === "baseline") await sleep(newFinishedAt + MIN_BASELINE_GAP_MS - Date.now());
    slots.push(await runOne(slot, env, join(caseDir, slot)));
    if (slot === "new") newFinishedAt = Date.now();
  }
  return { caseId, slots };
}

const MIN_BASELINE_GAP_MS = 1100;

/** A run made earlier, copied into this run's directory so that every run directory stands alone. */
async function copySlot(from: SlotResult, slotDir: string): Promise<SlotResult> {
  await mkdir(slotDir, { recursive: true });
  const copy = async (path: string) => {
    const to = join(slotDir, basename(path));
    await copyFile(path, to);
    return to;
  };
  const copied: SlotResult = {
    ...from,
    outputPath: from.outputPath && (await copy(from.outputPath)),
    stdoutPath: await copy(from.stdoutPath),
    stderrPath: await copy(from.stderrPath),
  };
  await writeFile(join(slotDir, "result.json"), JSON.stringify(copied, null, 2) + "\n");
  return copied;
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function runSlot(
  config: ParityConfig,
  testCase: Case,
  cwd: string,
  slotDir: string,
  slot: Slot,
  env: EnvironmentName,
): Promise<SlotResult> {
  await mkdir(slotDir, { recursive: true });
  const outputPath = join(slotDir, `output.${config.output.format}`);
  // Only the command type runs anything (the files type is collected in runner/files.ts).
  if (config.run.type !== "command") throw new Error("runCase is for the command type");
  const environment = config.run.environments[env];
  const command = environment.command;
  const args = [...environment.args, ...testCase.args.map((a) => (a === OUTPUT_PLACEHOLDER ? outputPath : a))];

  const stdoutPath = join(slotDir, "stdout.txt");
  const stderrPath = join(slotDir, "stderr.txt");
  const result = await execOnce({
    command,
    args,
    cwd,
    timeoutMs: config.run.timeoutMs,
    stdoutPath,
    stderrPath,
    maxStdoutBytes: MAX_STDOUT_BYTES,
    maxStderrBytes: MAX_STDERR_BYTES,
    env: environment.env,
  });
  // Byte for byte: stdout can be binary (a PDF written to stdout). Nothing on stdout is no
  // output, not an empty one: a program that crashed before printing produced nothing.
  if (config.output.from === "stdout" && result.outcome.kind !== "outputTooLarge" && (await stat(stdoutPath)).size > 0) {
    await copyFile(stdoutPath, outputPath);
  }

  const slotResult: SlotResult = {
    slot,
    env,
    command,
    args,
    outcome: result.outcome,
    durationMs: result.durationMs,
    outputPath: (await isFile(outputPath)) ? outputPath : null,
    stdoutPath,
    stderrPath,
  };
  await writeFile(join(slotDir, "result.json"), JSON.stringify(slotResult, null, 2) + "\n");
  return slotResult;
}

async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}
