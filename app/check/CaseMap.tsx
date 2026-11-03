import type { Group } from "./case-order";
import { GROUP_LABEL } from "./case-order";
import styles from "./check.module.css";

/** A square's state: a verdict once there is one; while running, waiting, being worked on or checked. */
export type SquareState = Group | "waiting" | "working" | "checked";

export type Square = { id: string; label: string; state: SquareState };

const STATE_CLASS: Record<SquareState, string> = {
  broken: styles.sqBroken,
  needs_review: styles.sqReview,
  unjudged: styles.sqUnjudged,
  harmless: styles.sqHarmless,
  waiting: styles.sqWaiting,
  working: styles.sqWorking,
  checked: styles.sqChecked,
};

const STATE_LABEL: Record<SquareState, string> = { ...GROUP_LABEL, waiting: "まだ", working: "いま確かめています", checked: "確かめ終わり" };

/**
 * Every input as one square, in the order of the settings, coloured by its verdict: the few that
 * need a look stand out among the many that do not. While running, the squares fill as inputs are done.
 */
export function CaseMap({ squares, openId, onOpen }: { squares: Square[]; openId?: string | null; onOpen?: (id: string) => void }) {
  return (
    <ol className={styles.caseMap} aria-label="入力ごとの結果">
      {squares.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            className={`${styles.square} ${STATE_CLASS[s.state]} ${s.id === openId ? styles.sqOpen : ""}`}
            title={`${s.label}: ${STATE_LABEL[s.state]}`}
            aria-label={`${s.label}: ${STATE_LABEL[s.state]}`}
            disabled={!onOpen}
            onClick={() => onOpen?.(s.id)}
          />
        </li>
      ))}
    </ol>
  );
}
