import { randomBytes } from "node:crypto";
import { SetupError } from "./errors";
import type { ProgressEvent, RunReport } from "./pipeline";

// Server-side "a run is in progress" (DESIGN 5: the second of three layers against double
// clicks). The browser can be bypassed with another tab or a reload; this cannot.

/**
 * run: executes the programs / rejudge: judges the bundled outputs again without running them /
 * cause: looks for the cause of one case in the source / verify: applies an edit to work/ and
 * runs everything again / undo: puts work/ back to the original / judge: judges the cases a run
 * held back until a person confirmed how many would be sent. Each one ends in a report.
 */
export type JobKind = "run" | "rejudge" | "cause" | "verify" | "undo" | "judge";

/** subjectId: the subject the job works on (lib/subject.ts). The page shows only its own subject's job. */
type JobBase = { jobId: string; kind: JobKind; subjectId: string; progress: ProgressEvent[] };

export type JobState =
  | (JobBase & { status: "running" })
  | (JobBase & { status: "done"; report: RunReport })
  | (JobBase & { status: "failed"; error: { message: string; nextStep: string } });

type Registry = { current: JobState | null };

// Kept on globalThis so that hot reloads in development do not forget a running job.
const registry: Registry = ((globalThis as { __outputParityJobs?: Registry }).__outputParityJobs ??= { current: null });

export type StartResult = { started: true; jobId: string } | { started: false; running: JobState };

/** Starts `work` unless another job is still running, of any subject. Only one job exists at a time. */
export function startJob(
  kind: JobKind,
  subjectId: string,
  work: (onProgress: (e: ProgressEvent) => void) => Promise<RunReport>,
): StartResult {
  if (registry.current?.status === "running") return { started: false, running: registry.current };

  const jobId = randomBytes(6).toString("hex");
  const progress: ProgressEvent[] = [];
  registry.current = { jobId, kind, subjectId, status: "running", progress };

  work((e) => progress.push(e)).then(
    (report) => {
      registry.current = { jobId, kind, subjectId, status: "done", progress, report };
    },
    (e: unknown) => {
      // Setup problems carry their own wording (DESIGN 7-6 B). Anything else is a bug in this
      // tool: log it here and show a fixed message, so no SDK or system detail reaches the page.
      if (!(e instanceof SetupError)) console.error(e);
      const error =
        e instanceof SetupError
          ? { message: e.message, nextStep: e.nextStep }
          : { message: "予期しないエラーで止まりました", nextStep: "もう一度押してください。続くときは、サーバのログを確かめてください（ローカル環境なら npm run dev のターミナル）" };
      registry.current = { jobId, kind, subjectId, status: "failed", progress, error };
    },
  );
  return { started: true, jobId };
}

export function getJob(jobId: string): JobState | null {
  return registry.current?.jobId === jobId ? registry.current : null;
}

/** The job running or finished last, if it is about `subjectId`. */
export function currentJob(subjectId: string): JobState | null {
  return registry.current?.subjectId === subjectId ? registry.current : null;
}

/** The job running now, of any subject: one at a time across subjects (programs and work/ are shared). */
export function runningJob(): JobState | null {
  return registry.current?.status === "running" ? registry.current : null;
}
