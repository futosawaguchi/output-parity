import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize, resolve, sep } from "node:path";
import { ConfigError } from "./errors";
import { parseJsonc } from "./jsonc";

// The one file that connects a system to the tool (DESIGN 7-4c). What differs from system to
// system is how the old and new outputs are produced and what format they are in; everything
// else is the tool's. Written by people, so it may hold comments (JSONC).

/** Placeholder in case args that the runner replaces with the output file path. */
export const OUTPUT_PLACEHOLDER = "{output}";

export type EnvironmentName = "old" | "new";

export type Environment = {
  label: string;
  /** Absolute path of the interpreter or binary to run. */
  command: string;
  /** Put before every case's own arguments (an interpreter's options, for example). */
  args: string[];
  /** Set for this side only, on top of the few variables always passed (runner/child-env.ts). */
  env: Record<string, string>;
};

/** What a report keeps about an environment: never `env`, which may hold a password. */
export type EnvironmentSummary = Pick<Environment, "label" | "command">;
export type EnvironmentSummaries = Record<EnvironmentName, EnvironmentSummary>;

export type RunSpec = {
  /** How the outputs are produced. Only "command" for now (DESIGN 7-4c: files and web come later). */
  type: "command";
  /** Where the programs run, relative to the source. */
  cwd: string;
  timeoutMs: number;
  environments: Record<EnvironmentName, Environment>;
};

export type OutputSpec = {
  /** Selects the adapter that turns the output into text (only "pdf" for now). */
  format: string;
  /** "file": the program writes to {output}. "stdout": the runner saves stdout. */
  from: "file" | "stdout";
};

/**
 * apply: the programs run in a copy (work/), where a proposed edit can be applied and checked.
 * suggest-only: no copy is made; the programs run where they are and the tool writes nothing to them.
 */
export type FixMode = "apply" | "suggest-only";

/**
 * What may be sent to Claude (DESIGN 7-4e ①). There is no default: the person whose system it is
 * chooses, knowing what each one sends.
 *   none               nothing; the outputs are compared and the machine settles what it can
 *   output             the outputs (judging)
 *   output-and-source  the outputs, and source files Claude chooses to read (looking for a cause)
 */
export type SendScope = "none" | "output" | "output-and-source";
export const SEND_SCOPES: readonly SendScope[] = ["none", "output", "output-and-source"];

export type Case = {
  id: string;
  /** Name shown on screen. Neutral on purpose: it must not give away the expected verdict. */
  label: string;
  /** One line about the input, shown on screen. */
  description: string;
  /** Arguments passed as an array (never through a shell). */
  args: string[];
};

export type ParityConfig = {
  version: 1;
  name: string;
  /** What is being checked, in a sentence or two. Shown above the results. */
  description: string;
  /** Absolute path of the program's source (written relative to the settings file). */
  source: string;
  /** Directories linked into work/ instead of copied: large, and never edited. */
  workspace: { link: string[] };
  fixes: FixMode;
  /** neverRead: paths Claude is never shown while looking for a cause, on top of keys and the like (fix/read-scope.ts). */
  claude: { send: SendScope; neverRead: string[] };
  run: RunSpec;
  output: OutputSpec;
  cases: Case[];
};

export const CONFIG_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LINKED = ["vendor", "node_modules"];
export const CASE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function loadConfig(path: string): Promise<ParityConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new ConfigError(`設定ファイルが読めません: ${path}`, "パスを確認してください");
  }
  let json: unknown;
  try {
    json = parseJsonc(raw);
  } catch (e) {
    throw new ConfigError(
      `設定ファイルが JSON として読めません: ${path}（${(e as Error).message}）`,
      "JSON の書式を確認してください（// と /* */ のコメント、末尾のカンマは書けます）",
    );
  }
  return parseConfig(json, path);
}

/** Checks the settings and fills in the defaults. `path` is the settings file: relative paths start there. */
export function parseConfig(json: unknown, path: string): ParityConfig {
  // A function declaration (not an arrow) so TypeScript narrows types after calls to it.
  function fail(what: string): never {
    throw new ConfigError(`設定ファイルの ${what}: ${path}`, "設定ファイルを直してください");
  }

  if (!isObject(json)) return fail("中身がオブジェクトではありません");
  const { version, name, description, source, workspace, fixes, claude, run, output, cases } = json;

  if (version === undefined) fail(`version がありません（"version": ${CONFIG_VERSION} を書いてください）`);
  if (version !== CONFIG_VERSION) fail(`version ${JSON.stringify(version)} には対応していません（対応しているのは ${CONFIG_VERSION}）`);
  if (typeof name !== "string") fail("name が文字列ではありません");
  if (description !== undefined && typeof description !== "string") fail("description が文字列ではありません");
  if (typeof source !== "string" || source === "") return fail("source（プログラムのソースの場所）がありません");

  let link = DEFAULT_LINKED;
  if (workspace !== undefined) {
    if (!isObject(workspace)) return fail("workspace がオブジェクトではありません");
    if (workspace.link !== undefined) {
      if (!isStringArray(workspace.link) || workspace.link.some((d) => d === "" || /[\\/]/.test(d))) {
        fail("workspace.link はフォルダ名（/ を含まない）の配列にしてください");
      }
      link = workspace.link as string[];
    }
  }

  if (fixes !== undefined && fixes !== "apply" && fixes !== "suggest-only") fail('fixes は "apply" か "suggest-only" にしてください');

  if (!isObject(claude) || claude.send === undefined) {
    fail(`claude.send がありません。Claude に送る範囲を選んでください（${SEND_SCOPES.join(" / ")}。README の「Claude に送るもの」）`);
  }
  if (!SEND_SCOPES.includes(claude.send as SendScope)) fail(`claude.send は ${SEND_SCOPES.map((s) => `"${s}"`).join(" / ")} のどれかにしてください`);
  const neverRead = (claude.neverRead as unknown) ?? [];
  if (!isStringArray(neverRead) || neverRead.some((p) => p === "" || isAbsolute(p) || p.split(/[\\/]/).includes(".."))) {
    fail("claude.neverRead は source からの相対パス（* と ** が使える）の配列にしてください");
  }

  const runSpec = parseRun(run, fail);

  if (!isObject(output) || typeof output.format !== "string") return fail("output.format がありません");
  if (output.from !== "file" && output.from !== "stdout") fail('output.from は "file" か "stdout" にしてください');
  const from = output.from as OutputSpec["from"];

  if (!Array.isArray(cases) || cases.length === 0) return fail("cases が空です");
  const seen = new Set<string>();
  const parsedCases = cases.map((c, i): Case => {
    if (!isObject(c) || typeof c.id !== "string" || !CASE_ID_PATTERN.test(c.id)) {
      return fail(`cases[${i}].id は英数字・-・_ だけにしてください`);
    }
    if (seen.has(c.id)) fail(`cases の id「${c.id}」が重複しています`);
    seen.add(c.id);
    if (!isStringArray(c.args)) fail(`cases[${i}].args が文字列の配列ではありません`);
    const args = c.args as string[];
    if (from === "file" && !args.includes(OUTPUT_PLACEHOLDER)) {
      fail(`cases[${i}].args に ${OUTPUT_PLACEHOLDER} がありません（output.from が "file" のとき必要）`);
    }
    if ((c.label !== undefined && typeof c.label !== "string") || (c.description !== undefined && typeof c.description !== "string")) {
      fail(`cases[${i}] の label と description は文字列にしてください`);
    }
    return { id: c.id, label: (c.label as string | undefined) ?? c.id, description: (c.description as string | undefined) ?? "", args };
  });

  return {
    version: CONFIG_VERSION,
    name: name as string,
    description: (description as string | undefined) ?? "",
    source: resolve(dirname(path), source),
    workspace: { link },
    fixes: (fixes as FixMode | undefined) ?? "apply",
    claude: { send: claude.send as SendScope, neverRead: neverRead as string[] },
    run: runSpec,
    output: { format: output.format, from },
    cases: parsedCases,
  };
}

function parseRun(run: unknown, fail: (what: string) => never): RunSpec {
  if (!isObject(run)) return fail("run がありません");
  if (run.type !== "command") return fail(`run.type は "command" にしてください（ほかの型は未対応）`);

  const cwd = run.cwd ?? ".";
  if (typeof cwd !== "string" || isAbsolute(cwd) || normalize(cwd).split(sep)[0] === "..") {
    fail("run.cwd は source の中を指す相対パスにしてください");
  }
  if (run.timeoutMs !== undefined && (typeof run.timeoutMs !== "number" || run.timeoutMs <= 0)) {
    fail("run.timeoutMs が正の数ではありません");
  }

  if (!isObject(run.environments)) return fail("run.environments がありません");
  const environments = {} as Record<EnvironmentName, Environment>;
  for (const key of ["old", "new"] as const) {
    const env = run.environments[key];
    const at = `run.environments.${key}`;
    if (!isObject(env) || typeof env.label !== "string" || typeof env.command !== "string") return fail(`${at} に label と command がありません`);
    if (env.args !== undefined && !isStringArray(env.args)) fail(`${at}.args が文字列の配列ではありません`);
    if (env.env !== undefined) {
      if (!isObject(env.env)) fail(`${at}.env がオブジェクトではありません`);
      for (const [k, v] of Object.entries(env.env as Record<string, unknown>)) {
        if (!ENV_NAME_PATTERN.test(k) || typeof v !== "string") fail(`${at}.env の「${k}」は、英数字と _ の名前に文字列の値にしてください`);
      }
    }
    environments[key] = {
      label: env.label,
      command: env.command,
      args: (env.args as string[] | undefined) ?? [],
      env: (env.env as Record<string, string> | undefined) ?? {},
    };
  }

  return { type: "command", cwd: cwd as string, timeoutMs: (run.timeoutMs as number | undefined) ?? DEFAULT_TIMEOUT_MS, environments };
}

/** The part of the environments a report keeps. */
export function summarizeEnvironments(envs: Record<EnvironmentName, Environment>): EnvironmentSummaries {
  return {
    old: { label: envs.old.label, command: envs.old.command },
    new: { label: envs.new.label, command: envs.new.command },
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((a) => typeof a === "string");
}
