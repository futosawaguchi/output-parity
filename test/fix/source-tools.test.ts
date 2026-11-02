import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkEdit, checkLine } from "../../lib/fix/check-cause";
import { listDir, readLines, searchText } from "../../lib/fix/source-tools";

const APP = ["<?php", "$rows = load();", "if ($r['deleted'] == 0) {", "    show($r);", "}", ""].join("\n");

function scopeOf(root: string) {
  return { root, alsoAllow: [], neverRead: [] };
}

async function source(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "output-parity-"));
  await mkdir(join(root, "data"));
  await writeFile(join(root, "app.php"), APP);
  await writeFile(join(root, "data", "input.json"), '{"deleted": ""}\n');
  return root;
}

test("lines are read with their numbers, so an answer can say file:line", async () => {
  const out = await readLines(scopeOf(await source()), "app.php", 3, 3);
  assert.equal(out, "     3| if ($r['deleted'] == 0) {\n（app.php は全 6 行。続きは start_line=4 で読めます）");
});

test("reading outside the source directory is refused, not thrown", async () => {
  assert.match(await readLines(scopeOf(await source()), "../../etc/hosts"), /外です/);
});

test("directories are listed with a trailing slash", async () => {
  assert.equal(await listDir(scopeOf(await source())), "app.php\ndata/");
});

test("search answers with file:line", async () => {
  assert.equal(await searchText(scopeOf(await source()), "deleted"), "app.php:3: if ($r['deleted'] == 0) {\ndata/input.json:1: {\"deleted\": \"\"}");
});

test("the line Claude quoted is checked against the file", async () => {
  const root = await source();
  assert.equal(await checkLine(root, "app.php", 3, "  if ($r['deleted'] == 0) {"), "matches");
  assert.equal(await checkLine(root, "app.php", 4, "if ($r['deleted'] == 0) {"), "differs");
  assert.equal(await checkLine(root, "app.php", 99, "x"), "missing");
  assert.equal(await checkLine(root, "nope.php", 1, "x"), "missing");
});

test("an edit is applicable only when its text occurs exactly once", async () => {
  const root = await source();
  assert.equal(await checkEdit(root, "app.php", "$r['deleted'] == 0"), "once");
  assert.equal(await checkEdit(root, "app.php", "$r['removed']"), "notFound");
  assert.equal(await checkEdit(root, "app.php", "$r"), "several");
});
