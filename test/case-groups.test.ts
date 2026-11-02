import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { expandCaseGroups } from "../lib/case-groups";
import { parseConfig } from "../lib/config";
import { ConfigError } from "../lib/errors";

/** A source whose run.cwd holds a few example files, and settings with the given cases and groups. */
async function setUp(extra: { cases?: unknown[]; caseGroups?: unknown[] }) {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  await mkdir(join(dir, "app", "examples"), { recursive: true });
  for (const f of ["example_002.php", "example_001.php", "tcpdf_include.php", "readme.txt"]) {
    await writeFile(join(dir, "app", "examples", f), "");
  }
  const env = { label: "x", command: "/bin/x" };
  return parseConfig(
    {
      version: 1,
      name: "t",
      source: "app",
      claude: { send: "none" },
      run: { type: "command", cwd: "examples", environments: { old: env, new: env } },
      output: { format: "pdf", from: "stdout" },
      ...extra,
    },
    join(dir, "parity.config.jsonc"),
  );
}

test("one case per matching file, in name order, with {file} and {name} filled in", async () => {
  const config = await setUp({ caseGroups: [{ each: { file: "example_*.php" }, description: "TCPDF の {name}", args: ["{file}"] }] });
  const { cases } = await expandCaseGroups(config);
  assert.deepEqual(cases, [
    { id: "example_001", label: "example_001.php", description: "TCPDF の example_001", args: ["example_001.php"] },
    { id: "example_002", label: "example_002.php", description: "TCPDF の example_002", args: ["example_002.php"] },
  ]);
});

test("cases written one by one come first, and an id made twice is refused", async () => {
  const one = { id: "first", args: ["x.php"] };
  const { cases } = await expandCaseGroups(await setUp({ cases: [one], caseGroups: [{ each: { file: "example_00?.php" }, args: ["{file}"] }] }));
  assert.deepEqual(cases.map((c) => c.id), ["first", "example_001", "example_002"]);

  const clash = { id: "example_001", args: ["x.php"] };
  await assert.rejects(expandCaseGroups(await setUp({ cases: [clash], caseGroups: [{ each: { file: "example_*.php" }, args: ["{file}"] }] })), /重複/);
});

test("a group that matches nothing, or makes an id that cannot be used, says which", async () => {
  const none = await setUp({ caseGroups: [{ each: { file: "sample_*.php" }, args: ["{file}"] }] });
  await assert.rejects(expandCaseGroups(none), (e: Error) => e instanceof ConfigError && /sample_\*\.php に当てはまるファイルがありません/.test(e.message));
  const badId = await setUp({ caseGroups: [{ each: { file: "*.txt" }, id: "{file}", args: ["{file}"] }] });
  await assert.rejects(expandCaseGroups(badId), /readme\.txt から作った id「readme\.txt」/);
});

test("a run.cwd that is not there yet (dependencies not installed) points to getting them", async () => {
  const config = await setUp({ caseGroups: [{ each: { file: "*.php" }, args: ["{file}"] }] });
  await assert.rejects(expandCaseGroups({ ...config, run: { ...config.run, cwd: "vendor/x/examples" } }), (e: Error) => e instanceof ConfigError && /全部動かす/.test(e.nextStep));
});

test("the settings say what is wrong with a group before any file is looked at", async () => {
  await assert.rejects(setUp({}), /cases も caseGroups も空です/);
  await assert.rejects(setUp({ caseGroups: [{ each: { file: "a/*.php" }, args: [] }] }), /each\.file/);
  await assert.rejects(setUp({ caseGroups: [{ each: { file: "example_001.php" }, args: [] }] }), /each\.file/);
  await assert.rejects(setUp({ caseGroups: [{ each: { file: "*.php" } }] }), /args/);
});
