import assert from "node:assert/strict";
import { test } from "node:test";
import { splitSubjects } from "../app/check/subject-row";

// The row of subjects at the top: a fixed number, the rest folded. The subject on the page must
// never be the one hidden, and nothing may change order (the row is how people find their place).

const subjects = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((s) => s.id);

test("up to the number, every subject is in the row and nothing is folded", () => {
  const { shown, more } = splitSubjects(subjects.slice(0, 4), "a");
  assert.deepEqual(ids(shown), ["a", "b", "c", "d"]);
  assert.deepEqual(more, []);
});

test("past it, the first ones are in the row and the rest are folded, in their order", () => {
  const { shown, more } = splitSubjects(subjects, "b");
  assert.deepEqual(ids(shown), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(more), ["e", "f"]);
});

test("a folded subject on the page takes the last place of the row, which keeps its width", () => {
  const { shown, more } = splitSubjects(subjects, "f");
  assert.deepEqual(ids(shown), ["a", "b", "c", "f"]);
  assert.deepEqual(ids(more), ["d", "e"]);
});
