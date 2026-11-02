import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { access, refusal, type ReadScope } from "./read-scope";

// What Claude may do with the program's source while looking for a cause (DESIGN 7-4): read,
// list and search. Nothing here writes. Every path comes from Claude, so it goes through the
// read scope (read-scope.ts): confined to the source, and never into keys or hidden paths.
// Problems are returned as text for Claude to read, not thrown.

const MAX_LINES = 300;
const MAX_HITS = 40;
const MAX_SEARCH_FILE_BYTES = 4 * 1024 * 1024;

/** Lines `start`..`end` (1-based, inclusive) with their numbers, so Claude can answer with file:line. */
export async function readLines(scope: ReadScope, path: string, start = 1, end?: number): Promise<string> {
  const a = await access(scope, path);
  if (!a.ok) return refusal(a.why, path);
  const text = await readFile(a.path, "utf8").catch(() => null);
  if (text === null) return `ファイルがありません: ${path}`;
  const lines = text.split("\n");
  const from = Math.max(1, start);
  const to = Math.min(lines.length, end ?? from + MAX_LINES - 1, from + MAX_LINES - 1);
  if (from > lines.length) return `${path} は ${lines.length} 行しかありません`;
  const body = lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(6)}| ${l}`);
  const more = to < lines.length ? `\n（${path} は全 ${lines.length} 行。続きは start_line=${to + 1} で読めます）` : "";
  return body.join("\n") + more;
}

/** The entries of one directory, directories marked with a trailing slash. Hidden entries are left out. */
export async function listDir(scope: ReadScope, path = "."): Promise<string> {
  const a = await access(scope, path);
  if (!a.ok) return refusal(a.why, path, "見られません");
  const entries = await readdir(a.path, { withFileTypes: true }).catch(() => null);
  if (!entries) return `ディレクトリがありません: ${path}`;
  const names = await Promise.all(
    entries.map(async (e) => {
      const entry = await access(scope, join(a.rel, e.name));
      if (!entry.ok) return null;
      // A linked dependency directory reports as a link, not a directory; stat follows it.
      return (await stat(entry.path).catch(() => null))?.isDirectory() ? `${e.name}/` : e.name;
    }),
  );
  return names.filter((n): n is string => n !== null).sort().join("\n") || "（空です）";
}

/** Lines containing `text` (plain text, not a pattern) under `path`, as file:line: content. */
export async function searchText(scope: ReadScope, text: string, path = "."): Promise<string> {
  const start = await access(scope, path);
  if (!start.ok) return refusal(start.why, path, "探せません");
  if (text === "") return "探す文字列が空です";
  const hits: string[] = [];
  // Hidden folders are not entered and hidden files not opened, so nothing in them is quoted.
  const visit = async (rel: string): Promise<void> => {
    if (hits.length >= MAX_HITS) return;
    const a = await access(scope, rel);
    if (!a.ok) return;
    const s = await stat(a.path).catch(() => null);
    if (s?.isDirectory()) {
      for (const name of (await readdir(a.path)).sort()) await visit(join(a.rel, name));
    } else if (s?.isFile() && s.size <= MAX_SEARCH_FILE_BYTES) {
      const lines = (await readFile(a.path, "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (hits.length < MAX_HITS && line.includes(text)) hits.push(`${a.rel}:${i + 1}: ${line.trim().slice(0, 200)}`);
      });
    }
  };
  await visit(start.rel);
  if (hits.length === 0) return `見つかりません: ${text}`;
  return hits.join("\n") + (hits.length >= MAX_HITS ? `\n（${MAX_HITS} 件で打ち切りました。範囲を絞ってください）` : "");
}
