import { randomBytes } from "node:crypto";
import { SetupError } from "./errors";
import type { ProgressEvent, RunReport } from "./pipeline";

// Server-side "a run is in progress" (DESIGN 5: the second of three layers against double
// clicks). The browser can be bypassed with another tab or a reload; this cannot.

export type JobState =
  | { jobId: string; status: "running"; progress: ProgressEvent[] }
  | { jobId: string; status: "done"; progress: ProgressEvent[]; report: RunReport }
  | { jobId: string; status: "failed"; progress: ProgressEvent[]; error: { message: string; nextStep: string } };

type Registry = { current: JobState | null };

// Kept on globalThis so that hot reloads in development do not forget a running job.
const registry: Registry = ((globalThis as { __outputParityJobs?: Registry }).__outputParityJobs ??= { current: null });

export type StartResult = { started: true; jobId: string } | { started: false; runningJobId: string };

/** Starts `work` unless another job is still running. Only one job exists at a time. */
export function startJob(work: (onProgress: (e: ProgressEvent) => void) => Promise<RunReport>): StartResult {
  if (registry.current?.status === "running") return { started: false, runningJobId: registry.current.jobId };

  const jobId = randomBytes(6).toString("hex");
  const progress: ProgressEvent[] = [];
  registry.current = { jobId, status: "running", progress };

  work((e) => progress.push(e)).then(
    (report) => {
      registry.current = { jobId, status: "done", progress, report };
    },
    (e: unknown) => {
      // Setup problems carry their own wording (DESIGN 7-6 B). Anything else is a bug in this
      // tool: log it here and show a fixed message, so no SDK or system detail reaches the page.
      if (!(e instanceof SetupError)) console.error(e);
      const error =
        e instanceof SetupError
          ? { message: e.message, nextStep: e.nextStep }
          : { message: "予期しないエラーで止まりました", nextStep: "npm run dev を動かしているターミナルのログを確認してください" };
      registry.current = { jobId, status: "failed", progress, error };
    },
  );
  return { started: true, jobId };
}

export function getJob(jobId: string): JobState | null {
  return registry.current?.jobId === jobId ? registry.current : null;
}

export function currentJob(): JobState | null {
  return registry.current;
}
