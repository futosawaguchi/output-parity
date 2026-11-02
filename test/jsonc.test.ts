import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJsonc } from "../lib/jsonc";

test("line and block comments are ignored", () => {
  const text = `// what this file is
{
  "a": 1, // why it is 1
  /* several
     lines */
  "b": [2, 3]
}`;
  assert.deepEqual(parseJsonc(text), { a: 1, b: [2, 3] });
});

test("comment markers inside strings are kept", () => {
  const text = `{ "url": "http://127.0.0.1/a", "glob": "src/**/*.php", "quote": "say \\"//\\" here" }`;
  assert.deepEqual(parseJsonc(text), { url: "http://127.0.0.1/a", glob: "src/**/*.php", quote: 'say "//" here' });
});

test("trailing commas are allowed, commas inside strings are not touched", () => {
  assert.deepEqual(parseJsonc(`{ "a": [1, 2, ], "b": ", }", }`), { a: [1, 2], b: ", }" });
});

test("plain JSON reads the same", () => {
  const json = JSON.stringify({ name: "x", cases: [{ id: "case-a", args: ["{output}"] }] }, null, 2);
  assert.deepEqual(parseJsonc(json), JSON.parse(json));
});

test("broken JSON is still an error, with a line number that matches the file", () => {
  const text = `{\n  /* a\n  b */\n  "a": 1\n  "b": 2\n}`;
  assert.throws(() => parseJsonc(text), (e: Error) => e instanceof SyntaxError && /line 5/.test(e.message));
});
