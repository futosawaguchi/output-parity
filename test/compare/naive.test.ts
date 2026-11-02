import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { naiveDiff } from "../../lib/compare/naive";

const fixture = (caseId: string, slot: string) => join(__dirname, "..", "fixtures", caseId, `${slot}.pdf`);

test("the same file has no differing lines", async () => {
  const path = fixture("2b-fatal", "old");
  const d = await naiveDiff(path, path);
  assert.equal(d.differingLines, 0);
  assert.deepEqual(d.excerpt, []);
});

test("sample 1 already differs in a plain diff, although nothing that matters changed", async () => {
  const d = await naiveDiff(fixture("1-harmless", "old"), fixture("1-harmless", "new"));
  assert.ok(d.differingLines > 0);
});

test("the excerpt contains only printable characters", async () => {
  const d = await naiveDiff(fixture("2b-fatal", "old"), fixture("2b-fatal", "new"));
  assert.ok(d.excerpt.length > 0);
  for (const line of d.excerpt) assert.match(line, /^[\x20-\x7e·…]*$/);
});
