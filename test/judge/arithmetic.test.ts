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
