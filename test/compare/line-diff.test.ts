import assert from "node:assert/strict";
import { test } from "node:test";
import { diffLines } from "../../lib/compare/line-diff";

test("identical documents have no hunks", () => {
  assert.deepEqual(diffLines(["a", "b", "c"], ["a", "b", "c"]), []);
});

test("empty documents have no hunks", () => {
  assert.deepEqual(diffLines([], []), []);
});

test("removed lines become separate hunks when a kept line sits between them", () => {
  // The shape of sample 2-b: rows 2 and 3 disappear, row 4 stays, row 5 disappears.
  const old = ["header", "r1", "r2", "r3", "r4", "r5", "total"];
  const now = ["header", "r1", "r4", "total"];
  assert.deepEqual(diffLines(old, now), [
    { oldStart: 2, oldLines: ["r2", "r3"], newStart: 2, newLines: [] },
    { oldStart: 5, oldLines: ["r5"], newStart: 3, newLines: [] },
  ]);
});

test("added lines are reported on the new side", () => {
  assert.deepEqual(diffLines(["a", "c"], ["a", "b", "c"]), [
    { oldStart: 1, oldLines: [], newStart: 1, newLines: ["b"] },
  ]);
});

test("a changed line is one hunk with both sides", () => {
  assert.deepEqual(diffLines(["a", "x", "c"], ["a", "y", "c"]), [
    { oldStart: 1, oldLines: ["x"], newStart: 1, newLines: ["y"] },
  ]);
});

test("every line of either side is accounted for exactly once", () => {
  const old = ["a", "b", "c", "d", "e", "f"];
  const now = ["b", "x", "d", "f", "g"];
  const hunks = diffLines(old, now);
  const removed = hunks.flatMap((h) => h.oldLines);
  const added = hunks.flatMap((h) => h.newLines);
  // Lines common to both, in order, plus what the hunks say changed, must rebuild each side.
  assert.equal(old.length - removed.length, now.length - added.length);
  assert.deepEqual(removed, ["a", "c", "e"]);
  assert.deepEqual(added, ["x", "g"]);
});
