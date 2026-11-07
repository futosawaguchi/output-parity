import assert from "node:assert/strict";
import { test } from "node:test";
import { differentEndings, type ExecOutcome } from "../../lib/runner/outcome";

const page = (contentType: string | null, contentDisposition: string | null = null): ExecOutcome => ({ kind: "http", status: 200, location: null, contentType, contentDisposition });
const runs = (oldOutcome: ExecOutcome, newOutcome: ExecOutcome) => [
  { slot: "old", outcome: oldOutcome },
  { slot: "new", outcome: newOutcome },
];

test("a page that is now sent as a file to save ends differently, though the status is the same", () => {
  const ending = differentEndings(runs(page("text/csv"), page("text/csv", 'attachment; filename="orders.csv"')));
  assert.ok(ending);
  assert.match(ending.new, /Content-Disposition: attachment/);
});

test("a changed Content-Type is a different ending", () => {
  assert.ok(differentEndings(runs(page("text/html; charset=UTF-8"), page("text/plain; charset=UTF-8"))));
});

test("the same Content-Type written differently is the same ending", () => {
  assert.equal(differentEndings(runs(page("text/html; charset=UTF-8"), page("text/html;charset=utf-8"))), null);
});

test("a result kept before headers were kept is not compared on them", () => {
  const before: ExecOutcome = { kind: "http", status: 200, location: null };
  assert.equal(differentEndings(runs(before, page("text/csv", "attachment"))), null);
});
