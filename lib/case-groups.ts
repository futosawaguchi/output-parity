import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { CASE_ID_PATTERN, type Case, type CaseGroup, type ParityConfig } from "./config";
import { ConfigError } from "./errors";

// caseGroups write many cases once (DESIGN 7-4c): the 65 examples that ship with TCPDF are one
// line of settings, not 65 entries, and an example added in the next version is picked up.
// each.range does the same for numbered inputs, such as the 30 orders of a web app.

/**
 * The settings with every case group turned into cases, after the cases written one by one.
 * The files are looked for in run.cwd of the original source, where the programs will run.
 */
export async function expandCaseGroups(config: ParityConfig): Promise<ParityConfig> {
  // The files type has no case groups (the settings refuse them).
  if (config.caseGroups.length === 0 || config.run.type === "files") return config;
  const dir = join(config.source, config.run.cwd);

  const cases = [...config.cases];
  for (const [i, group] of config.caseGroups.entries()) {
    if ("range" in group.each) {
      const [first, last] = group.each.range;
      for (let n = first; n <= last; n++) cases.push(caseOf(group, { "{n}": String(n) }, String(n), i));
      continue;
    }
    const pattern = group.each.file;
    const matched = (await fileNames(dir)).filter((n) => matches(pattern, n));
    if (matched.length === 0) {
      throw new ConfigError(`caseGroups[${i}] の ${pattern} に当てはまるファイルがありません: ${dir}`, "設定の each.file と run.cwd を確かめてください");
    }
    for (const file of matched) cases.push(caseOf(group, { "{file}": file, "{name}": file.slice(0, file.length - extname(file).length) }, file, i));
  }

  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) throw new ConfigError(`入力の id「${c.id}」が重複しています`, "cases と caseGroups の id が重ならないようにしてください");
    seen.add(c.id);
  }
  return { ...config, cases };
}

async function fileNames(dir: string): Promise<string[]> {
  if (!(await stat(dir).catch(() => null))?.isDirectory()) {
    throw new ConfigError(
      `caseGroups のファイルを探すフォルダがありません: ${dir}`,
      "設定の run.cwd を確かめてください。依存（composer の vendor/ など）の中なら、先に取得してください（README の「全部動かす」）",
    );
  }
  return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name).sort();
}

/** One case from a group, with each placeholder replaced; `from` (a file name or a number) is for the message. */
function caseOf(group: CaseGroup, values: Record<string, string>, from: string, index: number): Case {
  const fill = (template: string) => Object.entries(values).reduce((s, [key, value]) => s.replaceAll(key, value), template);
  const id = fill(group.id);
  if (!CASE_ID_PATTERN.test(id)) {
    throw new ConfigError(`caseGroups[${index}] で ${from} から作った id「${id}」が使えません`, "id は英数字・-・_ だけになるようにしてください（{name} の代わりに別の形を書く）");
  }
  const made: Case = { id, label: fill(group.label), description: fill(group.description), args: group.args.map(fill) };
  if (group.request) {
    const form = Object.fromEntries(Object.entries(group.request.form).map(([k, v]) => [k, fill(v)]));
    made.request = { method: group.request.method, path: fill(group.request.path), form };
  }
  return made;
}

/** A file name against a pattern with * (any run of characters) and ? (one character). */
function matches(pattern: string, name: string): boolean {
  const regex = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".");
  return new RegExp(`^${regex}$`).test(name);
}
