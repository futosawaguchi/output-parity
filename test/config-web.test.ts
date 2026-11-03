import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig, type WebRun } from "../lib/config";
import { ConfigError } from "../lib/errors";

// The web type's settings (DESIGN 7-4c): a path, never a URL, so the tool cannot be pointed at a
// server elsewhere; the port is the tool's to choose; the original database is never written.

const PATH = "/somewhere/samples/shop/parity.config.jsonc";

function minimal(): Record<string, unknown> {
  const side = (label: string) => ({ label, command: "/usr/bin/php", args: ["-S", "127.0.0.1:{port}", "-t", "public"] });
  return {
    version: 1,
    name: "shop",
    source: "app",
    claude: { send: "none" },
    run: { type: "web", environments: { old: side("PHP 7.4"), new: side("PHP 8.5") }, database: { file: "data/shop.sqlite" } },
    output: { format: "html" },
    cases: [{ id: "list", request: { path: "/" } }],
  };
}

function withCase(request: unknown): Record<string, unknown> {
  return { ...minimal(), cases: [{ id: "a", request }] };
}

function rejects(json: unknown, pattern: RegExp) {
  assert.throws(() => parseConfig(json, PATH), (e: Error) => e instanceof ConfigError && pattern.test(e.message));
}

test("a web subject: output.from is not needed, a request defaults to GET with no form", () => {
  const c = parseConfig(minimal(), PATH);
  const run = c.run as WebRun;
  assert.equal(run.type, "web");
  assert.equal(run.database, "data/shop.sqlite");
  assert.deepEqual(c.cases[0], { id: "list", label: "list", description: "", args: [], request: { method: "GET", path: "/", form: {} } });
});

test("a path that is a URL, or names another host, is refused", () => {
  for (const path of ["http://example.com/", "//example.com/a", "/\\example.com", "order.php", "/a b", "/a\nb"]) {
    rejects(withCase({ path }), /\/ で始まるパス/);
  }
});

test("each side's args must hold {port}", () => {
  const c = minimal();
  (c.run as { environments: { new: { args: string[] } } }).environments.new.args = ["-S", "127.0.0.1:8080"];
  rejects(c, /run\.environments\.new\.args に \{port\}/);
});

test("a form is for POST only; a web case has a request and no args", () => {
  rejects(withCase({ path: "/a", form: { q: "1" } }), /"POST" のときだけ/);
  rejects(withCase({ path: "/a", method: "PUT" }), /"GET" か "POST"/);
  rejects({ ...minimal(), cases: [{ id: "a", args: ["x"], request: { path: "/" } }] }, /args は Web 型では使えません/);
  rejects({ ...minimal(), cases: [{ id: "a" }] }, /request\.path/);
  const posted = parseConfig(withCase({ method: "POST", path: "/pay", form: { id: "3" } }), PATH);
  assert.deepEqual(posted.cases[0].request, { method: "POST", path: "/pay", form: { id: "3" } });
});

test("a request is refused outside the web type, and a database outside the source is refused", () => {
  const command = { ...minimal(), run: { type: "command", environments: { old: { label: "a", command: "/x" }, new: { label: "b", command: "/y" } } }, output: { format: "html", from: "stdout" } };
  rejects({ ...command, cases: [{ id: "a", args: [], request: { path: "/" } }] }, /Web 型（run\.type が web）のときだけ/);
  const c = minimal();
  (c.run as Record<string, unknown>).database = { file: "../elsewhere.sqlite" };
  rejects(c, /run\.database/);
});

test("suggest-only cannot be used with a database: the original would be written back on every request", () => {
  rejects({ ...minimal(), fixes: "suggest-only" }, /run\.database と fixes: "suggest-only" は一緒に使えません/);
  const run = { ...(minimal().run as Record<string, unknown>) };
  delete run.database;
  assert.equal(parseConfig({ ...minimal(), fixes: "suggest-only", run }, PATH).fixes, "suggest-only");
});

test("a numbered case group: each.range, with {n} as the default id and label", () => {
  const c = parseConfig({ ...minimal(), cases: [], caseGroups: [{ each: { range: [1, 3] }, request: { path: "/order.php?id={n}" } }] }, PATH);
  assert.deepEqual(c.caseGroups[0].each, { range: [1, 3] });
  assert.equal(c.caseGroups[0].id, "{n}");
  for (const range of [[3, 1], [1], [-1, 2], [1, 2.5], [0, 5000]]) {
    rejects({ ...minimal(), caseGroups: [{ each: { range }, request: { path: "/" } }] }, /each\.range/);
  }
});
