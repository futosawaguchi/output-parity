import { spawn, type ChildProcess } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { copyFile, mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { join } from "node:path";
import { outputOf, PORT_PLACEHOLDER, type Case, type EnvironmentName, type ParityConfig, type WebRun } from "../config";
import { ConfigError, ServerStartError } from "../errors";
import { childEnv } from "./child-env";
import { STDERR_CUT_MARK } from "./exec";
import type { ExecOutcome } from "./outcome";
import { MAX_STDERR_BYTES, MAX_STDOUT_BYTES, runSlots, type CaseResult, type Slot, type SlotResult } from "./run-case";

// The web type (DESIGN 7-4c). The tool starts the old and new servers itself, so that what is
// compared is what the code in front of it serves (a server someone left running may be serving
// the original, and "fixed" would be a lie), and stops them when the run ends.
// ⭐ Only 127.0.0.1 is ever asked: the host is not taken from the settings at all (DESIGN 7-3).

const HOST = "127.0.0.1";
const START_TIMEOUT_MS = 10_000;
/** The server writes its log line for a request around the time it answers; wait a little to keep it with that request. */
const LOG_SETTLE_MS = 50;

export type WebRunner = {
  runCase(testCase: Case, caseDir: string, keepOld?: SlotResult): Promise<CaseResult>;
  /** Stops every server started. Always call it (a finally block): a server left running holds its port. */
  stop(): Promise<void>;
};

type Server = { port: number; child: ChildProcess; logPath: string; args: string[]; exit: Promise<void> };

/**
 * Servers start when first needed: after an edit only the new side runs (the old output is kept),
 * so the old server is never started. `root` is work/<id>/ (or the source when nothing is written).
 */
export function webRunner(config: ParityConfig, run: WebRun, root: string, runDir: string): WebRunner {
  const started = new Map<EnvironmentName, Promise<Server>>();
  const server = (env: EnvironmentName) => {
    if (!started.has(env)) started.set(env, startServer(run, env, join(root, run.cwd), join(runDir, "servers")));
    return started.get(env)!;
  };
  const stopAll = () => {
    for (const s of started.values()) s.then((x) => x.child.kill("SIGKILL"), () => {});
  };
  // If the tool itself goes down mid-run, the servers go with it.
  process.once("exit", stopAll);

  return {
    runCase: (testCase, caseDir, keepOld) =>
      runSlots(testCase.id, caseDir, keepOld, async (slot, env, slotDir) =>
        requestPage(config, run, root, await server(env), testCase, slot, env, slotDir),
      ),
    async stop() {
      process.removeListener("exit", stopAll);
      await Promise.all([...started.values()].map((s) => s.then(stopServer, () => {})));
    },
  };
}

async function startServer(run: WebRun, env: EnvironmentName, cwd: string, logDir: string): Promise<Server> {
  const environment = run.environments[env];
  const port = await freePort();
  const args = environment.args.map((a) => a.replaceAll(PORT_PLACEHOLDER, String(port)));
  await mkdir(logDir, { recursive: true });
  const logPath = join(logDir, `${env}.log`);
  const fd = openSync(logPath, "a");
  const child = spawn(environment.command, args, { cwd, env: childEnv(environment.env) as NodeJS.ProcessEnv, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  const exit = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const failed = new Promise<string>((resolve) => {
    child.once("error", (e) => resolve(`起動できませんでした（${(e as NodeJS.ErrnoException).code ?? e.message}）`));
    child.once("exit", (code, signal) => resolve(`すぐに終了しました（${signal ?? `終了コード ${code}`}）`));
  });

  const deadline = Date.now() + START_TIMEOUT_MS;
  for (;;) {
    const why = await Promise.race([failed, listening(port).then((ok) => (ok ? null : undefined))]);
    if (why === null) return { port, child, logPath, args, exit };
    if (typeof why === "string" || Date.now() > deadline) {
      child.kill("SIGKILL");
      throw new ServerStartError(
        `${environment.label} のサーバが立ち上がりませんでした: ${typeof why === "string" ? why : `${START_TIMEOUT_MS / 1000} 秒待っても ${HOST}:${port} で受け付けません`}（記録: ${logPath}）`,
        `設定の run.environments.${env} の command と args を確かめてください（${PORT_PLACEHOLDER} の所で ${HOST} に待ち受けるように。例 ["-S", "${HOST}:${PORT_PLACEHOLDER}"]）`,
      );
    }
    await sleep(100);
  }
}

async function stopServer(s: Server): Promise<void> {
  if (s.child.exitCode !== null || s.child.signalCode !== null) return;
  s.child.kill("SIGTERM");
  const stopped = await Promise.race([s.exit.then(() => true), sleep(3000).then(() => false)]);
  if (!stopped) s.child.kill("SIGKILL");
}

/** One request, as one slot of a case. Like a program run, whatever the server does is a result, never an error. */
async function requestPage(
  config: ParityConfig,
  run: WebRun,
  root: string,
  server: Server,
  testCase: Case,
  slot: Slot,
  env: EnvironmentName,
  slotDir: string,
): Promise<SlotResult> {
  await mkdir(slotDir, { recursive: true });
  const request = testCase.request!;
  const outputPath = join(slotDir, `output.${outputOf(config, testCase).format}`);
  const stdoutPath = join(slotDir, "stdout.txt");
  const stderrPath = join(slotDir, "stderr.txt");

  if (run.database) await restoreDatabase(join(config.source, run.database), join(root, run.database));

  const logFrom = (await stat(server.logPath)).size;
  const startedAt = performance.now();
  const url = pageUrl(server.port, request.path);
  let outcome: ExecOutcome;
  let body: Buffer = Buffer.alloc(0);
  try {
    const res = await fetch(url, {
      method: request.method,
      body: request.method === "POST" ? new URLSearchParams(request.form) : undefined,
      // A redirect is a result to compare, and following one could leave this machine.
      redirect: "manual",
      signal: AbortSignal.timeout(run.timeoutMs),
    });
    body = Buffer.from(await res.arrayBuffer());
    outcome = body.length > MAX_STDOUT_BYTES ? { kind: "outputTooLarge", maxBufferBytes: MAX_STDOUT_BYTES } : { kind: "http", status: res.status, location: res.headers.get("location") };
  } catch (e) {
    outcome = e instanceof DOMException && e.name === "TimeoutError" ? { kind: "timedOut", timeoutMs: run.timeoutMs } : { kind: "requestFailed", message: causeOf(e) };
  }
  const durationMs = Math.round(performance.now() - startedAt);

  // A 5xx is the server failing, like a program that crashed: no page. Its body is kept as evidence.
  const page = outcome.kind === "http" && outcome.status < 500;
  if (page) await writeFile(outputPath, body);
  await writeFile(stdoutPath, page ? "" : body);
  await sleep(LOG_SETTLE_MS);
  await writeFile(stderrPath, await readFrom(server.logPath, logFrom, MAX_STDERR_BYTES));

  const result: SlotResult = {
    slot,
    env,
    command: run.environments[env].command,
    args: server.args,
    request: `${request.method} ${request.path}`,
    outcome,
    durationMs,
    outputPath: page ? outputPath : null,
    stdoutPath,
    stderrPath,
  };
  await writeFile(join(slotDir, "result.json"), JSON.stringify(result, null, 2) + "\n");
  return result;
}

/**
 * The page's URL on the tool's own server. The settings only ever give a path (config.ts), and
 * this checks again that the result still names that server: nothing can send a request elsewhere.
 */
export function pageUrl(port: number, path: string): URL {
  const url = new URL(path, `http://${HOST}:${port}`);
  if (url.protocol !== "http:" || url.hostname !== HOST || url.port !== String(port)) {
    throw new ConfigError(`ツールがローカル環境に立てたサーバ以外を指すパスです: ${path}`, "設定の request.path は / で始まるパスだけにしてください");
  }
  return url;
}

/** The database as it was before any request: what one request writes must not change the next one's page. */
async function restoreDatabase(original: string, target: string): Promise<void> {
  // SQLite's side files belong to the copy being replaced.
  await Promise.all(["-journal", "-wal", "-shm"].map((suffix) => rm(target + suffix, { force: true })));
  await copyFile(original, target);
}

async function readFrom(path: string, from: number, max: number): Promise<Buffer> {
  const file = await open(path, "r");
  try {
    const size = (await file.stat()).size;
    const length = Math.min(Math.max(size - from, 0), max);
    const buf = Buffer.alloc(length);
    await file.read(buf, 0, length, from);
    // Cut like a command's stderr (exec.ts), with the same note, so nothing reads the cut line as whole.
    return size - from > max ? Buffer.concat([buf, Buffer.from(`\n${STDERR_CUT_MARK} ${max} バイトを超えたので、以降を省きました）\n`)]) : buf;
  } finally {
    await file.close();
  }
}

/** A port nothing listens on right now, chosen by the system. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: HOST, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function causeOf(e: unknown): string {
  const cause = e instanceof Error ? (e.cause as NodeJS.ErrnoException | undefined) : undefined;
  return cause?.code ?? (e instanceof Error ? e.message : String(e));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
