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
  | { kind: "break" };

/**
 * Finds chains like "a + b = c ≠ d（差 e）" and checks each relation in them.
 * Returns nothing for text it cannot read; a missing check is not a failed check.
 */
export function checkArithmetic(calculation: string): ArithmeticCheck[] {
  const tokens = tokenize(calculation);
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
      const rel = tokens[i];
      if (rel?.kind !== "rel") break;
      const right = readExpression(tokens, skipLabels(tokens, i + 1));
      if (!right) break;
      const holds = rel.equal ? same(left.value, right.value) : !same(left.value, right.value);
      checks.push({ text: `${left.text} ${rel.text} ${right.text}`, ok: holds });
      i = right.end;

      // "（差 e）" right after "≠" states the size of the gap: check it too.
      const d = skipLabels(tokens, i);
      if (!rel.equal && tokens[d]?.kind === "diff") {
        const gap = readExpression(tokens, skipLabels(tokens, d + 1));
        if (gap) {
          checks.push({ text: `|${left.text} − ${right.text}| = ${gap.text}`, ok: same(Math.abs(left.value - right.value), gap.value) });
          i = gap.end;
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
  while (tokens[i]?.kind === "op" && tokens[i + 1]?.kind === "num") {
    const op = tokens[i] as Extract<Token, { kind: "op" }>;
    const num = tokens[i + 1] as Extract<Token, { kind: "num" }>;
    value += op.sign * num.value;
    parts.push(op.text, num.text);
    i += 2;
  }
  return { value, text: parts.join(" "), end: i };
}

function skipLabels(tokens: Token[], i: number): number {
  while (tokens[i]?.kind === "label") i++;
  return i;
}

function same(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

// Separators that end a chain: "／" between the old and new side, sentence ends, and so on.
const BREAK = /^[／/;；。\n|]$/;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // Times (06:07:02) and dates (2026-11-02) come first so their parts are not read as arithmetic.
  const re =
    /(\s+)|(\d{1,2}(?::\d{2}){1,2}|\d{4}-\d{1,2}-\d{1,2})|((?<![\p{L}\d])\d[\d,]*(?:\.\d+)?円?(?![\p{L}\d]))|([+＋\-−－])|([=＝])|(≠)|(差)|([A-Za-z][\w-]*|[\p{L}\d]+)|(.)/gu;
  for (const m of text.matchAll(re)) {
    const [whole, space, stamp, num, op, eq, ne, diff, word, other] = m;
    if (space) continue;
    if (stamp) tokens.push({ kind: "label" });
    else if (num) tokens.push({ kind: "num", value: Number(num.replace(/[,円]/g, "")), text: num });
    else if (op) tokens.push({ kind: "op", sign: op === "+" || op === "＋" ? 1 : -1, text: op === "+" || op === "＋" ? "+" : "−" });
    else if (eq) tokens.push({ kind: "rel", equal: true, text: "=" });
    else if (ne) tokens.push({ kind: "rel", equal: false, text: "≠" });
    else if (diff) tokens.push({ kind: "diff" });
    else if (word) tokens.push({ kind: "label" });
    else if (other && BREAK.test(other)) tokens.push({ kind: "break" });
    else if (whole) tokens.push({ kind: "label" });
  }
  return tokens;
}
