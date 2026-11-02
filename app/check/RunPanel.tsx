"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JobKind, JobState } from "@/lib/jobs";
import type { RunReport } from "@/lib/pipeline";
import { SAME_ORIGIN_HEADER } from "@/lib/same-origin";
import styles from "./check.module.css";
import { ReportView } from "./ReportView";

type Problem = { message: string; nextStep: string };

/** What GET /api/runs says will be checked. Labels only; no local paths. */
type Target = {
  name: string;
  description: string;
  environments: { old: string; new: string };
  cases: { id: string; label: string; description: string }[];
};

const POLL_MS = 1000;

/** /api/runs runs the programs; /api/rejudge judges the bundled outputs again (no PHP needed). */
const ENDPOINTS: Record<JobKind, string> = { run: "/api/runs", rejudge: "/api/rejudge" };

/** The run button, the progress while running, and the report once done. */
export function RunPanel() {
  const [job, setJob] = useState<JobState | null>(null);
  // Which button was pressed, until the server has answered with a job.
  const [starting, setStarting] = useState<JobKind | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  // Why this machine cannot run the samples (no PHP, no key), as checked before any click.
  const [cannotRun, setCannotRun] = useState<Problem | null>(null);
  // The run that ships with the repository, shown until a run is made here (DESIGN 7-2b).
  const [bundled, setBundled] = useState<RunReport | null>(null);
  // Why the bundled outputs cannot be judged again here (no key, no bundle).
  const [cannotRejudge, setCannotRejudge] = useState<Problem | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const poll = useCallback((jobId: string) => {
    stopPolling();
    const tick = async () => {
      const res = await fetch(`/api/runs/${jobId}`, { cache: "no-store" }).catch(() => null);
      if (!res) return setProblem({ message: "画面のサーバに接続できません", nextStep: "npm run dev が動いているか確認してください" });
      const body = await res.json();
      if (!res.ok) {
        stopPolling();
        return setProblem(body);
      }
      setJob(body);
      if (body.status !== "running") stopPolling();
    };
    tick();
    timer.current = setInterval(tick, POLL_MS);
  }, []);

  // A reloaded page picks up the job that is running or finished last.
  useEffect(() => {
    fetch("/api/runs", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        setTarget(body.target);
        setCannotRun(body.cannotRun);
        setBundled(body.bundled);
        setCannotRejudge(body.cannotRejudge);
        if (body.job) poll(body.job.jobId);
      })
      .catch(() => {});
    return stopPolling;
  }, [poll]);

  const start = async (kind: JobKind) => {
    setStarting(kind);
    setProblem(null);
    try {
      const res = await fetch(ENDPOINTS[kind], { method: "POST", headers: { [SAME_ORIGIN_HEADER]: "1" } });
      const body = await res.json();
      // 409: already running (another tab, for example). Follow that run instead of starting one.
      if (res.status === 409 && body.jobId) return poll(body.jobId);
      if (!res.ok) return setProblem(body);
      poll(body.jobId);
    } catch {
      setProblem({ message: "画面のサーバに接続できません", nextStep: "npm run dev が動いているか確認してください" });
    } finally {
      setStarting(null);
    }
  };

  // Disabled by state, not by a timer (DESIGN 5): from the click until the run has finished.
  const busy = starting ?? (job?.status === "running" ? job.kind : null);
  const running = busy !== null;
  const shown = job?.status === "done" ? job.report : !job ? bundled : null;
  const origin = job?.status === "done" ? job.kind : "bundled";

  return (
    <section>
      {target && <TargetIntro target={target} showCases={!shown} />}
      <div className={styles.controls}>
        <button className={styles.runButton} onClick={() => start("run")} disabled={running || cannotRun !== null}>
          {busy === "run" ? "実行中…" : "実行して判定する"}
        </button>
        <button
          className={styles.subButton}
          onClick={() => start("rejudge")}
          disabled={running || cannotRejudge !== null}
          title={cannotRejudge ? `${cannotRejudge.message} → ${cannotRejudge.nextStep}` : undefined}
        >
          {busy === "rejudge" ? "判定し直しています…" : "同梱の出力を Claude に判定し直させる"}
        </button>
        {job?.status === "running" && <Progress job={job} labelOf={(id) => target?.cases.find((c) => c.id === id)?.label ?? id} />}
      </div>
      {cannotRun && !job && (
        <p className={styles.notice}>
          この環境ではまだ実行できません: {cannotRun.message}
          <br />→ {cannotRun.nextStep}
          {!cannotRejudge && (
            <>
              <br />
              PHP が無くても、API キーがあれば「同梱の出力を Claude に判定し直させる」で、同梱の PDF をいま判定させられます。
            </>
          )}
        </p>
      )}

      {problem && <ProblemBox problem={problem} />}
      {job?.status === "failed" && <ProblemBox problem={job.error} />}
      {shown && <ReportView report={shown} origin={origin} />}
    </section>
  );
}

function TargetIntro({ target, showCases }: { target: Target; showCases: boolean }) {
  return (
    <div className={styles.target}>
      <p className={styles.targetName}>{target.name}</p>
      <p>{target.description}</p>
      {showCases && (
        <ul className={styles.targetCases}>
          {target.cases.map((c) => (
            <li key={c.id}>
              <span className={styles.caseLabel}>{c.label}</span>
              <span className={styles.caseDescription}>{c.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Progress({ job, labelOf }: { job: Extract<JobState, { status: "running" }>; labelOf: (caseId: string) => string }) {
  const last = job.progress.at(-1);
  return (
    <p className={styles.progress} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden />
      {last ? (
        <>
          {last.caseId && <span className={styles.progressCase}>{labelOf(last.caseId)}</span>}
          {last.message}
        </>
      ) : (
        "準備しています"
      )}
    </p>
  );
}

function ProblemBox({ problem }: { problem: Problem }) {
  return (
    <div className={styles.problem} role="alert">
      <p>{problem.message}</p>
      <p className={styles.nextStep}>→ {problem.nextStep}</p>
    </div>
  );
}
