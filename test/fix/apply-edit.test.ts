import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyEdit } from "../../lib/fix/apply-edit";

const SOURCE = ["<?php", "foreach ($rows as $r) {", "    if ($r['deleted'] == 0) {", "        $shown[] = $r;", "    }", "}", ""].join("\n");

async function work(text = SOURCE): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  await writeFile(join(dir, "app.php"), text);
  return dir;
}

test("an edit that matches once is written, and its line is reported", async () => {
  const dir = await work();
  const result = await applyEdit(dir, { file: "app.php", oldText: "$r['deleted'] == 0", newText: "(int)$r['deleted'] === 0" });
  assert.deepEqual(result, { kind: "applied", file: "app.php", line: 3 });
  assert.match(await readFile(join(dir, "app.php"), "utf8"), /if \(\(int\)\$r\['deleted'\] === 0\)/);
});

test("an edit whose text is not in the file is refused and nothing is written", async () => {
  const dir = await work();
  const result = await applyEdit(dir, { file: "app.php", oldText: "$r['removed'] == 0", newText: "x" });
  assert.equal(result.kind, "refused");
  assert.equal(await readFile(join(dir, "app.php"), "utf8"), SOURCE);
});

test("an edit whose text appears twice is refused rather than guessed", async () => {
  const dir = await work(SOURCE + SOURCE);
  const result = await applyEdit(dir, { file: "app.php", oldText: "$r['deleted'] == 0", newText: "x" });
  assert.equal(result.kind, "refused");
  assert.equal(await readFile(join(dir, "app.php"), "utf8"), SOURCE + SOURCE);
});

test("an empty text to replace is refused", async () => {
  const dir = await work();
  assert.equal((await applyEdit(dir, { file: "app.php", oldText: "", newText: "x" })).kind, "refused");
});

test("a file outside work/ is refused", async () => {
  const dir = await work();
  assert.equal((await applyEdit(dir, { file: "../app.php", oldText: "<?php", newText: "x" })).kind, "refused");
});
