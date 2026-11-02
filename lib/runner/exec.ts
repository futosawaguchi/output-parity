import { execFile, type ExecFileException } from "node:child_process";

export type ExecRequest = {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxBufferBytes: number;
};

/**
 * How one execution ended. Every outcome of the program under test is data,
 * including crashes and timeouts (DESIGN 7-6 A): this function never throws for them.
 */
export type ExecOutcome =
  | { kind: "exited"; exitCode: number }
  | { kind: "signaled"; signal: string }
  | { kind: "timedOut"; timeoutMs: number }
  | { kind: "outputTooLarge"; maxBufferBytes: number }
  | { kind: "spawnFailed"; code: string; message: string };

export type ExecResult = {
  outcome: ExecOutcome;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export function execOnce(req: ExecRequest): Promise<ExecResult> {
  const started = performance.now();
  return new Promise((resolve) => {
    execFile(
      req.command,
      req.args,
      {
        cwd: req.cwd,
        timeout: req.timeoutMs,
        maxBuffer: req.maxBufferBytes,
        encoding: "utf8",
        shell: false,
      },
      (error, stdout, stderr) => {
        const durationMs = Math.round(performance.now() - started);
        resolve({ outcome: toOutcome(error, req), stdout, stderr, durationMs });
      },
    );
  });
}

function toOutcome(error: ExecFileException | null, req: ExecRequest): ExecOutcome {
  if (!error) return { kind: "exited", exitCode: 0 };
  // Node reports a non-zero exit as a numeric `code`, and spawn problems as a string `code`.
  const code: unknown = error.code;
  if (typeof code === "number") return { kind: "exited", exitCode: code };
  if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return { kind: "outputTooLarge", maxBufferBytes: req.maxBufferBytes };
  }
  if (error.killed && error.signal) return { kind: "timedOut", timeoutMs: req.timeoutMs };
  if (error.signal) return { kind: "signaled", signal: error.signal };
  return { kind: "spawnFailed", code: String(code ?? "UNKNOWN"), message: error.message };
}
