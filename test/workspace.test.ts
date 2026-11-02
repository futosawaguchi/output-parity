import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareWorkspace, writableFile } from "../lib/workspace";

/** A source tree like samples/: the program, its input, and a dependency directory. */
async function setUp() {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  const source = join(dir, "samples");
  await mkdir(join(source, "data"), { recursive: true });
  await mkdir(join(source, "lib", "vendor"), { recursive: true });
  await writeFile(join(source, "app.php"), "<?php echo 1;\n");
  await writeFile(join(source, "data", "input.json"), "{}\n");
  await writeFile(join(source, "lib", "vendor", "dep.php"), "<?php\n");
  const work = join(dir, "work");
  await prepareWorkspace(source, work);
  return { source, work };
}

test("the program and its input are copied; dependencies are linked", async () => {
  const { work } = await setUp();
  assert.ok((await lstat(join(work, "app.php"))).isFile());
  assert.ok((await lstat(join(work, "data", "input.json"))).isFile());
  assert.ok((await lstat(join(work, "lib", "vendor"))).isSymbolicLink());
});

test("preparing again throws away what was changed in work/", async () => {
  const { source, work } = await setUp();
  await writeFile(join(work, "app.php"), "changed\n");
  await prepareWorkspace(source, work);
  assert.equal(await readFile(join(work, "app.php"), "utf8"), "<?php echo 1;\n");
});

test("a file in work/ may be written", async () => {
  const { work } = await setUp();
  assert.ok(await writableFile(work, "app.php"));
  assert.ok(await writableFile(work, "data/input.json"));
});

test("climbing out of work/ is refused", async () => {
  const { work } = await setUp();
  assert.equal(await writableFile(work, "../samples/app.php"), null);
  assert.equal(await writableFile(work, "/etc/hosts"), null);
});

test("writing through a linked dependency into the original is refused", async () => {
  const { work } = await setUp();
  assert.equal(await writableFile(work, "lib/vendor/dep.php"), null);
});

test("a file that does not exist is refused", async () => {
  const { work } = await setUp();
  assert.equal(await writableFile(work, "missing.php"), null);
});
