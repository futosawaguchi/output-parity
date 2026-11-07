import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ALWAYS_HIDDEN, hiddenBy } from "../../lib/fix/read-scope";
import { listDir, readLines, searchText } from "../../lib/fix/source-tools";

/**
 * An original source (with a key, a dependency and a settings file holding a password) and a
 * work/ copy whose dependency is linked to the original, as prepareWorkspace makes it.
 */
async function setUp() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "output-parity-")));
  const source = join(dir, "source");
  await mkdir(join(source, "vendor", "lib"), { recursive: true });
  await mkdir(join(source, "config"), { recursive: true });
  await writeFile(join(source, "app.php"), "<?php $total = 1; // TOTAL\n");
  await writeFile(join(source, ".env"), "DB_PASSWORD=TOTAL-in-env\n");
  await writeFile(join(source, "server.key"), "TOTAL-in-key\n");
  await writeFile(join(source, "config", "local.php"), "<?php $pass = 'TOTAL-in-config';\n");
  await writeFile(join(source, "vendor", "lib", "dep.php"), "<?php // TOTAL in a dependency\n");
  const work = join(dir, "work");
  await mkdir(work);
  await writeFile(join(work, "app.php"), "<?php $total = 1; // TOTAL\n");
  await writeFile(join(work, ".env"), "DB_PASSWORD=TOTAL-in-env\n");
  await symlink(join(source, "vendor"), join(work, "vendor"), "dir");
  // Links a careless (or hostile) source might hold: one out of the folder, one to a key under a harmless name.
  await mkdir(join(dir, "elsewhere"));
  await writeFile(join(dir, "elsewhere", "notes.txt"), "TOTAL outside\n");
  await symlink(join(dir, "elsewhere", "notes.txt"), join(work, "notes.txt"));
  await symlink(join(source, "server.key"), join(work, "readme.txt"));
  return { work, scope: { root: work, alsoAllow: [source], neverRead: ["config/local.php"] } };
}

test("keys and .env are never read, whatever the settings say", async () => {
  const { scope } = await setUp();
  assert.match(await readLines(scope, ".env"), /読ませない範囲/);
  assert.match(await readLines(scope, "vendor/../.env"), /読ませない範囲/);
  assert.match(await readLines({ ...scope, root: scope.alsoAllow[0], neverRead: [] }, "server.key"), /読ませない範囲/);
});

test("a link is judged by where it leads: out of the source, or to a key under another name", async () => {
  const { scope } = await setUp();
  assert.match(await readLines(scope, "notes.txt"), /外です/);
  assert.match(await readLines(scope, "readme.txt"), /読ませない範囲/);
});

test("the original's dependencies, linked into work/, can still be read", async () => {
  const { scope } = await setUp();
  assert.match(await readLines(scope, "vendor/lib/dep.php"), /TOTAL in a dependency/);
});

test("listing leaves hidden and outside entries out", async () => {
  const { scope } = await setUp();
  assert.equal(await listDir(scope), "app.php\nvendor/");
});

test("search never quotes a hidden or outside file", async () => {
  const { scope } = await setUp();
  const out = await searchText(scope, "TOTAL");
  assert.equal(out, "app.php:1: <?php $total = 1; // TOTAL\nvendor/lib/dep.php:1: <?php // TOTAL in a dependency");
  assert.match(await searchText({ ...scope, root: scope.alsoAllow[0] }, "TOTAL-in"), /見つかりません/);
});

test("patterns work like .gitignore: names anywhere, paths from the root, * within a name, ** across folders", () => {
  assert.equal(hiddenBy("a/b/.env", [".env"]), ".env");
  assert.equal(hiddenBy(".env.local", [".env.*"]), ".env.*");
  assert.equal(hiddenBy("secrets/db.txt", ["secrets"]), "secrets");
  assert.equal(hiddenBy("config/local.php", ["config/local.php"]), "config/local.php");
  assert.equal(hiddenBy("app/config/local.php", ["config/local.php"]), null);
  assert.equal(hiddenBy("storage/logs/x/y.log", ["storage/**/*.log"]), "storage/**/*.log");
  assert.equal(hiddenBy("storage/app.php", ["storage/*.log"]), null);
  assert.equal(hiddenBy("app.php", ["*.key"]), null);
});

test("hidden names are matched ignoring case, since server.KEY is server.key on many disks", () => {
  assert.equal(hiddenBy("certs/server.KEY", ALWAYS_HIDDEN), "*.key");
  assert.equal(hiddenBy("App/.ENV", ALWAYS_HIDDEN), ".env");
  assert.equal(hiddenBy("Config/Local.php", ["config/local.php"]), "config/local.php");
});
