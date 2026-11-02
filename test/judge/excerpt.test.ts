import assert from "node:assert/strict";
import { test } from "node:test";
import type { Change } from "../../lib/compare/baseline";
import { buildUserMessage, EXCERPT_CONTEXT, excerptAround, excerptFor, MAX_FULL_CHARS, type JudgeInput } from "../../lib/judge/prompt";

// The whole new output is sent (DESIGN 8-2), except when it is too long: then the lines around
// each change, and the message says so. A short output must never be cut.

const input = (newLines: string[], changeAt: number): JudgeInput => {
  const change = { oldStart: changeAt, newStart: changeAt, oldLines: ["旧の行"], newLines: [newLines[changeAt]], explainedByBaseline: false } as Change;
  return {
    oldLabel: "旧",
    newLabel: "新",
    outputDescription: "テキスト",
    oldExit: "0",
    newExit: "0",
    oldLines: newLines,
    newLines,
    kept: [change],
    dropped: [],
    oldPages: [],
    newPages: [],
    unreadable: [],
    excerpt: excerptFor(newLines),
  };
};

test("a short output is sent whole", () => {
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`);
  const message = buildUserMessage(input(lines, 100));
  assert.equal(excerptFor(lines), null);
  assert.match(message, /新しい出力の全文/);
  assert.match(message, /line 0\n/);
  assert.doesNotMatch(message, /行省略/);
});

test("a long output is sent as the lines around the change, and the message says it is not the whole", () => {
  const lines = Array.from({ length: 20_000 }, (_, i) => `log entry number ${i} ok`);
  assert.ok(lines.join("\n").length > MAX_FULL_CHARS);
  const message = buildUserMessage(input(lines, 10_000));
  assert.match(message, /全文ではなく、変更の前後 30 行ずつだけ/);
  assert.match(message, new RegExp(`log entry number ${10_000 - EXCERPT_CONTEXT} ok`));
  assert.doesNotMatch(message, /log entry number 5 ok/);
  assert.match(message, /…（\d+ 行省略）/);
});

test("lines far from every change are counted where they were left out", () => {
  const marked = ["  a", "  b", "  c", "+ [C1] d", "  e", "  f", "  g"];
  assert.deepEqual(excerptAround(marked, 1), ["…（2 行省略）", "  c", "+ [C1] d", "  e", "…（2 行省略）"]);
});
