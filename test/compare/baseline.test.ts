import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBaseline, unstableLines } from "../../lib/compare/baseline";
import { diffLines } from "../../lib/compare/line-diff";

test("lines that differ between two runs of the same environment are unstable", () => {
  const first = ["date: 10:00:01", "body", "id: aaa"];
  const second = ["date: 10:00:02", "body", "id: bbb"];
  assert.deepEqual([...unstableLines(first, second)].sort(), [0, 2]);
});

test("identical runs have no unstable lines", () => {
  assert.equal(unstableLines(["a", "b"], ["a", "b"]).size, 0);
});

test("a replaced unstable line is explained by the baseline", () => {
  const old = ["date: 09:00", "body"];
  const now = ["date: 10:00", "body"];
  const changes = applyBaseline(diffLines(old, now), new Set([0]));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].explainedByBaseline, true);
});

test("a removed line is never explained, even next to unstable lines", () => {
  const old = ["date: 09:00", "row A", "total"];
  const now = ["date: 10:00", "total"];
  const changes = applyBaseline(diffLines(old, now), new Set([0]));
  assert.ok(changes.some((c) => c.oldLines.includes("row A") && !c.explainedByBaseline));
});

test("a replaced stable line stays unexplained even when it neighbours an unstable one", () => {
  const old = ["date: 09:00", "producer: v1", "body"];
  const now = ["date: 10:00", "producer: v2", "body"];
  const changes = applyBaseline(diffLines(old, now), new Set([0]));
  assert.deepEqual(
    changes.map((c) => [c.newLines, c.explainedByBaseline]),
    [
      [["date: 10:00"], true],
      [["producer: v2"], false],
    ],
  );
});

test("without a baseline nothing is explained", () => {
  const changes = applyBaseline(diffLines(["a"], ["b"]), new Set());
  assert.equal(changes[0].explainedByBaseline, false);
});
