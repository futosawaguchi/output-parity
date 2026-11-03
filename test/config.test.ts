import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { parseConfig, type CommandRun } from "../lib/config";
import { ConfigError } from "../lib/errors";

const PATH = "/somewhere/samples/demo/parity.config.jsonc";

/** The command type's run, which these settings use. */
const commandRun = (c: { run: unknown }) => c.run as CommandRun;

/** The smallest settings that are accepted; each test changes one thing. */
function minimal(): Record<string, unknown> {
  return {
    version: 1,
    name: "demo",
    source: "app",
    claude: { send: "none" },
    run: {
      type: "command",
      environments: {
        old: { label: "PHP 7.4", command: "/usr/bin/php7" },
        new: { label: "PHP 8.5", command: "/usr/bin/php8" },
      },
    },
    output: { format: "pdf", from: "file" },
    cases: [{ id: "case-a", args: ["app.php", "{output}"] }],
  };
}

function rejects(json: unknown, pattern: RegExp) {
  assert.throws(() => parseConfig(json, PATH), (e: Error) => e instanceof ConfigError && pattern.test(e.message));
}

test("defaults are filled in, and source is relative to the settings file", () => {
  const c = parseConfig(minimal(), PATH);
  assert.equal(c.source, join("/somewhere/samples/demo", "app"));
  assert.equal(c.fixes, "apply");
  assert.deepEqual(c.workspace.link, ["vendor", "node_modules"]);
  assert.equal(commandRun(c).cwd, ".");
  assert.equal(commandRun(c).timeoutMs, 30_000);
  assert.deepEqual(commandRun(c).environments.old, { label: "PHP 7.4", command: "/usr/bin/php7", args: [], env: {} });
  assert.deepEqual(c.cases[0], { id: "case-a", label: "case-a", description: "", args: ["app.php", "{output}"] });
});

test("a missing or unknown version is refused, saying which one is supported", () => {
  const noVersion = minimal();
  delete noVersion.version;
  rejects(noVersion, /version がありません/);
  rejects({ ...minimal(), version: 2 }, /version 2 には対応していません（対応しているのは 1）/);
});

test("per-side arguments and environment variables are read", () => {
  const json = minimal();
  (json.run as { environments: Record<string, object> }).environments.old = {
    label: "PHP 7.4",
    command: "/usr/bin/php7",
    args: ["-d", "display_errors=0"],
    env: { APP_ENV: "test" },
  };
  const c = parseConfig(json, PATH);
  assert.deepEqual(commandRun(c).environments.old.args, ["-d", "display_errors=0"]);
  assert.deepEqual(commandRun(c).environments.old.env, { APP_ENV: "test" });
  rejects({ ...json, run: { ...(json.run as object), environments: { ...commandRun(c).environments, new: { label: "x", command: "y", env: { "BAD-NAME": "1" } } } } }, /env の「BAD-NAME」/);
});

test("run.cwd must stay inside the source", () => {
  for (const cwd of ["..", "../other", "/abs"]) {
    rejects({ ...minimal(), run: { ...(minimal().run as object), cwd } }, /run\.cwd は source の中/);
  }
  assert.equal(commandRun(parseConfig({ ...minimal(), run: { ...(minimal().run as object), cwd: "public/..//bin" } }, PATH)).cwd, "public/..//bin");
});

test("an unknown run.type is refused", () => {
  rejects({ ...minimal(), run: { ...(minimal().run as object), type: "ftp" } }, /run\.type は "command"・"files"・"web" のどれか/);
});

test("fixes and workspace.link are checked", () => {
  assert.equal(parseConfig({ ...minimal(), fixes: "suggest-only" }, PATH).fixes, "suggest-only");
  rejects({ ...minimal(), fixes: "auto" }, /fixes は "apply" か "suggest-only"/);
  rejects({ ...minimal(), workspace: { link: ["lib/vendor"] } }, /workspace\.link はフォルダ名/);
});

test("a case writing to a file must say where", () => {
  rejects({ ...minimal(), cases: [{ id: "case-a", args: ["app.php"] }] }, /\{output\} がありません/);
  assert.ok(parseConfig({ ...minimal(), output: { format: "pdf", from: "stdout" }, cases: [{ id: "case-a", args: ["app.php"] }] }, PATH));
});

test("claude.send has no default: the person whose system it is chooses", () => {
  const noClaude = minimal();
  delete noClaude.claude;
  rejects(noClaude, /claude\.send がありません/);
  rejects({ ...minimal(), claude: { send: "all" } }, /claude\.send は "none" \/ "output" \/ "output-and-source"/);
  assert.deepEqual(parseConfig({ ...minimal(), claude: { send: "output" } }, PATH).claude, { send: "output", neverRead: [] });
});

test("claude.neverRead takes paths inside the source", () => {
  assert.deepEqual(parseConfig({ ...minimal(), claude: { send: "output-and-source", neverRead: ["config/*.php"] } }, PATH).claude.neverRead, ["config/*.php"]);
  for (const bad of ["/etc/passwd", "../x", ""]) rejects({ ...minimal(), claude: { send: "none", neverRead: [bad] } }, /claude\.neverRead/);
});
