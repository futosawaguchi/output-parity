import { GROUP_LABEL } from "./case-order";
import styles from "./check.module.css";
import type { Square, SquareState } from "./progress-squares";

export type { Square } from "./progress-squares";

const STATE_CLASS: Record<SquareState, string> = {
  broken: styles.sqBroken,
  needs_review: styles.sqReview,
  unjudged: styles.sqUnjudged,
  harmless: styles.sqHarmless,
  waiting: styles.sqWaiting,
  working: styles.sqWorking,
};

/** At most this many inputs, the squares are drawn twice as large. */
const FEW = 10;

const STATE_LABEL: Record<SquareState, string> = { ...GROUP_LABEL, waiting: "まだ", working: "いま確かめています" };

/**
 * Every input as one square, in the order of the settings, coloured by its verdict: the few that
 * need a look stand out among the many that do not. While running, the squares fill as inputs are done.
 */
export function CaseMap({
  squares,
  openId,
  onOpen,
  hoverId,
  onHover,
  appear = false,
}: {
  squares: Square[];
  openId?: string | null;
  onOpen?: (id: string) => void;
  /** The input pointed at here or in the list: its square is marked too. */
  hoverId?: string | null;
  onHover?: (id: string | null) => void;
  /** A finished result: the squares come in one after another, then the ones to look at. */
  appear?: boolean;
}) {
  // The whole map comes in within about 0.6 s however many squares there are.
  const step = Math.min(40, 600 / Math.max(squares.length, 1));
  return (
    <ol className={`${styles.caseMap} ${squares.length <= FEW ? styles.caseMapFew : ""} ${appear ? styles.caseMapAppear : ""}`} aria-label="入力ごとの結果">
      {squares.map((s, i) => (
        <li key={s.id} style={appear ? ({ "--delay": `${Math.round(i * step)}ms` } as React.CSSProperties) : undefined}>
          <button
            type="button"
            className={`${styles.square} ${STATE_CLASS[s.state]} ${s.id === openId ? styles.sqOpen : ""} ${s.id === hoverId ? styles.sqHover : ""}`}
            onMouseEnter={() => onHover?.(s.id)}
            onMouseLeave={() => onHover?.(null)}
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
