import { describeRemaining, remainingOf } from "@/lib/fix/verify";
import type { CaseReport } from "@/lib/pipeline";
import { Badge } from "./Badge";
import styles from "./check.module.css";

type Props = {
  cases: CaseReport[];
  openId: string | null;
  onOpen: (caseId: string) => void;
  /** Cases ticked for the side-by-side view; at most two. */
  picked: string[];
  onPick: (caseId: string) => void;
};

/** One row per case: what went in and what came out, so the whole run reads at a glance. */
export function CaseTable({ cases, openId, onOpen, picked, onPick }: Props) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.pickCol}>並べる</th>
          <th>入力</th>
          <th>判定</th>
          <th>要約</th>
        </tr>
      </thead>
      <tbody>
        {cases.map((c) => (
          <tr key={c.caseId} className={c.caseId === openId ? styles.rowOpen : undefined} onClick={() => onOpen(c.caseId)}>
            <td className={styles.pickCol} onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                aria-label={`${c.label} を並べて見る`}
                checked={picked.includes(c.caseId)}
                disabled={!picked.includes(c.caseId) && picked.length >= 2}
                onChange={() => onPick(c.caseId)}
              />
            </td>
            <td>
              <span className={styles.caseLabel}>{c.label}</span>
              <span className={styles.caseDescription}>{c.description}</span>
            </td>
            <td>
              {c.verdict ? (
                <Badge verdict={c.verdict.verdict} />
              ) : c.carried ? (
                <>
                  <Badge verdict={c.carried.verdict} />
                  <span className={styles.carriedNote}>当てる前の判定（差は同じ）</span>
                </>
              ) : (
                <span className={styles.muted}>未判定</span>
              )}
            </td>
            <td className={styles.rowSummary}>{(c.verdict ?? c.carried)?.summary ?? describeRemaining(remainingOf(c))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
