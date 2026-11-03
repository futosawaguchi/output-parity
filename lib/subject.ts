import { readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { expandCaseGroups } from "./case-groups";
import { withFileCases } from "./runner/files";
import { loadConfig, outputOf, summarizeEnvironments, type ParityConfig, type RunSpec } from "./config";
import { ConfigError } from "./errors";

// A subject is one system connected to the tool by one settings file (DESIGN 7-4c):
//   samples/<id>/   ships with the repository (made-up programs, real open-source libraries)
//   targets/<id>/   the user's own system; never committed (.gitignore)
// Each has parity.config.jsonc and, optionally, bundled/ (a finished run that ships with it).
// The tool writes only to work/<id>/ and runs/.

export const CONFIG_FILE = "parity.config.jsonc";
export const DEFAULT_SUBJECT = "estimate";
const SUBJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PLACES = ["samples", "targets"] as const;

export type Subject = {
  id: string;
  config: ParityConfig;
  /** The program's root for a run: the copy in work/<id>/, or the source itself when fixes is suggest-only. run.cwd is inside it. */
  runRoot: string;
  /** work/<id>/, the only place the tool writes the program to. null when fixes is suggest-only: nothing is copied or written. */
  workDir: string | null;
  /** A finished run shipped with the subject; it may not exist. */
  bundledDir: string;
};

/**
 * A subject as offered on the page: its id, and, when its settings can be read, its name and what
 * kind of subject it is (the environments, the output, how the outputs are made).
 */
export type SubjectEntry = {
  id: string;
  name: string | null;
  /** outputs: the settings' output first, then any other a case is read in (a CSV among the pages). */
  summary?: { old: string; new: string; outputs: { format: string; encoding: string }[]; runType: RunSpec["type"] };
};

/** Every way the subject's outputs are read, without repeats: the settings' output, then the cases' own. */
function outputsOf(config: ParityConfig): { format: string; encoding: string }[] {
  const all = [outputOf(config, {}), ...[...config.cases, ...config.caseGroups].flatMap((c) => (c.output ? [c.output] : []))];
  return all.filter((o, i) => all.findIndex((p) => p.format === o.format && p.encoding === o.encoding) === i);
}

/** The subject a request names, or the default one when it names none. Checked by loadSubject. */
export function subjectIdOf(value: unknown): string {
  return typeof value === "string" && value !== "" ? value : DEFAULT_SUBJECT;
}

/**
 * Every subject there is, in samples/ then targets/. An id found in both is the one in samples/,
 * as findSubjectDir picks it. A subject whose settings cannot be read is listed without a name,
 * so it can still be chosen and its error read.
 */
export async function listSubjects(root: string): Promise<SubjectEntry[]> {
  const entries: SubjectEntry[] = [];
  for (const place of PLACES) {
    const ids = (await readdir(join(root, place), { withFileTypes: true }).catch(() => []))
      .filter((e) => e.isDirectory() && SUBJECT_ID_PATTERN.test(e.name))
      .map((e) => e.name)
      .sort();
    for (const id of ids) {
      if (entries.some((e) => e.id === id)) continue;
      const path = join(root, place, id, CONFIG_FILE);
      if (!(await stat(path).catch(() => null))?.isFile()) continue;
      const config = await loadConfig(path).catch(() => null);
      if (!config) {
        entries.push({ id, name: null });
        continue;
      }
      const envs = summarizeEnvironments(config.run);
      entries.push({
        id,
        name: config.name,
        summary: { old: envs.old.label, new: envs.new.label, outputs: outputsOf(config), runType: config.run.type },
      });
    }
  }
  return entries;
}

/** The folder holding the subject's settings, without reading them. null when there is none. */
export async function findSubjectDir(root: string, id: string = DEFAULT_SUBJECT): Promise<string | null> {
  if (!SUBJECT_ID_PATTERN.test(id)) return null;
  for (const place of PLACES) {
    const dir = join(root, place, id);
    if ((await stat(join(dir, CONFIG_FILE)).catch(() => null))?.isFile()) return dir;
  }
  return null;
}

/** Reads a subject's settings and checks that the places they name can be used safely. */
export async function loadSubject(root: string, id: string = DEFAULT_SUBJECT): Promise<Subject> {
  if (!SUBJECT_ID_PATTERN.test(id)) {
    throw new ConfigError(`題材の名前「${id}」は使えません`, "英小文字・数字・- だけの名前にしてください");
  }
  const dir = await findSubjectDir(root, id);
  if (!dir) {
    throw new ConfigError(
      `題材「${id}」の設定が見つかりません（samples/${id}/ にも targets/${id}/ にも ${CONFIG_FILE} がありません）`,
      `自分のシステムなら targets/${id}/${CONFIG_FILE} を作ってください（書き方は README の「設定ファイル」）`,
    );
  }
  const settings = await loadConfig(join(dir, CONFIG_FILE));
  const workDir = join(root, "work", id);
  const bundledDir = join(dir, "bundled");
  await checkPlaces(settings.source, join(root, "work"), bundledDir);
  const config = await withFileCases(await expandCaseGroups(settings));
  // Outputs given as files cannot be made again, so there is nothing to copy or to apply an edit to.
  if (config.fixes === "suggest-only" || config.run.type === "files") return { id, config, runRoot: config.source, workDir: null, bundledDir };
  return { id, config, runRoot: workDir, workDir, bundledDir };
}

/** Why an edit cannot be applied to this subject, or null when it can. */
export function whyNoApplying(subject: Subject): { message: string; nextStep: string } | null {
  if (subject.workDir) return null;
  if (subject.config.run.type === "files") {
    return {
      message: "この題材は、旧と新の出力をファイルで渡す設定です（run.type が files）。プログラムを動かさないので、直し方を当てて流し直すことはできません",
      nextStep: "直し方は自分のソースに当て、新しい出力を run.new のフォルダに置き直してから、もう一度実行してください",
    };
  }
  return {
    message: "この題材は、直し方を提案するところまでの設定です（fixes が suggest-only。写しを作らず、何も書き換えません）",
    nextStep: "当てて確かめるには、設定の fixes を apply にしてください（work/ に写しを作り、そこに当てます）",
  };
}

/**
 * The source must be a folder that does not overlap work/: work/ is deleted and rewritten on every
 * run, and copying a folder into itself never ends. A bundled run holds the verdicts, so it must
 * not be inside the source either, where Claude could read it while looking for a cause.
 */
async function checkPlaces(source: string, workRoot: string, bundledDir: string): Promise<void> {
  const real = await realpath(source).catch(() => null);
  if (!real || !(await stat(real)).isDirectory()) {
    throw new ConfigError(`source のフォルダがありません: ${source}`, "設定ファイルの source を、プログラムのソースのフォルダにしてください");
  }
  const work = await realpathOfPossiblyMissing(workRoot);
  if (contains(real, work) || contains(work, real)) {
    throw new ConfigError(
      `source と道具の work/ が重なっています（source: ${source}）`,
      "source には、このリポジトリの work/ を含まない・work/ の中でもないフォルダを指定してください",
    );
  }
  if (contains(real, await realpathOfPossiblyMissing(bundledDir))) {
    throw new ConfigError(
      `同梱の結果（bundled/）が source の中にあります: ${bundledDir}`,
      "bundled/ を source の外に移してください（中の判定を、原因探しで Claude が読めてしまいます）",
    );
  }
}

/** True when `inner` is `outer` or inside it. */
function contains(outer: string, inner: string): boolean {
  const rel = relative(outer, inner);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}

/** work/ and bundled/ may not exist yet; their parent does. */
async function realpathOfPossiblyMissing(path: string): Promise<string> {
  const real = await realpath(path).catch(() => null);
  if (real) return real;
  const parent = join(path, "..");
  return join(await realpathOfPossiblyMissing(parent), relative(parent, path));
}
