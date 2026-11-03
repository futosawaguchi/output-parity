import type { JobState } from "@/lib/jobs";
import { CASE_CHECKED } from "@/lib/progress";
import { CaseMap, type Square } from "./CaseMap";
import styles from "./check.module.css";

type Running = Extract<JobState, { status: "running" }>;

const WHAT: Record<string, string> = { run: "実行して判定しています", rejudge: "Claude が判定し直しています", verify: "直し方を当てて、もう一度動かしています", undo: "元に戻しています", judge: "Claude が判定しています" };

/**
 * A job under way, in the place where its result will appear: how many inputs are checked so far
 * (large, as the result's headline will be), the map filling square by square, and the latest step.
 */
export function RunningView({ job, cases }: { job: Running; cases: { id: string; label: string }[] }) {
  const squares = squaresOf(cases, job.progress);
  const checked = squares.filter((s) => s.state === "checked").length;
  const last = job.progress.at(-1);
  const label = (id: string) => cases.find((c) => c.id === id)?.label ?? id;
  return (
    <div className={styles.countBand} role="status" aria-live="polite">
      <p className={styles.runningWhat}>{WHAT[job.kind] ?? "動かしています"}</p>
      <p className={styles.headline}>
        <span className={styles.headlineOf}>{cases.length} 件のうち、</span>
        <span className={styles.runningNumber}>{checked}</span>件を確かめました
      </p>
      <CaseMap squares={squares} />
      <p className={styles.runningStep}>
        {last ? (
          <>
            {last.caseId && <span className={styles.progressCase}>{label(last.caseId)}</span>}
            {last.message}
          </>
        ) : (
          "準備しています"
        )}
      </p>
    </div>
  );
}

/** Each input's square from the progress so far: none yet, being worked on, or checked. */
function squaresOf(cases: { id: string; label: string }[], progress: { caseId: string; message: string }[]): Square[] {
  const last = new Map<string, string>();
  for (const p of progress) if (p.caseId) last.set(p.caseId, p.message);
  return cases.map((c) => {
    const message = last.get(c.id);
    return { id: c.id, label: c.label, state: message === undefined ? "waiting" : message === CASE_CHECKED ? "checked" : "working" };
  });
}
