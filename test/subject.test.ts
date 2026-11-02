import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ConfigError } from "../lib/errors";
import { loadSubject, whyNoApplying } from "../lib/subject";

/** A repository root with one subject at <place>/<id>/, whose source is `source` (relative to its settings). */
async function setUp(opts: { place?: string; source?: string; fixes?: string } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "output-parity-")));
  const dir = join(root, opts.place ?? "samples", "demo");
  await mkdir(join(dir, "app"), { recursive: true });
  const settings = {
    version: 1,
    name: "demo",
    source: opts.source ?? "app",
    ...(opts.fixes ? { fixes: opts.fixes } : {}),
    run: { type: "command", environments: { old: { label: "a", command: "/bin/a" }, new: { label: "b", command: "/bin/b" } } },
    output: { format: "pdf", from: "file" },
    cases: [{ id: "case-a", args: ["{output}"] }],
  };
  await writeFile(join(dir, "parity.config.jsonc"), `// demo\n${JSON.stringify(settings)}\n`);
  return { root, dir };
}

function refusedWith(pattern: RegExp) {
  return (e: Error) => e instanceof ConfigError && pattern.test(e.message);
}

test("a subject under samples/ runs in its own folder in work/", async () => {
  const { root, dir } = await setUp();
  const s = await loadSubject(root, "demo");
  assert.equal(s.config.source, join(dir, "app"));
  assert.equal(s.workDir, join(root, "work", "demo"));
  assert.equal(s.runRoot, s.workDir);
  assert.equal(s.bundledDir, join(dir, "bundled"));
  assert.equal(whyNoApplying(s), null);
});

test("a subject under targets/ is found the same way", async () => {
  const { root } = await setUp({ place: "targets" });
  assert.equal((await loadSubject(root, "demo")).id, "demo");
});

test("a missing subject says where to put the settings", async () => {
  const { root } = await setUp();
  await assert.rejects(loadSubject(root, "other"), (e: Error) => e instanceof ConfigError && /targets\/other\/parity\.config\.jsonc/.test(e.nextStep));
  await assert.rejects(loadSubject(root, "../samples/demo"), refusedWith(/使えません/));
});

test("a source that holds work/, or is inside it, is refused", async () => {
  const outer = await setUp({ source: "../.." });
  await assert.rejects(loadSubject(outer.root, "demo"), refusedWith(/work\/ が重なっています/));

  const inner = await setUp({ source: "../../work/demo" });
  await mkdir(join(inner.root, "work", "demo"), { recursive: true });
  await assert.rejects(loadSubject(inner.root, "demo"), refusedWith(/work\/ が重なっています/));
});

test("a source that holds the bundled run (and its verdicts) is refused", async () => {
  const { root } = await setUp({ source: "." });
  await assert.rejects(loadSubject(root, "demo"), refusedWith(/bundled\/）が source の中/));
});

test("a source that does not exist is reported as such", async () => {
  const { root } = await setUp({ source: "missing" });
  await assert.rejects(loadSubject(root, "demo"), refusedWith(/source のフォルダがありません/));
});

test("suggest-only runs the source in place, with no copy and nothing to apply to", async () => {
  const { root, dir } = await setUp({ fixes: "suggest-only" });
  const s = await loadSubject(root, "demo");
  assert.equal(s.workDir, null);
  assert.equal(s.runRoot, join(dir, "app"));
  assert.match(whyNoApplying(s)?.nextStep ?? "", /fixes を apply/);
});
