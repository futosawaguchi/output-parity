// No Node imports here: the page in the browser uses this file too.

/**
 * How one execution ended. Every outcome of the program under test is data,
 * including crashes and timeouts (DESIGN 7-6 A): execOnce never throws for them.
 */
export type ExecOutcome =
  | { kind: "exited"; exitCode: number }
  | { kind: "signaled"; signal: string }
  | { kind: "timedOut"; timeoutMs: number }
  | { kind: "outputTooLarge"; maxBufferBytes: number }
  | { kind: "spawnFailed"; code: string; message: string }
  /** Nothing ran: the output was given as a file (run.type "files"), or that file was not there. */
  | { kind: "given"; found: boolean }
  /** A page was requested from the tool's own server (run.type "web"). 5xx means no page: the server failed. */
  | { kind: "http"; status: number; location: string | null }
  /** The server did not answer (it stopped, or refused the connection). */
  | { kind: "requestFailed"; message: string };

/** One line describing how a run ended, for people. */
export function describeOutcome(o: ExecOutcome): string {
  switch (o.kind) {
    case "exited":
      return `終了コード ${o.exitCode}`;
    case "signaled":
      return `シグナル ${o.signal} で終了`;
    case "timedOut":
      return `${o.timeoutMs} ms で打ち切り`;
    case "outputTooLarge":
      return `出力が ${o.maxBufferBytes} バイトを超えたので打ち切り`;
    case "spawnFailed":
      return `起動できませんでした（${o.code}）`;
    case "given":
      return o.found ? "渡されたファイル" : "フォルダにファイルがありません";
    case "http":
      return `HTTP ${o.status}${o.location ? `（${o.location} へ移動）` : ""}`;
    case "requestFailed":
      return `サーバが応えませんでした（${o.message}）`;
  }
}

/**
 * How the old and new runs ended, when the two differ (exit code, HTTP status, where a redirect
 * goes). The same output with a different ending is not "no difference": a program that now
 * fails after writing its output, or a page that now sends the reader elsewhere, has changed.
 * Compared as people read them, so a timeout or a crash counts as a different ending too.
 */
export function differentEndings(runs: { slot: string; outcome: ExecOutcome }[]): { old: string; new: string } | null {
  const of = (slot: string) => runs.find((r) => r.slot === slot);
  const [oldRun, newRun] = [of("old"), of("new")];
  if (!oldRun || !newRun) return null;
  const ending = { old: describeOutcome(oldRun.outcome), new: describeOutcome(newRun.outcome) };
  return ending.old === ending.new ? null : ending;
}
