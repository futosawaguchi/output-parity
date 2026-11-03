// Deprecation warnings printed only by the new environment (R14). Not used for any verdict and
// never sent to Claude: the output may be the same today and still break at the next upgrade
// ("every version becomes an old version"). Only deprecations are counted: other warnings are
// reworded between versions (PHP 7.4 "Invalid argument supplied for foreach()" is PHP 8's
// "foreach() argument must be of type array|object"), so "new only" would mostly be rewording.

import { STDERR_CUT_MARK } from "../runner/exec";

/** The shapes of a deprecation line: PHP (CLI and built-in server log), Python, Node. */
const PATTERNS = [/\bDeprecated:\s+\S/, /\b(?:Pending)?DeprecationWarning:\s+\S/, /\bFutureWarning:\s+\S/];

export type StderrText = { caseId: string; slot: "old" | "new"; text: string };

export type Deprecation = {
  /** The line as the new environment first printed it. */
  message: string;
  /** The file it points at (its base name), when the line names one. */
  file: string | null;
  /** The cases whose new run printed it, in the order given. */
  caseIds: string[];
};

export type NewOnly = {
  deprecations: Deprecation[];
  /** Cases whose new stderr was cut at its size limit: what came after was not counted. */
  cutCaseIds: string[];
};

/** Deprecations printed by a new run and never by an old one, in the order first seen. */
export function newOnlyDeprecations(texts: StderrText[]): NewOnly {
  const seenInOld = new Set(texts.filter((t) => t.slot === "old").flatMap((t) => linesOf(t.text).map(keyOf)));
  const found = new Map<string, Deprecation>();
  for (const t of texts.filter((t) => t.slot === "new")) {
    for (const line of linesOf(t.text)) {
      const key = keyOf(line);
      if (seenInOld.has(key)) continue;
      const item = found.get(key) ?? { message: line, file: fileOf(line), caseIds: [] };
      if (!item.caseIds.includes(t.caseId)) item.caseIds.push(t.caseId);
      found.set(key, item);
    }
  }
  const cutCaseIds = texts.filter((t) => t.slot === "new" && t.text.includes(STDERR_CUT_MARK)).map((t) => t.caseId);
  return { deprecations: [...found.values()], cutCaseIds: [...new Set(cutCaseIds)] };
}

/**
 * The deprecation lines of one stderr, without the timestamp a server log puts in front. A stderr
 * cut at its limit ends in a line cut part-way, just before the note saying so: that line is left out.
 */
function linesOf(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const cut = lines.findIndex((line) => line.startsWith(STDERR_CUT_MARK));
  return (cut === -1 ? lines : lines.slice(0, Math.max(cut - 1, 0)))
    .filter((line) => PATTERNS.some((p) => p.test(line)))
    .map((line) => line.replace(/^\[[^\]]*\]\s*/, "").trim());
}

/** Line numbers and other numbers move between versions of the same code; they are not what is said. */
function keyOf(line: string): string {
  return line.replace(/\d+/g, "N").replace(/\s+/g, " ");
}

function fileOf(line: string): string | null {
  const m = / in (\S+?\.\w+)(?: on line \d+|:\d+)/.exec(line) ?? /^(\S+?\.\w+):\d+:/.exec(line) ?? /([\w./-]+\.\w+):\d+/.exec(line);
  return m ? m[1].split("/").at(-1)! : null;
}
