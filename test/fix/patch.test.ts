import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAll, makePatch } from "../../lib/fix/patch";

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

test("edits pressed one after another are applied in order to the original, the second on top of the first", () => {
  const original = new Map([["worklog.py", "        try:\n            day = parse(entry)\n"]]);
  const result = applyAll(
    [
      { file: "worklog.py", oldText: "        try:\n", newText: '        if entry.endswith("Z"):\n            continue\n        try:\n' },
      { file: "worklog.py", oldText: 'if entry.endswith("Z"):', newText: 'if entry.endswith("Z") or entry[4:5] != "-":' },
    ],
    original,
  );
  assert.ok(result.ok);
  assert.equal(result.after.get("worklog.py"), '        if entry.endswith("Z") or entry[4:5] != "-":\n            continue\n        try:\n            day = parse(entry)\n');
});

test("an edit whose text before is not in the original once, as it was in the copy, makes no patch", () => {
  const original = new Map([["a.py", "x = 1\nx = 1\n"]]);
  assert.deepEqual(applyAll([{ file: "a.py", oldText: "x = 1", newText: "x = 2" }], original), { ok: false, file: "a.py" });
  assert.deepEqual(applyAll([{ file: "b.py", oldText: "y", newText: "z" }], original), { ok: false, file: "b.py" });
});
