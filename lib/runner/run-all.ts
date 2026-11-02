import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParityConfig } from "../config";
import { preflight } from "./preflight";
import { runCase, type CaseResult } from "./run-case";
import { createRunDir } from "./run-dir";

export type RunManifest = {
  runId: string;
  runDir: string;
  configName: string;
  environments: ParityConfig["environments"];
  cwd: string;
  startedAt: string;
  finishedAt: string;
  cases: CaseResult[];
};

/**
 * Runs every case of the config in `cwd` and records the whole run in `manifest.json`.
 * Throws only for setup problems (SetupError); crashes of the program under test are results.
 */
export async function runAll(config: ParityConfig, cwd: string, runsRoot: string): Promise<RunManifest> {
  await preflight(config, cwd);
  const startedAt = new Date();
  const run = await createRunDir(runsRoot, startedAt);

  const cases: CaseResult[] = [];
  for (const testCase of config.cases) {
    cases.push(await runCase(config, testCase, cwd, join(run.path, testCase.id)));
  }

  const manifest: RunManifest = {
    runId: run.id,
    runDir: run.path,
    configName: config.name,
    environments: config.environments,
    cwd,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    cases,
  };
  await writeFile(join(run.path, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
