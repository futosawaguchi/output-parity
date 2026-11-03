// Checks the arithmetic Claude writes in `calculation` (DESIGN 8-3). Pure arithmetic only:
// it knows nothing about documents, so it adds no document-specific rule (DESIGN 7-9).
// No Node imports: the page in the browser uses this file.

export type ArithmeticCheck = { text: string; ok: boolean };

type Token =
  | { kind: "num"; value: number; text: string }
  | { kind: "op"; sign: 1 | -1; text: string }
  | { kind: "rel"; equal: boolean; text: string }
  | { kind: "diff" }
  | { kind: "label" }
  /** Brackets around a note, as in "9（A-101 出張費）" or "≠ 72,000（差 15,000）". */
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "break" }
  /** ×, ÷, % and the like: this checker only adds and subtracts, so a chain with one is left alone. */
  | { kind: "unsupported" };

/**
 * Finds chains like "a + b = c ≠ d（差 e）" and checks each relation in them.
 * Returns nothing for text it cannot read; a missing check is not a failed check.
 */
export function checkArithmetic(calculation: string): ArithmeticCheck[] {
  return readCalculation(calculation).checks;
}

/**
 * The checks, and how many statements were left alone because they multiply or divide, so the
 * page can say what was not checked instead of staying silent (a missing check is not a pass).
 */
export function readCalculation(calculation: string): { checks: ArithmeticCheck[]; skipped: number } {
  // Each chain (between separators such as "／") is checked on its own; one with a
  // multiplication in it is skipped whole, rather than half-read and wrongly called false.
  const all = chains(tokenize(calculation));
  const unsupported = (chain: Token[]) => chain.some((t) => t.kind === "unsupported");
  return {
    checks: all.filter((chain) => !unsupported(chain)).flatMap(checkChain),
    skipped: all.filter((chain) => unsupported(chain) && chain.some((t) => t.kind === "rel")).length,
  };
}

function chains(tokens: Token[]): Token[][] {
  const out: Token[][] = [[]];
  for (const t of tokens) {
    if (t.kind === "break") out.push([]);
    else out[out.length - 1].push(t);
  }
  return out;
}

function checkChain(tokens: Token[]): ArithmeticCheck[] {
  const checks: ArithmeticCheck[] = [];

  let i = 0;
  while (i < tokens.length) {
    let left = readExpression(tokens, i);
    if (!left) {
      i++;
      continue;
    }
    i = left.end;
    for (;;) {
      // "57,000（合計）= 57,000": a note may also stand between a side and the relation.
      const at = skipLabels(tokens, i);
      const rel = tokens[at];
      if (rel?.kind !== "rel") break;
      i = at;
      // A sign is part of the right-hand side only right after the relation: "= 合計（… +0 …）" is not "= +0".
      const from = skipLabels(tokens, i + 1);
      if (from !== i + 1 && tokens[from]?.kind === "op") break;
      const right = readExpression(tokens, from);
      if (!right) break;
      const holds = rel.equal ? same(left.value, right.value) : !same(left.value, right.value);
      checks.push({ text: `${left.text} ${rel.text} ${right.text}`, ok: holds });
      i = right.end;

      // "（差 e）" right after "≠" states the size of the gap: check it too.
      let d = skipLabels(tokens, i, false);
      if (tokens[d]?.kind === "open" && tokens[d + 1]?.kind === "diff") d++;
      if (!rel.equal && tokens[d]?.kind === "diff") {
        const gap = readExpression(tokens, skipLabels(tokens, d + 1));
        if (gap) {
          checks.push({ text: `|${left.text} − ${right.text}| = ${gap.text}`, ok: same(Math.abs(left.value - right.value), gap.value) });
          i = gap.end;
          // "（差 e = a + b）" goes on about the gap, not about the right-hand side.
          left = gap;
          continue;
        }
      }
      left = right;
    }
  }
  return checks;
}

function readExpression(tokens: Token[], start: number): { value: number; text: string; end: number } | null {
  let i = start;
  let sign: 1 | -1 = 1;
  const parts: string[] = [];
  const first = tokens[i];
  if (first?.kind === "op") {
    sign = first.sign;
    parts.push(first.text);
    i++;
  }
  const head = tokens[i];
  if (head?.kind !== "num") return null;
  let value = sign * head.value;
  parts.push(head.text);
  i++;
  for (;;) {
    // A term may carry a note before the next one: "9（A-101 出張費）+ 10（A-102 夜間割増）",
    // and a name after the sign: "+ 「A-102夜間割増0」10", "− 値引き 5,000".
    const j = skipLabels(tokens, i);
    if (tokens[j]?.kind !== "op") break;
    let k = j + 1;
    while (tokens[k]?.kind === "label") k++;
    if (tokens[k]?.kind !== "num") break;
    const op = tokens[j] as Extract<Token, { kind: "op" }>;
    const num = tokens[k] as Extract<Token, { kind: "num" }>;
    value += op.sign * num.value;
    parts.push(op.text, num.text);
    i = k + 1;
  }
  return { value, text: parts.join(" "), end: i };
}

/**
 * Past words and notes in brackets, to the next thing that counts. A note is skipped whole (the
 * numbers in it are not terms), unless it states a gap ("（差 e）"), which the caller reads;
 * `notes` false stops at any bracket.
 */
function skipLabels(tokens: Token[], i: number, notes = true): number {
  for (;;) {
    const t = tokens[i];
    if (t?.kind === "label" || t?.kind === "close") i++;
    else if (notes && t?.kind === "open" && tokens[i + 1]?.kind !== "diff") {
      let depth = 0;
      do {
        if (tokens[i].kind === "open") depth++;
        else if (tokens[i].kind === "close") depth--;
        i++;
      } while (depth > 0 && i < tokens.length);
    } else return i;
  }
}

function same(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

// Separators that end a chain: "／" between the old and new side, sentence ends, "、" between
// steps ("4,400 × 10% = 440、4,400 − 440 = 3,960"), and so on.
const BREAK = /^[／/;；。、\n|]$/;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // Times (06:07:02), dates (2026-11-02) and quoted text (「A-101出張費0」) come first so their
  // parts are not read as arithmetic: a quotation is a name, whatever digits it holds.
  const re =
    /(\s+)|(\d{1,2}(?::\d{2}){1,2}|\d{4}-\d{1,2}-\d{1,2}|「[^」]*」|『[^』]*』)|((?<![A-Za-z\d.])\d[\d,]*(?:\.\d+)?円?(?![\p{L}\d]))|([+＋\-−－])|([=＝])|(≠)|(差)|([×*＊÷%％^]|(?<=\d\s?)[xX](?=\s?\d))|([（(])|([）)])|([A-Za-z][\w-]*|\p{L}+)|(.)/gu;
  // A number may follow Japanese text directly ("2行の4.0"); one glued to Latin letters ("A101") is a name.
  for (const m of text.matchAll(re)) {
    const [whole, space, stamp, num, op, eq, ne, diff, mul, open, close, word, other] = m;
    if (space) continue;
    if (stamp) tokens.push({ kind: "label" });
    else if (num) tokens.push({ kind: "num", value: Number(num.replace(/[,円]/g, "")), text: num });
    else if (op) tokens.push({ kind: "op", sign: op === "+" || op === "＋" ? 1 : -1, text: op === "+" || op === "＋" ? "+" : "−" });
    else if (eq) tokens.push({ kind: "rel", equal: true, text: "=" });
    else if (ne) tokens.push({ kind: "rel", equal: false, text: "≠" });
    else if (diff) tokens.push({ kind: "diff" });
    else if (mul) tokens.push({ kind: "unsupported" });
    else if (open) tokens.push({ kind: "open" });
    else if (close) tokens.push({ kind: "close" });
    else if (word) tokens.push({ kind: "label" });
    else if (other && BREAK.test(other)) tokens.push({ kind: "break" });
    else if (whole) tokens.push({ kind: "label" });
  }
  return tokens;
}
