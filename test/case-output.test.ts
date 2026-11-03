import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptersFor } from "../lib/compare/adapters";
import { expandCaseGroups } from "../lib/case-groups";
import { formatsOf, outputKindOf } from "../lib/case-output";
import { parseConfig, outputOf } from "../lib/config";
import { ConfigError } from "../lib/errors";
import type { RunReport } from "../lib/pipeline";
import { renderRecord } from "../lib/record/render";

// A web app shows pages and also exports a CSV: one subject, outputs read in two ways (DESIGN 3-②).

const PATH = "/somewhere/samples/shop/parity.config.jsonc";

function settings(extra: Record<string, unknown>): Record<string, unknown> {
  const side = (label: string) => ({ label, command: "/usr/bin/php", args: ["-S", "127.0.0.1:{port}"] });
  return {
    version: 1,
    name: "shop",
    source: "app",
    claude: { send: "none" },
    run: { type: "web", environments: { old: side("PHP 7.4"), new: side("PHP 8.5") } },
    output: { format: "html", encoding: "utf-8" },
    cases: [{ id: "list", request: { path: "/" } }],
    ...extra,
  };
}

test("a case may be read in its own format and encoding; what it leaves out comes from output", () => {
  const c = parseConfig(
    settings({
      cases: [
        { id: "list", request: { path: "/" } },
        { id: "export", request: { path: "/export.php" }, output: { format: "text", encoding: "shift_jis" } },
        { id: "plain", request: { path: "/plain.php" }, output: { format: "text" } },
      ],
    }),
    PATH,
  );
  assert.deepEqual(c.cases.map((x) => outputOf(c, x)), [
    { format: "html", encoding: "utf-8" },
    { format: "text", encoding: "shift_jis" },
    { format: "text", encoding: "utf-8" },
  ]);
  assert.equal(c.cases[0].output, undefined, "a case without its own output has none");
});

test("a case's output can say only the format and the encoding, and the encoding must be readable", () => {
  const rejects = (output: unknown, pattern: RegExp) =>
    assert.throws(() => parseConfig(settings({ cases: [{ id: "a", request: { path: "/" }, output }] }), PATH), (e: Error) => e instanceof ConfigError && pattern.test(e.message));
  rejects({ format: "text", from: "file" }, /cases\[0\]\.output\.from は入力ごとには書けません/);
  rejects({ encoding: "klingon" }, /cases\[0\]\.output\.encoding「klingon」/);
  rejects("text", /cases\[0\]\.output がオブジェクトではありません/);
});

test("a case group passes its output to every case it makes", async () => {
  const c = await expandCaseGroups(
    parseConfig(settings({ caseGroups: [{ each: { range: [1, 2] }, id: "csv-{n}", request: { path: "/export.php?page={n}" }, output: { format: "text" } }] }), PATH),
  );
  assert.deepEqual(c.cases.map((x) => [x.id, outputOf(c, x).format]), [["list", "html"], ["csv-1", "text"], ["csv-2", "text"]]);
});

test("each case gets the adapter for its own output, and an unknown format stops before anything runs", () => {
  const adapters = adaptersFor({ format: "html" }, [{ id: "export", output: { format: "text", encoding: "shift_jis" } }]);
  assert.match(adapters("export").description, /shift_jis/);
  assert.match(adapters("list").description, /HTML/);
  assert.throws(() => adaptersFor({ format: "html" }, [{ id: "x", output: { format: "xlsx" } }]), ConfigError);
});

test("the record names every format the cases were read in", () => {
  const caseOf = (caseId: string, output?: { format: string; encoding: string }) =>
    ({ caseId, label: caseId, description: "", ...(output ? { output } : {}), runs: [], comparison: { kind: "missingOutput", missing: ["old", "new"] }, naive: null, verdict: null }) as RunReport["cases"][number];
  const report = {
    runId: "r",
    origin: "run",
    subjectId: "shop",
    configName: "shop",
    configDescription: "",
    environments: { old: { label: "PHP 7.4", command: "a" }, new: { label: "PHP 8.5", command: "b" } },
    outputFormat: "html",
    outputEncoding: "utf-8",
    startedAt: "2026-11-04T00:00:00Z",
    finishedAt: "2026-11-04T00:00:01Z",
    cases: [caseOf("list"), caseOf("order-1"), caseOf("export", { format: "text", encoding: "shift_jis" })],
  } as RunReport;
  assert.deepEqual(outputKindOf(report, report.cases[2]), { format: "text", encoding: "shift_jis" });
  assert.deepEqual(formatsOf(report).map((f) => f.count), [2, 1]);
  assert.match(renderRecord(report, { createdAt: new Date(), deprecations: { deprecations: [], cutCaseIds: [] } }), /出力の形式: html（utf-8）2 件・text（shift_jis）1 件/);
});
