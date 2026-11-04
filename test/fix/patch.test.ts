import assert from "node:assert/strict";
import { test } from "node:test";
import { makePatch } from "../../lib/fix/patch";

const before = ["<?php", "// 削除されていない明細だけ表示する", "$visible = array();", "foreach ($rows as $r) {", "    if ($r['deleted'] == 0) {", "        $visible[] = $r;", "    }", "}", "echo count($visible);", ""].join("\n");
const after = before.replace("if ($r['deleted'] == 0)", "if ((int)$r['deleted'] == 0)");

test("one changed line becomes one hunk with three lines around it, as diff -u writes it", () => {
  assert.equal(
    makePatch("estimate.php", before, after),
    [
      "--- a/estimate.php",
      "+++ b/estimate.php",
      "@@ -2,7 +2,7 @@",
      " // 削除されていない明細だけ表示する",
      " $visible = array();",
      " foreach ($rows as $r) {",
      "-    if ($r['deleted'] == 0) {",
      "+    if ((int)$r['deleted'] == 0) {",
      "         $visible[] = $r;",
      "     }",
      " }",
      "",
    ].join("\n"),
  );
});

test("lines added or taken away change the counts of each side", () => {
  const patch = makePatch("a.py", "x\ny\nz\n", "x\ny\ny2\nz\n");
  assert.match(patch ?? "", /^@@ -1,3 \+1,4 @@$/m);
  assert.match(patch ?? "", /^\+y2$/m);
});

test("no patch when nothing changes", () => {
  assert.equal(makePatch("a.py", "x\n", "x\n"), null);
});

test("a change at the end of a file applies as diff -u writes it, with or without a newline at the end", () => {
  assert.equal(makePatch("a.py", "x\ny\n", "x\nz\n"), ["--- a/a.py", "+++ b/a.py", "@@ -1,2 +1,2 @@", " x", "-y", "+z", ""].join("\n"));
  assert.equal(makePatch("a.py", "x\ny", "x\nz"), ["--- a/a.py", "+++ b/a.py", "@@ -1,2 +1,2 @@", " x", "-y", "\\ No newline at end of file", "+z", "\\ No newline at end of file", ""].join("\n"));
});
