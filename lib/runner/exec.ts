import { spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { childEnv } from "./child-env";
import type { ExecOutcome } from "./outcome";

export type { ExecOutcome } from "./outcome";

export type ExecRequest = {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  /** stdout and stderr are streamed to these files as bytes, never held in memory or decoded. */
  stdoutPath: string;
  stderrPath: string;
  /** stdout may be the output itself (a PDF, for example): the run is stopped beyond this. */
  maxStdoutBytes: number;
  /** stderr is only evidence: beyond this it is cut, and the program keeps running. */
  maxStderrBytes: number;
  /** Environment variables to set, on top of the few passed through (child-env.ts). */
  env?: Record<string, string>;
};

export type ExecResult = {
  outcome: ExecOutcome;
  durationMs: number;
  /** True when stderr was longer than maxStderrBytes and the rest was left out. */
  stderrTruncated: boolean;
};

/**
 * Runs a program once, without a shell. Never throws for what the program does (DESIGN 7-6 A):
 * crashing, hanging and flooding are outcomes. A program can print a deprecation warning
 * per call, so stderr is cut rather than allowed to stop the run.
 */
export function execOnce(req: ExecRequest): Promise<ExecResult> {
  const started = performance.now();
  return new Promise((resolve) => {
    const stdout = createWriteStream(req.stdoutPath);
    const stderr = createWriteStream(req.stderrPath);
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stderrTruncated = false;
    let tooLarge = false;
    let timedOut = false;
    let spawnError: NodeJS.ErrnoException | null = null;
    let finished = false;

    const child = spawn(req.command, req.args, {
      cwd: req.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      // Next.js types ProcessEnv with a required NODE_ENV; a child needs no such thing.
      env: childEnv(req.env) as NodeJS.ProcessEnv,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, req.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > req.maxStdoutBytes) {
        tooLarge = true;
        child.kill("SIGKILL");
        return;
      }
      stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const room = req.maxStderrBytes - stderrBytes;
      if (chunk.length > room) stderrTruncated = true;
      if (room <= 0) return;
      stderr.write(chunk.subarray(0, room));
      stderrBytes += Math.min(room, chunk.length);
    });

    const finish = async (code: number | null, signal: NodeJS.Signals | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (stderrTruncated) stderr.write(`\n…（標準エラー出力が ${req.maxStderrBytes} バイトを超えたので、以降を省きました）\n`);
      await Promise.all([close(stdout), close(stderr)]);
      const outcome: ExecOutcome = spawnError
        ? { kind: "spawnFailed", code: String(spawnError.code ?? "UNKNOWN"), message: spawnError.message }
        : tooLarge
          ? { kind: "outputTooLarge", maxBufferBytes: req.maxStdoutBytes }
          : timedOut
            ? { kind: "timedOut", timeoutMs: req.timeoutMs }
            : signal
              ? { kind: "signaled", signal }
              : { kind: "exited", exitCode: code ?? 0 };
      resolve({ outcome, durationMs: Math.round(performance.now() - started), stderrTruncated });
    };

    // A program that cannot be started (ENOENT, EACCES) reports "error", and may not report "close".
    child.on("error", (e: NodeJS.ErrnoException) => {
      spawnError = e;
      if (child.pid === undefined) finish(null, null);
    });
    child.on("close", finish);
  });
}

function close(stream: WriteStream): Promise<void> {
  return new Promise((resolve) => stream.end(resolve));
}
