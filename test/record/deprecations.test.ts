import assert from "node:assert/strict";
import { test } from "node:test";
import { newOnlyDeprecations } from "../../lib/record/deprecations";

// Deprecations only the new environment printed, for reference (R14). Never part of a verdict.

test("a deprecation the old run printed too is not new, even at another line number", () => {
  const found = newOnlyDeprecations([
    { caseId: "a", slot: "old", text: "PHP Deprecated:  f(): old style in lib/x.php on line 10\n" },
    { caseId: "a", slot: "new", text: "PHP Deprecated:  f(): old style in lib/x.php on line 12\nPHP Deprecated:  g(): optional before required in lib/y.php on line 3\n" },
  ]);
  assert.deepEqual(
    found.map((d) => [d.message, d.file]),
    [["PHP Deprecated:  g(): optional before required in lib/y.php on line 3", "y.php"]],
  );
});

test("other warnings are not counted: their wording changes between versions", () => {
  const found = newOnlyDeprecations([
    { caseId: "a", slot: "old", text: "PHP Warning:  Invalid argument supplied for foreach() in x.php on line 5" },
    { caseId: "a", slot: "new", text: "PHP Warning:  foreach() argument must be of type array|object, null given in x.php on line 5\nPHP Notice:  Undefined index: k" },
  ]);
  assert.deepEqual(found, []);
});

test("the same deprecation in many cases is one item that lists the cases once each", () => {
  const line = "PHP Deprecated:  h() is deprecated in z.php on line 1";
  const found = newOnlyDeprecations([
    { caseId: "a", slot: "new", text: `${line}\n${line}` },
    { caseId: "b", slot: "new", text: line },
  ]);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].caseIds, ["a", "b"]);
});

test("a server log's timestamp is dropped, and Python and Node deprecations are found too", () => {
  const found = newOnlyDeprecations([
    {
      caseId: "a",
      slot: "new",
      text: [
        "[Tue Nov  3 10:36:30 2026] 127.0.0.1:51470 Accepted",
        "[Tue Nov  3 10:36:30 2026] PHP Deprecated:  strftime() is deprecated in public/index.php on line 9",
        "/app/report.py:12: DeprecationWarning: datetime.datetime.utcnow() is deprecated",
        "(node:42) [DEP0005] DeprecationWarning: Buffer() is deprecated",
      ].join("\n"),
    },
  ]);
  assert.deepEqual(
    found.map((d) => [d.message.split(":")[0], d.file]),
    [
      ["PHP Deprecated", "index.php"],
      ["/app/report.py", "report.py"],
      ["(node", null],
    ],
  );
});
