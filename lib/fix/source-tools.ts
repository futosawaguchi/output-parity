import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { insideRoot } from "../safe-path";

// What Claude may do with the program's source while looking for a cause (DESIGN 7-4): read,
// list and search. Nothing here writes. Every path comes from Claude, so it is confined to the
// source directory; problems are returned as text for Claude to read, not thrown.

const MAX_LINES = 300;
const MAX_HITS = 40;
const MAX_SEARCH_FILE_BYTES = 4 * 1024 * 1024;

/** Lines `start`..`end` (1-based, inclusive) with their numbers, so Claude can answer with file:line. */
export async function readLines(root: string, path: string, start = 1, end?: number): Promise<string> {
  const file = insideRoot(root, path);
  if (!file) return `読めません（ソースのディレクトリの外です）: ${path}`;
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) return `ファイルがありません: ${path}`;
  const lines = text.split("\n");
  const from = Math.max(1, start);
  const to = Math.min(lines.length, end ?? from + MAX_LINES - 1, from + MAX_LINES - 1);
  if (from > lines.length) return `${path} は ${lines.length} 行しかありません`;
  const body = lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(6)}| ${l}`);
  const more = to < lines.length ? `\n（${path} は全 ${lines.length} 行。続きは start_line=${to + 1} で読めます）` : "";
  return body.join("\n") + more;
}

/** The entries of one directory, directories marked with a trailing slash. */
export async function listDir(root: string, path = "."): Promise<string> {
  const dir = insideRoot(root, path);
  if (!dir) return `見られません（ソースのディレクトリの外です）: ${path}`;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) return `ディレクトリがありません: ${path}`;
  // A linked dependency directory reports as a link, not a directory; stat follows it.
  const names = await Promise.all(
    entries.map(async (e) => ((await stat(join(dir, e.name)).catch(() => null))?.isDirectory() ? `${e.name}/` : e.name)),
  );
  return names.sort().join("\n") || "（空です）";
}

/** Lines containing `text` (plain text, not a pattern) under `path`, as file:line: content. */
export async function searchText(root: string, text: string, path = "."): Promise<string> {
  const start = insideRoot(root, path);
  if (!start) return `探せません（ソースのディレクトリの外です）: ${path}`;
  if (text === "") return "探す文字列が空です";
  const hits: string[] = [];
  const visit = async (p: string): Promise<void> => {
    if (hits.length >= MAX_HITS) return;
    const s = await stat(p).catch(() => null);
    if (s?.isDirectory()) {
      for (const name of (await readdir(p)).sort()) await visit(join(p, name));
    } else if (s?.isFile() && s.size <= MAX_SEARCH_FILE_BYTES) {
      const lines = (await readFile(p, "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (hits.length < MAX_HITS && line.includes(text)) hits.push(`${relative(root, p)}:${i + 1}: ${line.trim().slice(0, 200)}`);
      });
    }
  };
  await visit(start);
  if (hits.length === 0) return `見つかりません: ${text}`;
  return hits.join("\n") + (hits.length >= MAX_HITS ? `\n（${MAX_HITS} 件で打ち切りました。範囲を絞ってください）` : "");
}
