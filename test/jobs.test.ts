import assert from "node:assert/strict";
import { test } from "node:test";
import { currentJob, runningJob, startJob } from "../lib/jobs";
import type { RunReport } from "../lib/pipeline";

// One job at a time across subjects (the programs and work/ are shared), but each subject's page
// sees only its own job: a report of one subject must never be shown under another.

test("a job is seen only from its own subject, and blocks every subject while it runs", async () => {
  let finish: (r: RunReport) => void = () => {};
  const started = startJob("run", "first", () => new Promise<RunReport>((resolve) => (finish = resolve)));
  assert.equal(started.started, true);

  assert.equal(currentJob("first")?.status, "running");
  assert.equal(currentJob("second"), null);
  assert.equal(runningJob()?.subjectId, "first");

  const refused = startJob("run", "second", async () => ({}) as RunReport);
  assert.equal(refused.started, false);
  assert.equal(!refused.started && refused.running.subjectId, "first");

  finish({ subjectId: "first" } as RunReport);
  await new Promise((r) => setImmediate(r));
  assert.equal(currentJob("first")?.status, "done");
  assert.equal(runningJob(), null);
  assert.equal(currentJob("second"), null);
});
