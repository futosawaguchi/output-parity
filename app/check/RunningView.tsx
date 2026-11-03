import type { JobState } from "@/lib/jobs";
import { CaseMap } from "./CaseMap";
import styles from "./check.module.css";
import { followProgress } from "./progress-squares";

type Running = Extract<JobState, { status: "running" }>;

const WHAT: Record<string, string> = { run: "実行して判定しています", rejudge: "Claude が判定し直しています", verify: "直し方を当てて、もう一度動かしています", undo: "元に戻しています", judge: "Claude が判定しています" };

/**
 * A job under way, in the place where its result will appear, in its two stages, each counted up
 * only: every input run and compared (fast, by the machine), then the few the machine could not
 * settle, read one by one by Claude. Squares take their verdict's colour as soon as there is one.
 */
export function RunningView({ job, cases }: { job: Running; cases: { id: string; label: string }[] }) {
  const { squares, compared, judging, judged } = followProgress(cases, job.progress);
  const last = job.progress.at(-1);
  const label = (id: string) => cases.find((c) => c.id === id)?.label ?? id;
  return (
    <div className={styles.countBand} role="status" aria-live="polite">
      <p className={styles.runningWhat}>{WHAT[job.kind] ?? "動かしています"}</p>
      {judging === null ? (
        <p className={styles.headline}>
          <span className={styles.headlineOf}>{cases.length} 件のうち、</span>
          <span className={styles.runningNumber}>{compared}</span>件を比べました
        </p>
      ) : (
        <p className={styles.headline}>
          <span className={styles.headlineOf}>機械で決まらなかった {judging} 件のうち、Claude が</span>
          <span className={styles.runningNumber}>{judged}</span>件を判定しました
        </p>
      )}
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
