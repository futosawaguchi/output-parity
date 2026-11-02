import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { adapterFor } from "../../lib/compare/adapters";
import { parseConfig } from "../../lib/config";

async function file(bytes: Uint8Array | string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "output-parity-")), "out");
  await writeFile(path, bytes);
  return path;
}

test("text is decoded in the encoding the settings name, line by line, CRLF or LF", async () => {
  // "日報\r\n合計,8\r\n" in Shift_JIS
  const sjis = Buffer.from([0x93, 0xfa, 0x95, 0xf1, 0x0d, 0x0a, 0x8d, 0x87, 0x8c, 0x76, 0x2c, 0x38, 0x0d, 0x0a]);
  const doc = await adapterFor({ format: "text", encoding: "shift_jis" }).extract(await file(sjis));
  assert.deepEqual(doc, { lines: ["日報", "合計,8"], pages: [], unreadable: [] });
});

test("bytes the encoding cannot read are counted, not dropped (a wrong setting shows in the report)", async () => {
  const sjis = Buffer.from([0x93, 0xfa, 0x95, 0xf1, 0x0a]);
  const doc = await adapterFor({ format: "text" }).extract(await file(sjis));
  assert.equal(doc.lines.length, 1);
  assert.match(doc.unreadable[0], /utf-8 として読めない部分が \d+ か所/);
});

test("empty lines inside the text are kept; only the final line end makes no extra line", async () => {
  const doc = await adapterFor({ format: "text" }).extract(await file("a\n\nb\n"));
  assert.deepEqual(doc.lines, ["a", "", "b"]);
});

test("an encoding no one can read is refused when the settings are loaded", () => {
  const env = { label: "x", command: "/bin/x" };
  const settings = (encoding: string) => ({
    version: 1,
    name: "t",
    source: ".",
    claude: { send: "none" },
    run: { type: "command", environments: { old: env, new: env } },
    output: { format: "text", from: "stdout", encoding },
    cases: [{ id: "a", args: [] }],
  });
  assert.equal(parseConfig(settings("euc-jp"), "/tmp/p.jsonc").output.encoding, "euc-jp");
  assert.throws(() => parseConfig(settings("cp932"), "/tmp/p.jsonc"), /読めない文字コード/);
});
