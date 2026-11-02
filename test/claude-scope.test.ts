import assert from "node:assert/strict";
import { test } from "node:test";
import { allows, whyNotSending } from "../lib/claude-scope";

const scope = (send: "none" | "output" | "output-and-source") => ({ claude: { send, neverRead: [] } });

test("each setting allows exactly what it sends", () => {
  assert.deepEqual([allows(scope("none"), "judge"), allows(scope("none"), "cause")], [false, false]);
  assert.deepEqual([allows(scope("output"), "judge"), allows(scope("output"), "cause")], [true, false]);
  assert.deepEqual([allows(scope("output-and-source"), "judge"), allows(scope("output-and-source"), "cause")], [true, true]);
});

test("a refusal says which setting would allow it", () => {
  assert.match(whyNotSending(scope("none"), "judge")?.nextStep ?? "", /claude\.send を output/);
  assert.match(whyNotSending(scope("output"), "cause")?.nextStep ?? "", /output-and-source/);
  assert.equal(whyNotSending(scope("output"), "judge"), null);
});
