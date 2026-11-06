import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseConfig } from "../../lib/config";
import { CommandNotFoundError, ConfigError } from "../../lib/errors";
import { preflight } from "../../lib/runner/preflight";

// Before anything runs: a missing dependency (composer's vendor/, fetched, not committed) is said
// once with how to get it, instead of every case coming back with no output.

async function setUp(command = process.execPath) {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  const env = { label: "x", command };
  const config = parseConfig(
    {
      version: 1,
      name: "t",
      source: ".",
      claude: { send: "none" },
      run: { type: "command", environments: { old: env, new: env }, needs: ["lib-old/vendor"] },
      output: { format: "text", from: "stdout" },
      cases: [{ id: "a", args: [] }],
    },
    join(dir, "parity.config.jsonc"),
  );
  return { dir, config };
}

test("a missing dependency is reported with how to get it", async () => {
  const { dir, config } = await setUp();
  await assert.rejects(preflight(config, dir), (e: Error & { nextStep?: string }) => e instanceof ConfigError && /lib-old\/vendor/.test(e.message) && /composer install/.test(e.nextStep ?? ""));
  await mkdir(join(dir, "lib-old", "vendor"), { recursive: true });
  await preflight(config, dir);
});

test("a missing interpreter is said first: it is the first thing to fix", async () => {
  const { dir, config } = await setUp("/no/such/php");
  await assert.rejects(preflight(config, dir), CommandNotFoundError);
});

test("a missing interpreter is named by its label and setting, not by the path (a bundled sample's path is the author's)", async () => {
  const { dir, config } = await setUp("/no/such/php");
  await assert.rejects(preflight(config, dir), (e: Error & { nextStep?: string }) =>
    e instanceof CommandNotFoundError && !e.message.includes("/no/such/php") && /x（旧）/.test(e.message) && /run\.environments\.old\.command/.test(e.nextStep ?? ""),
  );
});

test("run.needs stays inside the source", () => {
  const env = { label: "x", command: "/bin/x" };
  const settings = (needs: string[]) => ({
    version: 1,
    name: "t",
    source: ".",
    claude: { send: "none" },
    run: { type: "command", environments: { old: env, new: env }, needs },
    output: { format: "text", from: "stdout" },
    cases: [{ id: "a", args: [] }],
  });
  assert.throws(() => parseConfig(settings(["../outside"]), "/x/p.jsonc"), /run\.needs/);
});
