import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseConfig } from "../../lib/config";
import { runCase } from "../../lib/runner/run-case";

// node -e <script> stands in for an interpreter: the side's own arguments come first, the case's
// after them, and the side's environment variables are visible only to that side.
const SCRIPT = "require('fs').writeFileSync(process.argv[1], process.env.SIDE + ' ' + process.argv.slice(2).join(' '))";

test("each side gets its own arguments first, then the case's, and its own environment variables", async () => {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  const side = (name: string) => ({ label: name, command: process.execPath, args: ["-e", SCRIPT], env: { SIDE: name } });
  const config = parseConfig(
    {
      version: 1,
      name: "t",
      source: ".",
      run: { type: "command", environments: { old: side("old"), new: side("new") } },
      output: { format: "txt", from: "file" },
      cases: [{ id: "case-a", args: ["{output}", "from-case"] }],
    },
    join(dir, "parity.config.jsonc"),
  );
  const result = await runCase(config, config.cases[0], dir, join(dir, "run"));
  const written = Object.fromEntries(await Promise.all(result.slots.map(async (s) => [s.slot, await readFile(s.outputPath!, "utf8")])));
  assert.deepEqual(written, { old: "old from-case", new: "new from-case", baseline: "new from-case" });
  assert.deepEqual(result.slots[0].args.slice(0, 2), ["-e", SCRIPT]);
});

test("the tool's own environment does not reach the program", async () => {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  process.env.OUTPUT_PARITY_TEST_SECRET = "should-not-pass";
  const side = { label: "s", command: process.execPath, args: ["-e", "require('fs').writeFileSync(process.argv[1], String(process.env.OUTPUT_PARITY_TEST_SECRET))"], env: {} };
  const config = parseConfig(
    {
      version: 1,
      name: "t",
      source: ".",
      run: { type: "command", environments: { old: side, new: side } },
      output: { format: "txt", from: "file" },
      cases: [{ id: "case-a", args: ["{output}"] }],
    },
    join(dir, "parity.config.jsonc"),
  );
  const result = await runCase(config, config.cases[0], dir, join(dir, "run"));
  delete process.env.OUTPUT_PARITY_TEST_SECRET;
  assert.equal(await readFile(result.slots[0].outputPath!, "utf8"), "undefined");
});
