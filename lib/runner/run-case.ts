import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  outcome: ExecOutcome;
  durationMs: number;
  /** Path of the output file, or null when the program did not produce one. */
  outputPath: string | null;
  stdoutPath: string;
  stderrPath: string;
};

export type CaseResult = { caseId: string; slots: SlotResult[] };

const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** Runs one case three times, writing everything under `caseDir`. Runs sequentially. */
export async function runCase(
  config: ParityConfig,
  testCase: Case,
  cwd: string,
  caseDir: string,
): Promise<CaseResult> {
  const slots: SlotResult[] = [];
  let newFinishedAt = 0;
  for (const { slot, env } of SLOTS) {
    // Timestamps are commonly written with 1-second resolution. If the baseline wrote the same
    // second as the new run, a timestamp would look stable and later show up as a false
    // difference between old and new. A program stamps its output at some point before it
    // exits, so starting the baseline more than a second after the new run *finished*
    // guarantees a different second.
    if (slot === "baseline") await sleep(newFinishedAt + MIN_BASELINE_GAP_MS - Date.now());
    slots.push(await runSlot(config, testCase, cwd, join(caseDir, slot), slot, env));
    if (slot === "new") newFinishedAt = Date.now();
  }
  return { caseId: testCase.id, slots };
}

const MIN_BASELINE_GAP_MS = 1100;

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
  const command = config.environments[env].command;
  const args = testCase.args.map((a) => (a === OUTPUT_PLACEHOLDER ? outputPath : a));

  const result = await execOnce({
    command,
    args,
    cwd,
    timeoutMs: config.timeoutMs,
    maxBufferBytes: MAX_BUFFER_BYTES,
  });

  const stdoutPath = join(slotDir, "stdout.txt");
  const stderrPath = join(slotDir, "stderr.txt");
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);
  if (config.output.source === "stdout") await writeFile(outputPath, result.stdout);

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
