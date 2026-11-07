import { diffLines, type Hunk } from "./line-diff";

// The baseline knows nothing about formats: it never says "ignore /CreationDate".
// It only learns which lines differ between two runs in the same environment with the
// same input (DESIGN 4-2). Those lines have no reason to differ, so they change on every run.
//
// Within such a line only the parts that actually changed are set aside. A line can hold a
// timestamp next to an amount ("発行 10:00:01 合計 72,000"): the timestamp changes on every run,
// the amount does not, and a changed amount must still reach the judge.

/**
 * Which parts of an unstable line may differ: per token, or the whole line when it cannot tell.
 * A pair [from, to] means only the characters from..to-1 of the token may differ (see changedPart).
 */
export type Unstable = (boolean | [number, number])[] | "whole";

/** How many unchanged digits must follow a change inside a token before they are kept. */
const KEPT_TAIL = 4;

/** Half-width and full-width digits, and what a time puts between them. */
const DIGIT = /[0-9０-９]/;
const TIME = /[0-9０-９:：.．]/;

/**
 * A line in pieces: a run of ASCII letters and digits with the separators inside it
 * (10:00:01 / 2026-11-02T07:17:45+00:00 / uuid:32067e12-e78d-…), a run of white space,
 * or a run of anything else (Japanese text, which often sits right next to a number with no
 * space: "合計72" stays two pieces). Pure text: no knowledge of any format.
 *
 * A comma always ends a piece. In a CSV row ("10:00:05,1001,57000") it separates fields, and a
 * timestamp that changes on every run must not carry the amount next to it into the set-aside
 * part. "72,000" becomes three pieces; only the pieces that changed are set aside, so a changed
 * amount still reaches the judge.
 *
 * Full-width letters and digits are read the same way: Japanese forms often write
 * "合計７２，０００円（１０：００：０１発行）", and the amount and the time must be pieces of their own.
 */
export function tokens(line: string): string[] {
  return line.match(/[A-Za-z0-9Ａ-Ｚａ-ｚ０-９][A-Za-z0-9Ａ-Ｚａ-ｚ０-９.:\-/+'_．：－／＋＿]*|\s+|[^A-Za-z0-9Ａ-Ｚａ-ｚ０-９\s]+/g) ?? [];
}

/** Lines in `current` that are not reproduced by `repeat` (same environment, same input), and how. */
export function unstableLines(current: string[], repeat: string[]): Map<number, Unstable> {
  const unstable = new Map<number, Unstable>();
  for (const hunk of diffLines(current, repeat)) {
    hunk.oldLines.forEach((line, k) => {
      const other = hunk.oldLines.length === hunk.newLines.length ? hunk.newLines[k] : undefined;
      unstable.set(hunk.oldStart + k, other === undefined ? "whole" : changedTokens(line, other));
    });
  }
  return unstable;
}

function changedTokens(a: string, b: string): Unstable {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length !== tb.length) return "whole";
  return ta.map((t, i) => (t === tb[i] ? false : changedPart(t, tb[i])));
}

/**
 * The part of a token that changes on every run, when the rest of it can still be compared.
 * A token can hold more than a timestamp: a fixed-width record has no separator between its
 * fields ("H20261107100001" then a count and an amount), and a file name holds an amount before
 * its time ("estimate_72000_20261107100001.pdf"). So when the two runs differ in digits only:
 * - the part set aside starts where the changed digits start, taken back over the digits and
 *   time separators before them, since a time's higher digits can roll over between old and new;
 * - it ends at the last changed digit, when what follows starts with something other than a digit
 *   or runs KEPT_TAIL characters or more. A short run of digits there can agree by chance.
 * A token whose letters change too (a random id) is set aside whole: its unchanged letters are chance.
 */
function changedPart(a: string, b: string): [number, number] | true {
  if (a.length !== b.length) return true;
  const changed = [...a].flatMap((c, i) => (c === b[i] ? [] : [i]));
  if (changed.some((i) => !DIGIT.test(a[i]) || !DIGIT.test(b[i]))) return true;
  let from = changed[0];
  while (from > 0 && TIME.test(a[from - 1])) from--;
  const after = changed[changed.length - 1] + 1;
  const to = after === a.length || (DIGIT.test(a[after]) && a.length - after < KEPT_TAIL) ? a.length : after;
  return from === 0 && to === a.length ? true : [from, to];
}

/**
 * Whether `oldLine` equals `newLine` once the parts that change on every run are set aside.
 * A line the second run could not pair up ("whole") says nothing about which parts change, so
 * any difference in it is kept: setting it aside could hide a changed amount.
 */
export function sameApartFromUnstable(oldLine: string, newLine: string, unstable: Unstable): boolean {
  if (unstable === "whole") return oldLine === newLine;
  const to = tokens(oldLine);
  const tn = tokens(newLine);
  return to.length === tn.length && tn.every((t, i) => samePiece(to[i], t, unstable[i]));
}

function samePiece(oldPiece: string, newPiece: string, unstable: boolean | [number, number]): boolean {
  if (unstable === true) return true;
  if (unstable === false) return oldPiece === newPiece;
  const [from, to] = unstable;
  return oldPiece.length === newPiece.length && oldPiece.slice(0, from) === newPiece.slice(0, from) && oldPiece.slice(to) === newPiece.slice(to);
}

export type Change = Hunk & {
  /** True when every new line here is one that also changed between two runs of the new environment. */
  explainedByBaseline: boolean;
};

/**
 * Splits old-vs-new hunks into changes and marks those the baseline explains.
 * Only a one-for-one replacement of an unstable line that differs from the old line in its
 * unstable parts alone is explained; a line that appeared or disappeared is never explained,
 * so the baseline can drop too little but not too much.
 */
export function applyBaseline(hunks: Hunk[], unstableInNew: Map<number, Unstable>): Change[] {
  const changes: Change[] = [];
  for (const hunk of hunks) {
    if (hunk.oldLines.length !== hunk.newLines.length) {
      changes.push({ ...hunk, explainedByBaseline: false });
      continue;
    }
    // Same length: pair lines up so a stable line does not keep a neighbouring date unexplained.
    let pending: Change | null = null;
    hunk.newLines.forEach((line, k) => {
      const unstable = unstableInNew.get(hunk.newStart + k);
      const explained = unstable !== undefined && sameApartFromUnstable(hunk.oldLines[k], line, unstable);
      if (pending && pending.explainedByBaseline === explained) {
        pending.oldLines.push(hunk.oldLines[k]);
        pending.newLines.push(line);
        return;
      }
      if (pending) changes.push(pending);
      pending = {
        oldStart: hunk.oldStart + k,
        oldLines: [hunk.oldLines[k]],
        newStart: hunk.newStart + k,
        newLines: [line],
        explainedByBaseline: explained,
      };
    });
    if (pending) changes.push(pending);
  }
  return changes;
}
