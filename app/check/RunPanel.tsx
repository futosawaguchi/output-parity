"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JobKind, JobState } from "@/lib/jobs";
import type { RunReport } from "@/lib/pipeline";
import { SAME_ORIGIN_HEADER } from "@/lib/same-origin";
import styles from "./check.module.css";
import { Brand } from "./Brand";
import type { CauseActions } from "./CauseView";
import { MANY_CASES, tally } from "./case-order";
import { ReportView } from "./ReportView";
import { RunningView } from "./RunningView";
import { SubjectPicker, type ListedSubject } from "./SubjectPicker";
import { recordUrls } from "./urls";

type Problem = { message: string; nextStep: string };

/** What GET /api/runs says will be checked. Labels only; no local paths. */
type Target = {
  name: string;
  description: string;
  environments: { old: string; new: string };
  cases: { id: string; label: string; description: string }[];
  /** What each use of Claude sends, from the settings (claude.send). */
  claudeScope: string[];
};

const POLL_MS = 1000;


/** Where each kind of job is started (lib/jobs.ts says what each one does). */
const ENDPOINTS: Record<JobKind, string> = { run: "/api/runs", rejudge: "/api/rejudge", cause: "/api/cause", verify: "/api/apply", undo: "/api/undo", judge: "/api/judge" };

/**
 * The subject in the address (?subject=), or none for the default one. Read when needed rather
 * than kept: choosing another subject changes the address (without loading the page again).
 */
function subjectInAddress(): string | null {
  return new URLSearchParams(window.location.search).get("subject");
}

/** The run button, the progress while running, and the report once done. */
export function RunPanel() {
  const [subjects, setSubjects] = useState<ListedSubject[]>([]);
  // From choosing a subject until what it checks has arrived: the results area shows it is loading.
  const [loading, setLoading] = useState(true);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  // Which button was pressed, until the server has answered with a job.
  const [starting, setStarting] = useState<JobKind | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  // Why this machine cannot run the samples (no PHP, no key), as checked before any click.
  const [cannotRun, setCannotRun] = useState<Problem | null>(null);
  // The report on screen: the last finished job's, or the bundled one until then (DESIGN 7-2b).
  // Kept while a cause is looked for, so the page does not go blank under the reader.
  const [report, setReport] = useState<RunReport | null>(null);
  // Why the bundled outputs cannot be judged again here (no key, no bundle).
  const [cannotRejudge, setCannotRejudge] = useState<Problem | null>(null);
  // Why Claude cannot be asked for a cause here (no key).
  const [cannotAskClaude, setCannotAskClaude] = useState<Problem | null>(null);
  // Why an edit cannot be applied and run again here (no PHP).
  const [cannotApply, setCannotApply] = useState<Problem | null>(null);
  // The bundled run after applying the bundled cause's edit, offered when this machine cannot apply.
  const [bundledFix, setBundledFix] = useState<RunReport | null>(null);
  // The case whose cause was asked for from this page (after a reload, the job's progress says).
  const [askedCause, setAskedCause] = useState<string | null>(null);
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
      if (body.status === "done") setReport(body.report);
      if (body.status !== "running") stopPolling();
    };
    tick();
    timer.current = setInterval(tick, POLL_MS);
  }, []);

  // Answers to an earlier choice of subject are dropped when a later one was made meanwhile.
  const loads = useRef(0);

  /** Everything about the subject in the address. */
  const load = useCallback(() => {
    const subject = subjectInAddress();
    const mine = ++loads.current;
    fetch(subject ? `/api/runs?subject=${encodeURIComponent(subject)}` : "/api/runs", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        if (mine !== loads.current) return;
        setLoading(false);
        setSubjects(body.subjects);
        setSubjectId(body.subjectId);
        setTarget(body.target);
        setCannotRun(body.cannotRun);
        if (body.bundled) setReport(body.bundled);
        setBundledFix(body.bundledFix);
        setCannotRejudge(body.cannotRejudge);
        setCannotAskClaude(body.cannotAskClaude);
        setCannotApply(body.cannotApply);
        if (body.job) poll(body.job.jobId);
      })
      .catch(() => {
        if (mine !== loads.current) return;
        setLoading(false);
        setProblem({ message: "画面のサーバに接続できません", nextStep: "npm run dev が動いているか確認してください" });
      });
  }, [poll]);

  /** Another subject: the last one's results go at once, and the area says it is loading. */
  const switchTo = useCallback(() => {
    stopPolling();
    setLoading(true);
    setJob(null);
    setReport(null);
    setTarget(null);
    setProblem(null);
    setCannotRun(null);
    setBundledFix(null);
    setAskedCause(null);
    load();
  }, [load]);

  // A reloaded page picks up the job that is running or finished last; back and forward show that subject.
  useEffect(() => {
    load();
    window.addEventListener("popstate", switchTo);
    return () => {
      window.removeEventListener("popstate", switchTo);
      stopPolling();
    };
  }, [load, switchTo]);

  const choose = (id: string) => {
    window.history.pushState(null, "", `?${new URLSearchParams({ subject: id })}`);
    switchTo();
  };

  const start = async (kind: JobKind, payload: object = {}) => {
    setStarting(kind);
    setProblem(null);
    try {
      const res = await fetch(ENDPOINTS[kind], {
        method: "POST",
        headers: { [SAME_ORIGIN_HEADER]: "1", "content-type": "application/json" },
        body: JSON.stringify({ subject: subjectInAddress() ?? undefined, ...payload }),
      });
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
  // A new run, rejudge or verification replaces the report, so the old one is hidden until it is done.
  const replacing = (busy !== null && busy !== "cause") || (job?.status === "failed" && job.kind !== "cause");
  const shown = replacing ? null : report;
  const causeActions: CauseActions = {
    busy: running,
    cannot: cannotAskClaude,
    find: (caseId) => {
      setAskedCause(caseId);
      start("cause", { caseId });
    },
    cannotApply,
    apply: (caseId, candidate) => start("verify", { caseId, candidate }),
    // Only on the bundled report it was made from: nothing runs, the shipped result is shown.
    replay:
      bundledFix?.fixAttempt && shown?.origin === "bundled" && !shown.fixAttempt
        ? { caseId: bundledFix.fixAttempt.caseId, edit: bundledFix.fixAttempt.edit, show: () => setReport(bundledFix) }
        : null,
    // The case being looked into, and what Claude is reading right now.
    working:
      busy === "cause"
        ? {
            caseId: askedCause ?? (job?.progress[0]?.caseId || null),
            steps: job?.status === "running" && job.kind === "cause" ? job.progress.map((p) => p.message) : [],
          }
        : null,
  };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Brand />
        <SubjectPicker
          // The subject shown counts what is on the page: after an edit was applied or undone, that result.
          subjects={subjects.map((s) => (s.id === subjectId && shown ? { ...s, latest: tally(shown.cases) } : s))}
          current={subjectId ?? ""}
          disabled={running}
          onChoose={choose}
        />
      </header>
      <main className={styles.main}>
        <div className={styles.appLead}>
          <p>バージョンを上げる前と後の出力を比べ、見るべき違いだけを選び出すツール</p>
          <p className={styles.appLeadNote}>
            印刷した日時が変わっただけなら「無害」。金額や在庫の表示が変わって、読んだ人が判断を誤るなら「壊れている」。
          </p>
        </div>
        {loading && <p className={styles.loading} role="status">読み込んでいます…</p>}
        {target && <TargetIntro target={target} showCases={!shown && !running} />}
        {!loading && (
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
          </div>
        )}
        {job?.status === "running" && job.kind !== "cause" && target && <RunningView job={job} cases={target.cases} />}
        {cannotRun && !job && (
          <p className={styles.notice}>
            この環境ではまだ実行できません: {cannotRun.message}
            <br />→ {cannotRun.nextStep}
            {!cannotRejudge && (
              <>
                <br />
                プログラムを動かせなくても、API キーがあれば「同梱の出力を Claude に判定し直させる」で、同梱の出力をいま判定させられます。
              </>
            )}
          </p>
        )}

        {problem && <ProblemBox problem={problem} />}
        {job?.status === "failed" && <ProblemBox problem={job.error} />}
        {shown && (
          <ReportView
            report={shown}
            // The job's own report, or a bundled one shown in its place (before any job, or replayed).
            record={running ? null : recordUrls(shown, job?.status === "done" && job.report === shown ? job.jobId : null)}
            cause={causeActions}
            // A shipped result is only being looked at: going back is showing the bundled report again.
            onUndo={() => (shown.origin === "bundled" && shown.fixAttempt ? setReport(shown.fixAttempt.original) : start("undo"))}
            onJudgeHeld={() => start("judge")}
          />
        )}
      </main>
    </div>
  );
}

function TargetIntro({ target, showCases }: { target: Target; showCases: boolean }) {
  return (
    <div className={styles.target}>
      <h1 className={styles.targetName}>{target.name.replace(/（[^（）]*→[^（）]*）\s*$/, "")}</h1>
      <p className={styles.targetEnvs}>
        {target.environments.old} → {target.environments.new}
      </p>
      <dl className={styles.targetFacts}>
        <dt>何を比べるか</dt>
        <dd>{target.description}</dd>
        <dt>Claude に送るもの</dt>
        <dd>
          <details className={styles.scope}>
            <summary>送る前に鍵などに見える値を *** にし、送った全文は残します</summary>
            <ul>
              {target.claudeScope.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </dd>
      </dl>
      {showCases && (
        <ul className={styles.targetCases}>
          {target.cases.slice(0, MANY_CASES).map((c) => (
            <li key={c.id}>
              <span className={styles.caseLabel}>{c.label}</span>
              <span className={styles.caseDescription}>{c.description}</span>
            </li>
          ))}
          {target.cases.length > MANY_CASES && <li className={styles.muted}>ほか {target.cases.length - MANY_CASES} 件（全 {target.cases.length} 件）</li>}
        </ul>
      )}
    </div>
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
