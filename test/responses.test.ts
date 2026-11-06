import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { alreadyRunning, busyWithAnother } from "../app/api/responses";
import type { JobState } from "../lib/jobs";

const job = (subjectId: string) => ({ jobId: "j1", subjectId, kind: "rejudge", status: "running" }) as unknown as JobState;

afterEach(() => {
  delete process.env.KAWARIME_ACCESS_CODE;
});

test("on one's own machine, the busy subject is named by its id", () => {
  assert.match(busyWithAnother("estimate").message, /「estimate」/);
});

test("in the showcase, another subject's job is not named: it is likely another judge's", () => {
  process.env.KAWARIME_ACCESS_CODE = "a-code-long-enough-1234";
  const busy = busyWithAnother("estimate");
  assert.doesNotMatch(busy.message, /estimate/);
  assert.match(busy.message, /ほかの方の操作かもしれません/);
});

test("in the showcase, a job of the same subject is still followed (its id is sent back)", async () => {
  process.env.KAWARIME_ACCESS_CODE = "a-code-long-enough-1234";
  const res = alreadyRunning(job("estimate"), "estimate");
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.jobId, "j1");
  assert.match(body.message, /この題材で、いま Claude が動いています/);
});
