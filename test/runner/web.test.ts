import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { expandCaseGroups } from "../../lib/case-groups";
import { parseConfig, type WebRun } from "../../lib/config";
import { ConfigError, ServerStartError } from "../../lib/errors";
import { preflight } from "../../lib/runner/preflight";
import { pageUrl, webRunner } from "../../lib/runner/web";

// The web type (DESIGN 7-4c) with a small Node server standing in for the app: the tool starts
// the servers, asks only 127.0.0.1, keeps what the server does as a result, puts the database
// back before every request, and stops the servers at the end.

const SERVER = `
const http = require("http"), fs = require("fs");
http.createServer((req, res) => {
  if (req.url === "/count") { fs.appendFileSync("data.db", "x"); res.end("<p>count " + fs.readFileSync("data.db", "utf8").length + "</p>"); return; }
  if (req.url === "/redirect") { res.writeHead(302, { Location: "http://example.com/" }); res.end(); return; }
  if (req.url === "/fail") { process.stderr.write("boom in app.js:3\\n"); res.writeHead(500); res.end("error page"); return; }
  if (req.method === "POST") { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => res.end("<p>posted " + b + "</p>")); return; }
  res.end("<p>hello " + req.url + "</p>");
}).listen(Number(process.argv[2]), "127.0.0.1");
`;

/** A source holding the server and an empty database, and a work/ copy of it where the servers run. */
async function setUp(cases: unknown[], command = process.execPath) {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  const work = join(dir, "work");
  for (const root of [dir, work]) {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "server.js"), SERVER);
    await writeFile(join(root, "data.db"), "");
  }
  const side = (label: string) => ({ label, command, args: ["server.js", "{port}"] });
  const config = parseConfig(
    {
      version: 1,
      name: "t",
      source: ".",
      claude: { send: "none" },
      run: { type: "web", environments: { old: side("old"), new: side("new") }, database: { file: "data.db" } },
      output: { format: "html" },
      cases,
    },
    join(dir, "parity.config.jsonc"),
  );
  return { dir, work, config, run: config.run as WebRun };
}

async function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = connect({ host: "127.0.0.1", port });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });
}

test("each page is requested from both servers; the database is put back before every request", async () => {
  const { dir, work, config, run } = await setUp([{ id: "count", request: { path: "/count" } }, { id: "post", request: { method: "POST", path: "/pay", form: { id: "3" } } }]);
  const runner = webRunner(config, run, work, join(dir, "run"));
  try {
    const counted = await runner.runCase(config.cases[0], join(dir, "run", "count"));
    const pages = await Promise.all(counted.slots.map((s) => readFile(s.outputPath!, "utf8")));
    // Without putting the database back, old/new/baseline would read 1, 2, 3.
    assert.deepEqual(pages, ["<p>count 1</p>", "<p>count 1</p>", "<p>count 1</p>"]);
    assert.deepEqual(counted.slots[0].outcome, { kind: "http", status: 200, location: null });
    assert.equal(counted.slots[0].request, "GET /count");
    assert.equal(await readFile(join(dir, "data.db"), "utf8"), "", "the original is never written");

    const posted = await runner.runCase(config.cases[1], join(dir, "run", "post"));
    assert.equal(await readFile(posted.slots[1].outputPath!, "utf8"), "<p>posted id=3</p>");
  } finally {
    await runner.stop();
  }
});

test("a redirect is not followed, and a 5xx is no page, with the server's log kept as evidence", async () => {
  const { dir, work, config, run } = await setUp([{ id: "redirect", request: { path: "/redirect" } }, { id: "fail", request: { path: "/fail" } }]);
  const runner = webRunner(config, run, work, join(dir, "run"));
  try {
    const moved = await runner.runCase(config.cases[0], join(dir, "run", "redirect"));
    assert.deepEqual(moved.slots[1].outcome, { kind: "http", status: 302, location: "http://example.com/" });
    assert.equal(await readFile(moved.slots[1].outputPath!, "utf8"), "");

    const failed = await runner.runCase(config.cases[1], join(dir, "run", "fail"));
    assert.deepEqual(failed.slots[1].outcome, { kind: "http", status: 500, location: null });
    assert.equal(failed.slots[1].outputPath, null);
    assert.equal(await readFile(failed.slots[1].stdoutPath, "utf8"), "error page");
    assert.match(await readFile(failed.slots[1].stderrPath, "utf8"), /boom in app\.js:3/);
  } finally {
    await runner.stop();
  }
});

test("after stop, nothing listens on the ports the servers used", async () => {
  const { dir, work, config, run } = await setUp([{ id: "a", request: { path: "/a" } }]);
  const runner = webRunner(config, run, work, join(dir, "run"));
  const result = await runner.runCase(config.cases[0], join(dir, "run", "a"));
  const ports = result.slots.map((s) => Number(s.args[1]));
  await runner.stop();
  for (const port of new Set(ports)) assert.equal(await isListening(port), false);
});

test("after an edit only the new side runs: the old server is never started", async () => {
  const { dir, work, config, run } = await setUp([{ id: "a", request: { path: "/a" } }]);
  const first = webRunner(config, run, work, join(dir, "run1"));
  const before = await first.runCase(config.cases[0], join(dir, "run1", "a"));
  await first.stop();
  const again = webRunner(config, run, work, join(dir, "run2"));
  try {
    await again.runCase(config.cases[0], join(dir, "run2", "a"), before.slots[0]);
  } finally {
    await again.stop();
  }
  const logs = await import("node:fs/promises").then((fs) => fs.readdir(join(dir, "run2", "servers")));
  assert.deepEqual(logs, ["new.log"]);
});

test("a server that does not start is a setup error with the next step", async () => {
  const { dir, work, config, run } = await setUp([{ id: "a", request: { path: "/a" } }], "/bin/false");
  const runner = webRunner(config, run, work, join(dir, "run"));
  try {
    await assert.rejects(runner.runCase(config.cases[0], join(dir, "run", "a")), (e: Error) => e instanceof ServerStartError && /立ち上がりませんでした/.test(e.message));
  } finally {
    await runner.stop();
  }
});

test("the page's URL always names the tool's own server", () => {
  assert.equal(pageUrl(8080, "/order.php?id=1").href, "http://127.0.0.1:8080/order.php?id=1");
  for (const path of ["//example.com/x", "http://example.com/", "https://127.0.0.1:8080/"]) {
    assert.throws(() => pageUrl(8080, path), ConfigError);
  }
});

test("preflight: the original database must be there", async () => {
  const { dir, config } = await setUp([{ id: "a", request: { path: "/a" } }]);
  await import("node:fs/promises").then((fs) => fs.rm(join(dir, "data.db")));
  await assert.rejects(preflight(config, dir), (e: Error) => e instanceof ConfigError && /DB のファイルがありません/.test(e.message));
});

test("numbered case groups fill {n} into the id, label and request", async () => {
  const { config } = await setUp([{ id: "a", request: { path: "/a" } }]);
  const grouped = await expandCaseGroups({
    ...config,
    cases: [],
    caseGroups: [{ each: { range: [2, 3] }, id: "order-{n}", label: "注文 {n}", description: "", args: [], request: { method: "POST", path: "/order.php?id={n}", form: { id: "{n}" } } }],
  });
  assert.deepEqual(grouped.cases, [
    { id: "order-2", label: "注文 2", description: "", args: [], request: { method: "POST", path: "/order.php?id=2", form: { id: "2" } } },
    { id: "order-3", label: "注文 3", description: "", args: [], request: { method: "POST", path: "/order.php?id=3", form: { id: "3" } } },
  ]);
});
