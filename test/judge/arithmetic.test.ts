import assert from "node:assert/strict";
import { test } from "node:test";
import { checkArithmetic } from "../../lib/judge/arithmetic";

// The inputs are shapes Claude actually wrote in `calculation` during the 2026-11-02 runs.

test("a sum, an inequality and the stated gap are all checked", () => {
  const checks = checkArithmetic("新: 15,000 + 42,000 = 57,000 ≠ 72,000（差 15,000）");
  assert.deepEqual(
    checks.map((c) => [c.text, c.ok]),
    [
      ["15,000 + 42,000 = 57,000", true],
      ["57,000 ≠ 72,000", true],
      ["|57,000 − 72,000| = 15,000", true],
    ],
  );
});

test("both sides separated by ／ are read, with a Unicode minus", () => {
  const checks = checkArithmetic("新: 15,000 + 42,000 = 57,000 ≠ 72,000（差 15,000）／旧: 15,000 + 8,000 + 12,000 + 42,000 − 5,000 = 72,000");
  assert.equal(checks.length, 4);
  assert.ok(checks.every((c) => c.ok));
});

test("a wrong sum is reported as not ok", () => {
  const [check] = checkArithmetic("15,000 + 42,000 = 58,000");
  assert.equal(check.ok, false);
});

test("a wrong gap is reported as not ok", () => {
  const checks = checkArithmetic("57,000 ≠ 72,000（差 14,000）");
  assert.deepEqual(checks.map((c) => c.ok), [true, false]);
});

test("labels between = and the number are skipped", () => {
  const checks = checkArithmetic("15,000 + 42,000 = 57,000 = 合計 57,000（差 0）");
  assert.deepEqual(checks.map((c) => c.ok), [true, true]);
});

test("numbers glued to words are not read as numbers", () => {
  // "3行" and "A-101" are not quantities; reading them would make a false failure.
  const checks = checkArithmetic("文字数 144 − 116 = 28 = 消えた3行の文字数 9 + 10 + 9／A-101 は消えた");
  assert.deepEqual(
    checks.map((c) => [c.text, c.ok]),
    [
      ["144 − 116 = 28", true],
      ["28 = 9 + 10 + 9", true],
    ],
  );
});

test("text without arithmetic gives no checks", () => {
  assert.deepEqual(checkArithmetic("並び順が変わった"), []);
  assert.deepEqual(checkArithmetic(""), []);
});

test("times and dates are not read as arithmetic", () => {
  assert.deepEqual(checkArithmetic("06:07:02 − 06:07:01 = 1 秒"), []);
  assert.deepEqual(checkArithmetic("発行日 2026-11-02 = 2026-11-02"), []);
  const checks = checkArithmetic("06:07:02 − 06:07:01 = 1 秒。本文の検算: 15,000 + 42,000 − 5,000 = 52,000");
  assert.deepEqual(checks.map((c) => [c.text, c.ok]), [["15,000 + 42,000 − 5,000 = 52,000", true]]);
});

test("a chain with a multiplication is left alone rather than half-read", () => {
  assert.deepEqual(checkArithmetic("1,000 × 3 = 3,000"), []);
  assert.deepEqual(checkArithmetic("57,000 x 1.1 = 62,700"), []);
});

test("an x that is part of a word is not a multiplication", () => {
  assert.deepEqual(checkArithmetic("x 座標 10 + 5 = 15"), [{ text: "10 + 5 = 15", ok: true }]);
});

test("an equation that goes on about the gap is checked against the gap, not the right-hand side", () => {
  const checks = checkArithmetic("新: 2.5 + 1.5 + 1.0 + 3.0 = 8.0 ≠ 3.5（差 4.5 = 伊藤の2行 1.5 + 3.0）");
  assert.ok(checks.every((c) => c.ok), JSON.stringify(checks));
  assert.ok(checks.some((c) => c.text === "4.5 = 1.5 + 3.0"));
  assert.equal(checkArithmetic("8.0 ≠ 3.5（差 4.5 = 1.5 + 2.0）").at(-1)?.ok, false);
});

test("a term with a note in brackets before the next one is still part of the sum", () => {
  const checks = checkArithmetic("文字数 144 − 116 = 28 = 9（A-101出張費0）+ 10（A-102夜間割増0）+ 9（A-104値引き0）で、他に消えた文字はない");
  assert.ok(checks.every((c) => c.ok), JSON.stringify(checks));
  assert.ok(checks.some((c) => c.text === "28 = 9 + 10 + 9"));
  assert.equal(checkArithmetic("15,000（基本料）+ 8,000（出張費）= 24,000").at(-1)?.ok, false);
});

test("a note is one unit: its own equation is checked, but its numbers are not taken as the other side", () => {
  const inNote = checkArithmetic("15,000 + 42,000 = 57,000 = 合計（旧も 15,000 + 0 + 0 + 42,000 + 0 = 57,000）");
  assert.deepEqual(inNote.map((c) => c.text), ["15,000 + 42,000 = 57,000", "15,000 + 0 + 0 + 42,000 + 0 = 57,000"]);
  assert.ok(checkArithmetic("15,000 + 42,000 = 57,000 = 合計（旧の0円行を足しても +0 で同じ）").every((c) => c.ok));
});

test("a number written right after Japanese text is a number; one glued to Latin letters is a name", () => {
  assert.ok(checkArithmetic("13.0 ≠ 7.0（差 6.0 = 重複した2行の4.0 + 2.0）").every((c) => c.ok));
  assert.ok(checkArithmetic("A101 + 5 = 5").every((c) => !c.text.includes("101")));
});

test("a quoted name is one label, even with a number at its end, and a term may follow its label", () => {
  // Claude's own wording on 11/3: the 0 inside the quotes is part of the quoted text, not a term.
  const checks = checkArithmetic("文字数 144 − 116 = 28 = 「A-101出張費0」9 + 「A-102夜間割増0」10 + 「A-104値引き0」9");
  assert.deepEqual(checks.map((c) => [c.text, c.ok]), [
    ["144 − 116 = 28", true],
    ["28 = 9 + 10 + 9", true],
  ]);
  assert.ok(checkArithmetic("57,000 − 値引き 5,000 = 52,000").every((c) => c.ok));
  assert.ok(!checkArithmetic("28 = 『A』9 + 『B』10").every((c) => c.ok), "a wrong sum is still wrong");
});
