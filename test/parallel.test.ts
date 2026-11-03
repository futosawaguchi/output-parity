import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig, type CommandRun } from "../lib/config";
import { ConfigError } from "../lib/errors";
import { eachWithLimit } from "../lib/pipeline";

// run.parallel (how many cases run at once): one unless written, never more than asked, the
// report in the settings' order, and a failure stops new cases from starting, as one at a time did.

const PATH = "/somewhere/samples/demo/parity.config.jsonc";
const side = { label: "x", command: "/bin/x" };

function settings(run: Record<string, unknown>) {
  return {
    version: 1,
    name: "t",
    source: "app",
    claude: { send: "none" },
    run: { type: "command", environments: { old: side, new: side }, ...run },
    output: { format: "pdf", from: "stdout" },
    cases: [{ id: "a", args: [] }],
  };
}

test("run.parallel is 1 unless written, and an integer from 1 to 16", () => {
  assert.equal((parseConfig(settings({}), PATH).run as CommandRun).parallel, 1);
  assert.equal((parseConfig(settings({ parallel: 4 }), PATH).run as CommandRun).parallel, 4);
  for (const parallel of [0, 2.5, 17, "4"]) {
    assert.throws(() => parseConfig(settings({ parallel }), PATH), (e: Error) => e instanceof ConfigError && /run\.parallel は 1〜16/.test(e.message));
  }
});

test("the web type is refused more than one at a time (its server and database are shared)", () => {
  const web = { ...settings({}), run: { type: "web", environments: { old: { ...side, args: ["{port}"] }, new: { ...side, args: ["{port}"] } }, parallel: 2 }, cases: [{ id: "a", request: { path: "/" } }] };
  assert.throws(() => parseConfig(web, PATH), (e: Error) => e instanceof ConfigError && /Web 型では使えません/.test(e.message));
});

test("never more than the limit at once, and every item done", async () => {
  let running = 0;
  let most = 0;
  const done: number[] = [];
  await eachWithLimit([5, 1, 4, 2, 3, 1, 2], 3, async (ms, i) => {
    running++;
    most = Math.max(most, running);
    await new Promise((r) => setTimeout(r, ms * 5));
    running--;
    done.push(i);
  });
  assert.equal(most, 3);
  assert.deepEqual([...done].sort(), [0, 1, 2, 3, 4, 5, 6]);
});

test("after a failure no new item starts, and the failure is thrown", async () => {
  const started: number[] = [];
  await assert.rejects(
    eachWithLimit([0, 1, 2, 3, 4], 1, async (_, i) => {
      started.push(i);
      if (i === 1) throw new ConfigError("壊れた設定", "直す");
    }),
    ConfigError,
  );
  assert.deepEqual(started, [0, 1]);
});
