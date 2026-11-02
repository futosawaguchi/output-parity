import { realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { loadConfig, type ParityConfig } from "./config";
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
  /** The program's root for a run: the copy in work/<id>/. run.cwd is inside it. */
  runRoot: string;
  /** work/<id>/, the only place the tool writes the program to. */
  workDir: string;
  /** A finished run shipped with the subject; it may not exist. */
  bundledDir: string;
};

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
  const config = await loadConfig(join(dir, CONFIG_FILE));
  const workDir = join(root, "work", id);
  const bundledDir = join(dir, "bundled");
  await checkPlaces(config.source, join(root, "work"), bundledDir);
  return { id, config, runRoot: workDir, workDir, bundledDir };
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
