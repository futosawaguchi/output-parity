import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { insideRoot } from "../lib/safe-path";

const root = "/srv/app/runs";

test("a path under the root is allowed", () => {
  assert.equal(insideRoot(root, "2026-11-02_10-00-00-abcd", "case", "new"), join(root, "2026-11-02_10-00-00-abcd", "case", "new"));
});

test("climbing out of the root is refused", () => {
  assert.equal(insideRoot(root, "..", "package.json"), null);
  assert.equal(insideRoot(root, "a/../../package.json"), null);
});

test("an absolute path is refused", () => {
  assert.equal(insideRoot(root, "/etc/passwd"), null);
});

test("a sibling that only shares the prefix is refused", () => {
  assert.equal(insideRoot(root, "../runs-other/file"), null);
});
