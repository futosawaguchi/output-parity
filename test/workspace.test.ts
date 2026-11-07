import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readlink, symlink, writeFile } from "node:fs/promises";
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
  await prepareWorkspace(source, work, ["vendor"]);
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
  await prepareWorkspace(source, work, ["vendor"]);
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

/** A source whose config is a link: one to a file beside it, one to a folder outside the source. */
async function setUpLinks() {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  const source = join(dir, "samples");
  await mkdir(join(dir, "shared"), { recursive: true });
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "config.local.php"), "<?php return 1;\n");
  await writeFile(join(dir, "shared", "config.prod.php"), "<?php return 2;\n");
  await symlink("config.local.php", join(source, "config.php"));
  await symlink("../shared/config.prod.php", join(source, "prod.php"));
  const work = join(dir, "work");
  await prepareWorkspace(source, work, []);
  return { dir, source, work };
}

test("a link in the source stays a link in work/, so the program still finds its file", async () => {
  const { work } = await setUpLinks();
  assert.ok((await lstat(join(work, "config.php"))).isSymbolicLink());
  assert.equal(await readFile(join(work, "config.php"), "utf8"), "<?php return 1;\n");
  assert.equal(await readFile(join(work, "prod.php"), "utf8"), "<?php return 2;\n");
});

test("a link to a file inside the source leads to its copy in work/, never to the original", async () => {
  const { source, work } = await setUpLinks();
  assert.equal(await readlink(join(work, "config.php")), join(work, "config.local.php"));
  const writable = await writableFile(work, "config.php");
  assert.ok(writable);
  await writeFile(writable, "changed\n");
  assert.equal(await readFile(join(source, "config.local.php"), "utf8"), "<?php return 1;\n");
});

test("writing through a link to a file outside the source is refused", async () => {
  const { work } = await setUpLinks();
  assert.equal(await writableFile(work, "prod.php"), null);
});
