import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize, resolve, sep } from "node:path";
import { ConfigError } from "./errors";
import { parseJsonc } from "./jsonc";

// The one file that connects a system to the tool (DESIGN 7-4c). What differs from system to
// system is how the old and new outputs are produced and what format they are in; everything
// else is the tool's. Written by people, so it may hold comments (JSONC).

/** Placeholder in case args that the runner replaces with the output file path. */
export const OUTPUT_PLACEHOLDER = "{output}";
/** Placeholder in a web server's args that the runner replaces with the port it chose (DESIGN 7-4c). */
export const PORT_PLACEHOLDER = "{port}";

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

/** How the outputs are produced (DESIGN 7-4c): by running the programs, or given as files. */
export type RunSpec = CommandRun | FilesRun | WebRun;

export type CommandRun = {
  /** The tool runs the old and new programs on every case. */
  type: "command";
  /** Where the programs run, relative to the source. */
  cwd: string;
  timeoutMs: number;
  environments: Record<EnvironmentName, Environment>;
  /**
   * Paths (relative to the source) that must exist before anything runs: dependencies that are
   * fetched, not committed (composer's vendor/). Without them every case would fail the same way.
   */
  needs: string[];
  /**
   * How many cases run at the same time. 1 unless written: an old program may share a temporary
   * file or a database between runs, and two at once would make differences of the tool's own.
   */
  parallel: number;
};

/**
 * The tool starts the old and new web servers itself, on this machine, and requests every case's
 * page from both (DESIGN 7-4c). Only 127.0.0.1 is ever asked: the settings give paths, never URLs,
 * so nothing here can point the tool at a server elsewhere (DESIGN 7-3).
 */
export type WebRun = {
  type: "web";
  /** Where the servers start, relative to the source. */
  cwd: string;
  /** For each request. */
  timeoutMs: number;
  /** Each side's args hold {port} (e.g. "127.0.0.1:{port}"): the tool chooses a free port. */
  environments: Record<EnvironmentName, Environment>;
  needs: string[];
  /**
   * A database file (relative to the source) copied back from the original before every request,
   * so that what one request writes cannot change what the next one shows. null: none.
   */
  database: string | null;
};

/** One page to request. The method and form are sent as written; the path is under the server's root. */
export type WebRequest = { method: "GET" | "POST"; path: string; form: Record<string, string> };

/**
 * The old and new outputs are already there, one folder each, the same name for the same input
 * (the old outputs are often what was kept from the old system). Nothing runs, so an edit cannot
 * be checked by running again; the cause can still be looked for in the source.
 */
export type FilesRun = {
  type: "files";
  /** label: shown for the side; dir: absolute (written relative to the settings file). */
  sides: Record<EnvironmentName, { label: string; dir: string }>;
  /** A second set of new outputs, from another run of the new environment, to learn what varies on every run. */
  baselineDir: string | null;
};

export type OutputSpec = {
  /** Selects the adapter that turns the output into text: pdf, text or html (compare/adapters.ts). */
  format: string;
  /** How text and HTML outputs are written (a WHATWG name: utf-8, shift_jis, euc-jp). HTML that declares its charset is read in that. */
  encoding: string;
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
  /** Arguments passed as an array (never through a shell). Empty for the web type. */
  args: string[];
  /** The page to request: the web type only. */
  request?: WebRequest;
  /** How this case's output is read, when not as `output` says. */
  output?: CaseOutput;
};

/**
 * How one case's output is read when it differs from the rest: a web app shows pages (html) and
 * also exports a CSV (text, often Shift_JIS), and both are what the old system did. Only the
 * format and the encoding can differ; where the output comes from is the same for every case.
 */
export type CaseOutput = { format: string; encoding: string };

/**
 * Many cases written once (DESIGN 7-4c): one case per file in run.cwd whose name matches
 * each.file, or one per number in each.range. In id, label, description, args and request,
 * {file} is the file's name and {name} the same without its extension; {n} is the number.
 * Expanded into cases when the subject is loaded (lib/case-groups.ts).
 */
export type CaseGroup = {
  each: { file: string } | { range: [number, number] };
  id: string;
  label: string;
  description: string;
  args: string[];
  request?: WebRequest;
  output?: CaseOutput;
};

export type ParityConfig = {
  version: 1;
  name: string;
  /** A short name for the row of subjects at the top of the page; the name when not given. */
  shortName: string;
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
  caseGroups: CaseGroup[];
};

export const CONFIG_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LINKED = ["vendor", "node_modules"];
/** each.range is for a few dozen inputs, not a typo that runs a million. */
const MAX_RANGE = 1000;
const MAX_PARALLEL = 16;
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
  const { version, name, shortName, description, source, workspace, fixes, claude, run, output, cases, caseGroups } = json;

  if (version === undefined) fail(`version がありません（"version": ${CONFIG_VERSION} を書いてください）`);
  if (version !== CONFIG_VERSION) fail(`version ${JSON.stringify(version)} には対応していません（対応しているのは ${CONFIG_VERSION}）`);
  if (typeof name !== "string") fail("name が文字列ではありません");
  if (shortName !== undefined && typeof shortName !== "string") fail("shortName が文字列ではありません");
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

  const runSpec = parseRun(run, dirname(path), fail);

  if (!isObject(output) || typeof output.format !== "string") return fail("output.format がありません");
  // A web page is the response body; there is nothing to choose.
  if (runSpec.type !== "web" && output.from !== "file" && output.from !== "stdout") fail('output.from は "file" か "stdout" にしてください');
  const from = runSpec.type === "web" ? "stdout" : (output.from as OutputSpec["from"]);
  const encoding = output.encoding ?? "utf-8";
  if (typeof encoding !== "string" || !isEncoding(encoding)) fail(`output.encoding「${String(encoding)}」は読めない文字コードです（utf-8 / shift_jis / euc-jp など）`);

  if (runSpec.type === "files" && caseGroups !== undefined) fail("ファイル型（run.type が files）では caseGroups は使えません（cases を書かなければ、フォルダのファイルが全部入力になります）");
  const base: CaseOutput = { format: output.format, encoding: encoding as string };
  const parsedGroups = parseCaseGroups(caseGroups, runSpec.type, from, base, fail);
  if (cases !== undefined && !Array.isArray(cases)) return fail("cases が配列ではありません");
  const caseList: unknown[] = cases ?? [];
  // The files type finds its inputs in the folders when none are written (lib/runner/files.ts).
  if (caseList.length === 0 && parsedGroups.length === 0 && runSpec.type !== "files") return fail("cases も caseGroups も空です（入力を1つ以上書いてください）");
  const seen = new Set<string>();
  const parsedCases = caseList.map((c, i): Case => {
    if (!isObject(c) || typeof c.id !== "string" || !CASE_ID_PATTERN.test(c.id)) {
      return fail(`cases[${i}].id は英数字・-・_ だけにしてください`);
    }
    if (seen.has(c.id)) fail(`cases の id「${c.id}」が重複しています`);
    seen.add(c.id);
    if ((c.label !== undefined && typeof c.label !== "string") || (c.description !== undefined && typeof c.description !== "string")) {
      fail(`cases[${i}] の label と description は文字列にしてください`);
    }
    const about = {
      id: c.id,
      label: (c.label as string | undefined) ?? c.id,
      description: (c.description as string | undefined) ?? "",
      ...parseCaseOutput(c.output, `cases[${i}].output`, base, fail),
    };
    if (runSpec.type === "web") {
      if (c.args !== undefined) fail(`cases[${i}].args は Web 型では使えません（開くページは request に書いてください）`);
      return { ...about, args: [], request: parseRequest(c.request, `cases[${i}].request`, fail) };
    }
    if (c.request !== undefined) fail(`cases[${i}].request は Web 型（run.type が web）のときだけ書けます`);
    if (!isStringArray(c.args)) fail(`cases[${i}].args が文字列の配列ではありません`);
    const args = c.args as string[];
    if (runSpec.type === "command" && from === "file" && !args.includes(OUTPUT_PLACEHOLDER)) {
      fail(`cases[${i}].args に ${OUTPUT_PLACEHOLDER} がありません（output.from が "file" のとき必要）`);
    }
    return { ...about, args };
  });

  if (runSpec.type === "web" && runSpec.database !== null && fixes === "suggest-only") {
    fail("run.database と fixes: \"suggest-only\" は一緒に使えません（suggest-only はその場で動かすので、元の DB を毎回書き戻すことになります。fixes を \"apply\" にすると コピー（work/）の中で戻します）");
  }

  return {
    version: CONFIG_VERSION,
    name: name as string,
    shortName: (shortName as string | undefined) ?? (name as string),
    description: (description as string | undefined) ?? "",
    source: resolve(dirname(path), source),
    workspace: { link },
    fixes: (fixes as FixMode | undefined) ?? "apply",
    claude: { send: claude.send as SendScope, neverRead: neverRead as string[] },
    run: runSpec,
    output: { format: output.format, encoding: encoding as string, from },
    cases: parsedCases,
    caseGroups: parsedGroups,
  };
}

function parseCaseGroups(groups: unknown, runType: RunSpec["type"], from: OutputSpec["from"], base: CaseOutput, fail: (what: string) => never): CaseGroup[] {
  if (groups === undefined) return [];
  if (!Array.isArray(groups)) return fail("caseGroups が配列ではありません");
  return groups.map((g, i): CaseGroup => {
    const at = `caseGroups[${i}]`;
    const each = isObject(g) && isObject(g.each) ? parseEach(g.each, at, fail) : fail(`${at}.each（each.file か each.range）がありません`);
    for (const key of ["id", "label", "description"] as const) {
      if (g[key] !== undefined && typeof g[key] !== "string") fail(`${at}.${key} は文字列にしてください`);
    }
    const byFile = "file" in each;
    const about = {
      each,
      id: (g.id as string | undefined) ?? (byFile ? "{name}" : "{n}"),
      label: (g.label as string | undefined) ?? (byFile ? "{file}" : "{n}"),
      description: (g.description as string | undefined) ?? "",
      ...parseCaseOutput(g.output, `${at}.output`, base, fail),
    };
    if (runType === "web") {
      if (g.args !== undefined) fail(`${at}.args は Web 型では使えません（開くページは request に書いてください）`);
      return { ...about, args: [], request: parseRequest(g.request, `${at}.request`, fail) };
    }
    if (g.request !== undefined) fail(`${at}.request は Web 型（run.type が web）のときだけ書けます`);
    if (!isStringArray(g.args)) return fail(`${at}.args が文字列の配列ではありません`);
    if (from === "file" && !g.args.includes(OUTPUT_PLACEHOLDER)) fail(`${at}.args に ${OUTPUT_PLACEHOLDER} がありません（output.from が "file" のとき必要）`);
    return { ...about, args: g.args };
  });
}

/** A case's own output, filled in from `base` where it says nothing; nothing when the case has none. */
function parseCaseOutput(value: unknown, at: string, base: CaseOutput, fail: (what: string) => never): { output?: CaseOutput } {
  if (value === undefined) return {};
  if (!isObject(value)) return fail(`${at} がオブジェクトではありません`);
  const unknownKey = Object.keys(value).find((k) => k !== "format" && k !== "encoding");
  if (unknownKey) fail(`${at}.${unknownKey} は入力ごとには書けません（書けるのは format と encoding）`);
  if (value.format !== undefined && typeof value.format !== "string") fail(`${at}.format は文字列にしてください`);
  if (value.encoding !== undefined && (typeof value.encoding !== "string" || !isEncoding(value.encoding))) {
    fail(`${at}.encoding「${String(value.encoding)}」は読めない文字コードです（utf-8 / shift_jis / euc-jp など）`);
  }
  return { output: { format: (value.format as string | undefined) ?? base.format, encoding: (value.encoding as string | undefined) ?? base.encoding } };
}

/** How a case's output is read: its own output, or the settings' output. */
export function outputOf(config: Pick<ParityConfig, "output">, c: { output?: CaseOutput }): CaseOutput {
  return c.output ?? { format: config.output.format, encoding: config.output.encoding };
}

function parseEach(each: Record<string, unknown>, at: string, fail: (what: string) => never): CaseGroup["each"] {
  if (each.range !== undefined) {
    const r = each.range;
    if (!Array.isArray(r) || r.length !== 2 || !r.every((n) => Number.isInteger(n) && n >= 0) || r[0] > r[1] || r[1] - r[0] >= MAX_RANGE) {
      fail(`${at}.each.range は [最初, 最後] の 0 以上の整数にしてください（例 [1, 30]。${MAX_RANGE} 件まで）`);
    }
    return { range: [r[0], r[1]] };
  }
  const file = each.file;
  if (typeof file !== "string") return fail(`${at}.each.file（当てはめるファイル名の形。例 "example_*.php"）か each.range（例 [1, 30]）がありません`);
  if (file === "" || /[\\/]/.test(file) || !/[*?]/.test(file)) fail(`${at}.each.file は、/ を含まず * か ? を含むファイル名の形にしてください`);
  return { file };
}

/** A page under the server's root. Never a URL: the host is always the tool's own server on 127.0.0.1. */
function parseRequest(r: unknown, at: string, fail: (what: string) => never): WebRequest {
  if (!isObject(r) || typeof r.path !== "string") return fail(`${at}.path（開くページ。例 "/order.php?id=1"）がありません`);
  const path = r.path;
  // "//host" and "\\host" would name another host; whitespace and control characters have no place in a path.
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\s\u0000-\u001f]/.test(path)) {
    fail(`${at}.path は / で始まるパスにしてください（URL やホスト名は書けません。問い合わせるのは道具が立てた手元のサーバだけです）`);
  }
  const method = r.method ?? "GET";
  if (method !== "GET" && method !== "POST") fail(`${at}.method は "GET" か "POST" にしてください`);
  const form = (r.form as unknown) ?? {};
  if (!isObject(form) || !Object.values(form).every((v) => typeof v === "string")) fail(`${at}.form は、名前と文字列の値の組にしてください`);
  if (method === "GET" && Object.keys(form as object).length > 0) fail(`${at}.form は method が "POST" のときだけ書けます（GET はパスの ? の後ろに書いてください）`);
  return { method: method as WebRequest["method"], path, form: form as Record<string, string> };
}

function parseRun(run: unknown, base: string, fail: (what: string) => never): RunSpec {
  if (!isObject(run)) return fail("run がありません");
  if (run.type === "files") return parseFilesRun(run, base, fail);
  if (run.type !== "command" && run.type !== "web") return fail(`run.type は "command"・"files"・"web" のどれかにしてください`);
  const web = run.type === "web";

  const cwd = run.cwd ?? ".";
  if (typeof cwd !== "string" || isAbsolute(cwd) || normalize(cwd).split(sep)[0] === "..") {
    fail("run.cwd は source の中を指す相対パスにしてください");
  }
  if (run.timeoutMs !== undefined && (typeof run.timeoutMs !== "number" || run.timeoutMs <= 0)) {
    fail("run.timeoutMs が正の数ではありません");
  }
  const needs = (run.needs as unknown) ?? [];
  if (!isStringArray(needs) || needs.some((p) => p === "" || isAbsolute(p) || normalize(p).split(sep)[0] === "..")) {
    fail("run.needs は source の中を指す相対パスの配列にしてください");
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
    const args = (env.args as string[] | undefined) ?? [];
    if (web && !args.some((a) => a.includes(PORT_PLACEHOLDER))) {
      fail(`${at}.args に ${PORT_PLACEHOLDER} がありません（Web 型では道具が空いているポートを選んで渡します。例 ["-S", "127.0.0.1:${PORT_PLACEHOLDER}"]）`);
    }
    environments[key] = { label: env.label, command: env.command, args, env: (env.env as Record<string, string> | undefined) ?? {} };
  }

  const timeoutMs = (run.timeoutMs as number | undefined) ?? DEFAULT_TIMEOUT_MS;
  if (!web) {
    if (run.database !== undefined) fail("run.database は Web 型（run.type が web）のときだけ書けます");
    const parallel = run.parallel ?? 1;
    if (!Number.isInteger(parallel) || (parallel as number) < 1 || (parallel as number) > MAX_PARALLEL) {
      fail(`run.parallel は 1〜${MAX_PARALLEL} の整数にしてください（同時に動かす入力の数）`);
    }
    return { type: "command", cwd: cwd as string, timeoutMs, environments, needs: needs as string[], parallel: parallel as number };
  }
  // The servers and their database are shared by every request: one at a time.
  if (run.parallel !== undefined && run.parallel !== 1) fail("run.parallel は Web 型では使えません（サーバと DB を全部の入力で共有するので、1つずつ問い合わせます）");
  let database: string | null = null;
  if (run.database !== undefined) {
    const file = isObject(run.database) ? run.database.file : undefined;
    if (typeof file !== "string" || file === "" || isAbsolute(file) || normalize(file).split(sep)[0] === "..") {
      fail("run.database は { \"file\": \"source の中の DB ファイルの相対パス\" } にしてください");
    }
    database = file as string;
  }
  return { type: "web", cwd: cwd as string, timeoutMs, environments, needs: needs as string[], database };
}

function parseFilesRun(run: Record<string, unknown>, base: string, fail: (what: string) => never): FilesRun {
  const side = (key: EnvironmentName) => {
    const s = run[key];
    if (!isObject(s) || typeof s.label !== "string" || typeof s.dir !== "string" || s.dir === "") return fail(`run.${key} に label と dir（出力のフォルダ）がありません`);
    return { label: s.label, dir: resolve(base, s.dir) };
  };
  let baselineDir: string | null = null;
  if (run.baseline !== undefined) {
    if (!isObject(run.baseline) || typeof run.baseline.dir !== "string" || run.baseline.dir === "") return fail("run.baseline.dir（新の出力の2回目のフォルダ）が文字列ではありません");
    baselineDir = resolve(base, run.baseline.dir);
  }
  return { type: "files", sides: { old: side("old"), new: side("new") }, baselineDir };
}

/** The part of the run a report keeps: each side's label, and its command or the folder its outputs came from. */
export function summarizeEnvironments(run: RunSpec): EnvironmentSummaries {
  if (run.type === "files") {
    return { old: { label: run.sides.old.label, command: run.sides.old.dir }, new: { label: run.sides.new.label, command: run.sides.new.dir } };
  }
  const envs = run.environments;
  return {
    old: { label: envs.old.label, command: envs.old.command },
    new: { label: envs.new.label, command: envs.new.command },
  };
}

function isEncoding(label: string): boolean {
  try {
    new TextDecoder(label);
    return true;
  } catch {
    return false;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((a) => typeof a === "string");
}
