import type Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { adapterFor } from "../lib/compare/adapters";
import type { JudgeResponse } from "../lib/judge/schema";
import { checkCase, judgeWaiting, type CheckOptions, type Checked } from "../lib/pipeline";
import type { CaseResult, SlotResult } from "../lib/runner/run-case";
import { sentRecorder } from "../lib/sent-log";

// Each case that needs Claude is one call with the whole new output. Over the limit, nothing is
// sent until a person confirms the count; the cases stay unjudged rather than guessed.

const fixture = (caseId: string, slot: string) => join(__dirname, "fixtures", caseId, `${slot}.pdf`);

function resultOf(caseId: string): CaseResult {
  const slot = (s: "old" | "new" | "baseline"): SlotResult => ({
    slot: s,
    env: s === "old" ? "old" : "new",
    command: "php",
    args: [],
    outcome: { kind: "exited", exitCode: 0 },
    durationMs: 1,
    outputPath: fixture(caseId, s),
    stdoutPath: "/dev/null",
    stderrPath: "/dev/null",
  });
  return { caseId, slots: [slot("old"), slot("new"), slot("baseline")] };
}

/** A stand-in for Claude that counts its calls. */
function countingClient() {
  const answer: JudgeResponse = { summary: "s", findings: [] };
  const client = { calls: 0, beta: { messages: { parse: async () => (client.calls++, { stop_reason: "end_turn", parsed_output: answer, model: "stand-in" }) } } };
  return client;
}

async function setUp() {
  const client = countingClient();
  const opts: CheckOptions = {
    adapter: adapterFor({ format: "pdf" }),
    client: client as unknown as Anthropic,
    environments: { old: { label: "旧", command: "a" }, new: { label: "新", command: "b" } },
    record: sentRecorder(await mkdtemp(join(tmpdir(), "output-parity-"))),
  };
  // case-a has no difference left (settled by the machine); case-c has three lines gone (needs Claude).
  const checked: Checked[] = [];
  for (const id of ["case-a", "case-c"]) {
    const result = resultOf(id);
    checked.push({ result, report: await checkCase(result, { label: id, description: "" }, { ...opts, client: null }) });
  }
  return { client, opts, checked };
}

test("over the limit, nothing is sent and the count is kept for a person to confirm", async () => {
  const { client, opts, checked } = await setUp();
  const { cases, held } = await judgeWaiting(checked, opts, 0);
  assert.deepEqual(held, { count: 1, limit: 0 });
  assert.equal(client.calls, 0);
  assert.equal(cases[0].verdict?.verdict, "harmless");
  assert.equal(cases[1].verdict, null);
});

test("within the limit (or with no limit), only the cases the machine left are sent, one call each", async () => {
  for (const limit of [1, null]) {
    const { client, opts, checked } = await setUp();
    const { cases, held } = await judgeWaiting(checked, opts, limit);
    assert.equal(held, null);
    assert.equal(client.calls, 1);
    assert.ok(cases[1].verdict);
  }
});

test("without a client nothing is sent and nothing is held", async () => {
  const { client, opts, checked } = await setUp();
  const { held } = await judgeWaiting(checked, { ...opts, client: null }, 0);
  assert.equal(held, null);
  assert.equal(client.calls, 0);
});
