import assert from "node:assert/strict";
import { test } from "node:test";
import { markLines } from "../../lib/compare/html";

const page = `<!DOCTYPE html><html><head><title>注文 21</title></head><body>
<dl><dt>入金</dt><dd>未入金</dd><dt>ギフト包装</dt><dd>する（のし付き）</dd></dl>
<table><tbody>
<tr><td>小さな庭の育て方</td><td>2,200 円</td><td>在庫切れ</td></tr>
<tr><td>はじめての家計簿</td><td>1,200 円</td><td>在庫あり</td></tr>
</tbody></table></body></html>`;

test("a changed table row is framed: found as the comparison reads it, cells joined by |", () => {
  const out = markLines(page, [{ kind: "changed", text: "小さな庭の育て方 | 2,200 円 | 在庫切れ" }]);
  assert.match(out, /<tr style="outline: 3px solid #b42318[^"]*"><td>小さな庭の育て方/);
  assert.doesNotMatch(out, /<tr style[^>]*><td>はじめての家計簿/);
});

test("changed blocks are framed, and where lines went missing a row of its own says how many", () => {
  const out = markLines(page, [
    { kind: "changed", text: "ギフト包装" },
    { kind: "goneAfter", text: "小さな庭の育て方 | 2,200 円 | 在庫切れ", count: 2 },
  ]);
  assert.match(out, /<dt style="outline[^"]*">ギフト包装<\/dt>/);
  assert.match(out, /在庫切れ<\/td><\/tr><tr><td colspan="3" style="[^"]*">ここにあった 2 行が消えています<\/td><\/tr>/);
});

test("nothing that runs is added, and a page with no marks is sent as it is", () => {
  assert.equal(markLines(page, []), page);
  assert.doesNotMatch(markLines(page, [{ kind: "changed", text: "ギフト包装" }]), /<script|on[a-z]+=/i);
});
