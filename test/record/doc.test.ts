import assert from "node:assert/strict";
import { test } from "node:test";
import { mapText, toMarkdown, type RecordDoc } from "../../lib/record/doc";
import { describeSentFile } from "../../lib/sent-log";

// The record is built once and written out twice (Markdown to keep, a page to read): whatever is
// tidied must be tidied in every place a text can sit, or a path or a secret survives on one side.

const doc: RecordDoc = [
  { kind: "title", text: "記録 /home/x" },
  { kind: "list", items: [{ text: "親 /home/x", children: ["子 /home/x"] }] },
  { kind: "table", head: ["入力 /home/x"], rows: [["a | b /home/x", { verdict: "broken", text: "壊れている /home/x" }]] },
  { kind: "code", label: "前 /home/x", text: "if ($a) /home/x" },
];

test("every text of the record goes through the tidying, table cells and nested list items too", () => {
  const md = toMarkdown(mapText(doc, (s) => s.replaceAll("/home/x", "~")));
  assert.doesNotMatch(md, /\/home\/x/);
  assert.equal((md.match(/~/g) ?? []).length, 8);
});

test("a table cell cannot break the table, and code cannot close its block early", () => {
  const md = toMarkdown([
    { kind: "table", head: ["h"], rows: [["a | b\nc"]] },
    { kind: "code", label: "前", text: "```\nx" },
  ]);
  assert.match(md, /\| a \\\| b c \|/);
  assert.match(md, /前:\n````\n```\nx\n````/);
});

test("a sent file's name says when, for which case and for what", () => {
  assert.deepEqual(describeSentFile("20261103-103652-order-8-judge-872a.txt"), { at: "2026/11/3 10:36:52", caseId: "order-8", purpose: "judge" });
  assert.equal(describeSentFile("../../etc/passwd"), null);
});

test("the tidying keeps which sent file a list item is about", () => {
  const [list] = mapText([{ kind: "list", items: [{ text: "入力 /home/x", sent: "a.txt" }] }], (s) => s.replaceAll("/home/x", "~"));
  assert.deepEqual(list, { kind: "list", items: [{ text: "入力 ~", sent: "a.txt", children: undefined }] });
});
