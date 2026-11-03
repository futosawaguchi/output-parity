import assert from "node:assert/strict";
import { test } from "node:test";
import { groupIntoLines, groupIntoRows, type TextItem } from "../../lib/compare/pdf-lines";

// A text item as pdfjs gives it: transform[3] is the font size, [4] and [5] the left and the baseline.
const item = (str: string, x: number, y: number, width: number, size = 10): TextItem => ({ str, transform: [size, 0, 0, size, x, y], width });

test("items on one baseline become one line, left to right, top line first", () => {
  const items = [item("15,000", 300, 700, 40), item("A-100", 50, 700, 30), item("見積書", 100, 760, 60, 16), item("基本料", 120, 700.4, 30)];
  assert.deepEqual(groupIntoLines(items), ["見積書", "A-100 基本料 15,000"]);
});

test("each line knows where it sits: its left and right edges, baseline and largest font size", () => {
  const [title, row] = groupIntoRows([item("見積書", 100, 760, 60, 16), item("A-100", 50, 700, 30), item("15,000", 300, 700, 40, 12)]);
  assert.deepEqual(title, { text: "見積書", left: 100, right: 160, baseline: 760, size: 16 });
  assert.deepEqual(row, { text: "A-100 15,000", left: 50, right: 340, baseline: 700, size: 12 });
});

test("the lines are the same text whether or not their places are asked for", () => {
  const items = [item("合計", 260, 640, 20), item("72,000", 300, 640, 40), item("A-103", 50, 660, 30)];
  assert.deepEqual(
    groupIntoRows(items).map((r) => r.text),
    groupIntoLines(items),
  );
});
