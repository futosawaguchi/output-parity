import { readFile } from "node:fs/promises";
import { ConfigError } from "./errors";

/** Placeholder in case args that the runner replaces with the output file path. */
export const OUTPUT_PLACEHOLDER = "{output}";

export type EnvironmentName = "old" | "new";

export type Environment = {
  label: string;
  /** Absolute path of the interpreter or binary to run. */
  command: string;
};

export type OutputSpec = {
  /** Selects the adapter that turns the output into text (only "pdf" for now). */
  format: string;
  /** "file": the program writes to {output}. "stdout": the runner saves stdout. */
  source: "file" | "stdout";
};

export type Case = {
  id: string;
  /** Arguments passed as an array (never through a shell). */
  args: string[];
};

export type ParityConfig = {
  name: string;
  environments: Record<EnvironmentName, Environment>;
  output: OutputSpec;
  timeoutMs: number;
  cases: Case[];
};

const DEFAULT_TIMEOUT_MS = 30_000;
const CASE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function loadConfig(path: string): Promise<ParityConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new ConfigError(`設定ファイルが読めません: ${path}`, "パスを確認してください");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError(
      `設定ファイルが JSON として読めません: ${path}（${(e as Error).message}）`,
      "JSON の書式を確認してください",
    );
  }
  return parseConfig(json, path);
}

export function parseConfig(json: unknown, path: string): ParityConfig {
  // A function declaration (not an arrow) so TypeScript narrows types after calls to it.
  function fail(what: string): never {
    throw new ConfigError(`設定ファイルの ${what}: ${path}`, "設定ファイルを直してください");
  }

  if (!isObject(json)) return fail("中身がオブジェクトではありません");
  const { name, environments, output, timeoutMs, cases } = json;

  if (typeof name !== "string") fail("name が文字列ではありません");
  if (!isObject(environments)) return fail("environments がありません");
  const envs = {} as Record<EnvironmentName, Environment>;
  for (const key of ["old", "new"] as const) {
    const env = environments[key];
    if (!isObject(env) || typeof env.label !== "string" || typeof env.command !== "string") {
      fail(`environments.${key} に label と command がありません`);
    }
    envs[key] = { label: env.label as string, command: env.command as string };
  }

  if (!isObject(output) || typeof output.format !== "string") return fail("output.format がありません");
  if (output.source !== "file" && output.source !== "stdout") {
    fail('output.source は "file" か "stdout" にしてください');
  }
  const source = output.source as OutputSpec["source"];

  if (timeoutMs !== undefined && (typeof timeoutMs !== "number" || timeoutMs <= 0)) {
    fail("timeoutMs が正の数ではありません");
  }

  if (!Array.isArray(cases) || cases.length === 0) return fail("cases が空です");
  const seen = new Set<string>();
  const parsedCases = cases.map((c, i): Case => {
    if (!isObject(c) || typeof c.id !== "string" || !CASE_ID_PATTERN.test(c.id)) {
      return fail(`cases[${i}].id は英数字・-・_ だけにしてください`);
    }
    if (seen.has(c.id)) fail(`cases の id「${c.id}」が重複しています`);
    seen.add(c.id);
    if (!Array.isArray(c.args) || !c.args.every((a) => typeof a === "string")) {
      fail(`cases[${i}].args が文字列の配列ではありません`);
    }
    const args = c.args as string[];
    if (source === "file" && !args.includes(OUTPUT_PLACEHOLDER)) {
      fail(`cases[${i}].args に ${OUTPUT_PLACEHOLDER} がありません（output.source が "file" のとき必要）`);
    }
    return { id: c.id, args };
  });

  return {
    name: name as string,
    environments: envs,
    output: { format: output.format, source },
    timeoutMs: (timeoutMs as number | undefined) ?? DEFAULT_TIMEOUT_MS,
    cases: parsedCases,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
