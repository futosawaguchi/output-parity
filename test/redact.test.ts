import assert from "node:assert/strict";
import { test } from "node:test";
import { redactSecrets } from "../lib/redact";

// Key-shaped strings are built from pieces: written whole, this file would itself look like a leaked key.
const API_KEY = "sk-" + "ant-api03-" + "a".repeat(32);
const AWS_KEY = "AKIA" + "ABCDEFGHIJKLMNOP";

test("named secrets in code and settings are masked, the code around them is kept", () => {
  const cases: [string, string][] = [
    [`define('DB_PASSWORD', 'hunter2');`, `define('DB_PASSWORD', '***');`],
    [`$password = "hunter2"; $user = "alice";`, `$password = "***"; $user = "alice";`],
    [`'api_key' => 'abc123', 'name' => 'ACME'`, `'api_key' => '***', 'name' => 'ACME'`],
    [`"token": "abc123"`, `"token": "***"`],
    [`DB_PASSWORD=hunter2`, `DB_PASSWORD=***`],
    [`export SECRET_TOKEN=abc # note`, `export SECRET_TOKEN=*** # note`],
    [`Password: hunter2`, `Password: ***`],
  ];
  for (const [before, after] of cases) assert.equal(redactSecrets(before).text, after);
});

test("secrets with a known shape are masked whatever they are called", () => {
  const r = redactSecrets(`key=${API_KEY}\naws=${AWS_KEY}\nurl=mysql://app:s3cret@db.local/app`);
  assert.equal(r.text, "key=***\naws=***\nurl=mysql://app:***@db.local/app");
  assert.equal(r.count, 3);
  assert.deepEqual(r.kinds.sort(), ["API キー", "AWS のアクセスキー", "URL の中のパスワード"].sort());
});

test("a private key block is masked as a whole", () => {
  const pem = ["-----BEGIN RSA PRIVATE KEY-----", "MIIEow", "abc", "-----END RSA PRIVATE KEY-----"].join("\n");
  assert.equal(redactSecrets(`x\n${pem}\ny`).text, "x\n-----BEGIN RSA PRIVATE KEY-----***-----END RSA PRIVATE KEY-----\ny");
});

test("business data and code that merely mentions a secret are left alone", () => {
  for (const text of ["合計 72,000", "A-101 出張費 8,000", "$password = $_POST['password'];", "if ($token === null) {", "見積番号 Q-0001"]) {
    const r = redactSecrets(text);
    assert.equal(r.text, text);
    assert.equal(r.count, 0);
  }
});

test("lines are masked with what this tool puts in front of them (change marks, line numbers, file:line)", () => {
  assert.equal(redactSecrets("- [C1] DB_PASSWORD=hunter2").text, "- [C1] DB_PASSWORD=***");
  assert.equal(redactSecrets("    12| password: hunter2").text, "    12| password: ***");
  assert.equal(redactSecrets("config/app.yml:3: api_token: abc").text, "config/app.yml:3: api_token: ***");
});
