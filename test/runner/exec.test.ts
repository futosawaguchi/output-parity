import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execOnce } from "../../lib/runner/exec";

/** Runs a small Node script as the program under test. */
async function run(script: string, limits: { stdout?: number; stderr?: number; timeoutMs?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  const req = {
    command: process.execPath,
    args: ["-e", script],
    cwd: dir,
    timeoutMs: limits.timeoutMs ?? 10_000,
    stdoutPath: join(dir, "stdout"),
    stderrPath: join(dir, "stderr"),
    maxStdoutBytes: limits.stdout ?? 1024 * 1024,
    maxStderrBytes: limits.stderr ?? 1024,
  };
  const result = await execOnce(req);
  return { ...result, stdout: await readFile(req.stdoutPath), stderr: await readFile(req.stderrPath, "utf8") };
}

test("binary stdout is kept byte for byte", async () => {
  const r = await run("process.stdout.write(Buffer.from([0x25, 0x50, 0x44, 0x46, 0xe2, 0xe3, 0xcf, 0xd3, 0x00, 0xff]))");
  assert.deepEqual(r.outcome, { kind: "exited", exitCode: 0 });
  assert.deepEqual([...r.stdout], [0x25, 0x50, 0x44, 0x46, 0xe2, 0xe3, 0xcf, 0xd3, 0x00, 0xff]);
});

test("a flood on stderr is cut, and the program still finishes", async () => {
  const r = await run("for (let i = 0; i < 1000; i++) console.error('Deprecated: something'); process.stdout.write('done')", { stderr: 100 });
  assert.deepEqual(r.outcome, { kind: "exited", exitCode: 0 });
  assert.equal(r.stdout.toString(), "done");
  assert.equal(r.stderrTruncated, true);
  assert.match(r.stderr, /以降を省きました/);
});

test("too much on stdout stops the run", async () => {
  const r = await run("process.stdout.write('x'.repeat(5000))", { stdout: 1000 });
  assert.equal(r.outcome.kind, "outputTooLarge");
});

test("a non-zero exit is an outcome, not an error", async () => {
  assert.deepEqual((await run("process.exit(255)")).outcome, { kind: "exited", exitCode: 255 });
});

test("a program that hangs is stopped at the time limit", async () => {
  assert.equal((await run("setTimeout(() => {}, 60000)", { timeoutMs: 300 })).outcome.kind, "timedOut");
});

test("a command that does not exist is reported, not thrown", async () => {
  const dir = await mkdtemp(join(tmpdir(), "output-parity-"));
  const r = await execOnce({
    command: join(dir, "no-such-command"),
    args: [],
    cwd: dir,
    timeoutMs: 1000,
    stdoutPath: join(dir, "o"),
    stderrPath: join(dir, "e"),
    maxStdoutBytes: 100,
    maxStderrBytes: 100,
  });
  assert.equal(r.outcome.kind, "spawnFailed");
});

test("the program under test does not see the API key or anything else of the tool's", async () => {
  process.env.ANTHROPIC_API_KEY = "test-not-a-real-key";
  process.env.OUTPUT_PARITY_SECRET = "x";
  try {
    const r = await run("process.stdout.write(JSON.stringify(Object.keys(process.env)))");
    const names: string[] = JSON.parse(r.stdout.toString());
    assert.ok(!names.includes("ANTHROPIC_API_KEY"));
    assert.ok(!names.includes("OUTPUT_PARITY_SECRET"));
    assert.ok(names.includes("PATH"));
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OUTPUT_PARITY_SECRET;
  }
});
