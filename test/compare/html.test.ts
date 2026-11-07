import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { adapterFor } from "../../lib/compare/adapters";

async function page(html: string | Uint8Array): Promise<string[]> {
  const path = join(await mkdtemp(join(tmpdir(), "output-parity-")), "out.html");
  await writeFile(path, html);
  const doc = await adapterFor({ format: "html" }).extract(path);
  // The last line is the tool's own count of images; the tests below look at the text before it.
  assert.match(doc.lines.at(-1) ?? "", /^layout: 画像 \d+ 個$/);
  return doc.lines.slice(0, -1);
}

async function imageLine(html: string): Promise<string | undefined> {
  const path = join(await mkdtemp(join(tmpdir(), "output-parity-")), "out.html");
  await writeFile(path, html);
  return (await adapterFor({ format: "html" }).extract(path)).lines.at(-1);
}

test("what a reader sees, in order: the title, one line per block, scripts and styles left out", async () => {
  const lines = await page(`<html><head><title>受注一覧</title><style>p{color:red}</style><script>var t = 1;</script></head>
    <body><h1>受注一覧</h1><p>担当: <b>山田</b>
    さん</p><div>1行目<br>2行目</div></body></html>`);
  assert.deepEqual(lines, ["title: 受注一覧", "受注一覧", "担当: 山田 さん", "1行目", "2行目"]);
});

test("a table row is one line, with its cells and the fields in them", async () => {
  const lines = await page(`<table><tr><th>品目</th><th>数量</th></tr>
    <tr><td>点検</td><td><input name="qty" value="3"></td></tr></table>`);
  assert.deepEqual(lines, ["品目 | 数量", "点検 | [input text qty: 3]"]);
});

test("form values are lines too, hidden ones included (a token that changes every time is for the baseline to drop)", async () => {
  const lines = await page(`<form><input type="hidden" name="token" value="abc123">
    <select name="tax"><option value="8">8%</option><option value="10" selected>10%</option></select>
    <input type="checkbox" name="paid" value="1" checked><textarea name="note">至急</textarea></form>`);
  assert.deepEqual(lines, ["[input hidden token: abc123]", "[select tax: 10%（選択肢 8% / 10%）]", "[checkbox paid=1 選択]", "[textarea note: 至急]"]);
});

test("a page that declares Shift_JIS is read as Shift_JIS, whatever the settings say", async () => {
  const head = Buffer.from('<meta charset="Shift_JIS"><p>', "latin1");
  const body = Buffer.from([0x93, 0xfa, 0x95, 0xf1]); // 日報
  assert.deepEqual(await page(Buffer.concat([head, body, Buffer.from("</p>")])), ["日報"]);
});

test("an image with no alt text that vanishes still changes a line (the image count)", async () => {
  assert.equal(await imageLine('<p>印</p><img src="seal.png">'), "layout: 画像 1 個");
  assert.equal(await imageLine("<p>印</p>"), "layout: 画像 0 個");
});

test("an option that vanishes from a select changes its line, even when the chosen one stays", async () => {
  const before = await page('<select name="pay"><option selected>振込</option><option>代引き</option></select>');
  const after = await page('<select name="pay"><option selected>振込</option></select>');
  assert.notDeepEqual(before, after);
});

test("an image's alt text in a table cell is part of the row, as it is anywhere else", async () => {
  const lines = await page('<table><tr><td>承認</td><td><img src="seal.png" alt="社印"></td></tr></table><p><img src="logo.png" alt="ロゴ"></p>');
  assert.deepEqual(lines, ["承認 | [画像: 社印]", "[画像: ロゴ]"]);
});
