import { describeRemaining, type FixAttempt, type FixOutcome } from "@/lib/fix/verify";
import styles from "./check.module.css";

const HEADLINE: Record<FixOutcome, string> = {
  fixed: "直りました",
  notFixed: "まだ直っていません",
  worse: "ほかの入力が悪くなりました",
};

/** The answer to "did the edit work?", decided by running everything again (DESIGN 7-4). */
type Props = {
  attempt: FixAttempt;
  labelOf: (caseId: string) => string;
  onUndo: () => void;
  busy: boolean;
  /** The shipped result of an edit applied on the author's machine, not one applied here. */
  bundled: boolean;
};

export function FixResult({ attempt, labelOf, onUndo, busy, bundled }: Props) {
  const { edit, applied, verification } = attempt;
  if (applied.kind === "refused") {
    return (
      <div className={styles.problem} role="alert">
        <p>直し方を当てられませんでした: {applied.message}</p>
        <p className={styles.nextStep}>→ {applied.nextStep}</p>
        <UndoRow onUndo={onUndo} busy={busy} bundled={bundled} />
      </div>
    );
  }
  if (!verification) return null;
  const target = verification.deltas.find((d) => d.caseId === attempt.caseId);
  return (
    <section className={verification.outcome === "fixed" ? styles.fixOk : styles.fixNotYet}>
      <p className={styles.fixHeadline}>
        {HEADLINE[verification.outcome]}
        {target && `: ${labelOf(attempt.caseId)} は ${describeRemaining(target.before)} → ${describeRemaining(target.after)}`}
      </p>
      <p className={styles.muted}>
        {bundled && "同梱の結果です（作者の手元で当てて流し直したもの）。"}
        <code className={styles.location}>
          {applied.file}:{applied.line}
        </code>{" "}
        に当てて、新の環境で全部の入力を流し直し、<strong>当てる前の旧の出力</strong>（元のコード）と比べました。直ったかは差の有無で決まります（判定は呼んでいません）。言えるのは、この {verification.deltas.length} 件の入力についてだけです
      </p>
      <pre className={styles.code}>
        {[...edit.oldText.split("\n").map((l) => `- ${l}`), ...edit.newText.split("\n").map((l) => `+ ${l}`)].join("\n")}
      </pre>
      <ul className={styles.deltas}>
        {verification.deltas.map((d) => (
          <li key={d.caseId}>
            <span className={styles.caseLabel}>{d.label}</span> {describeRemaining(d.before)} → {describeRemaining(d.after)}
          </li>
        ))}
      </ul>
      <UndoRow onUndo={onUndo} busy={busy} bundled={bundled} />
    </section>
  );
}

function UndoRow({ onUndo, busy, bundled }: { onUndo: () => void; busy: boolean; bundled: boolean }) {
  return (
    <div className={styles.applyRow}>
      <button className={styles.subButton} onClick={onUndo} disabled={busy}>
        元に戻す
      </button>
      <span className={styles.muted}>
        {bundled ? "当てる前の同梱の結果に戻ります（何も動かしません）" : "work/ を原本から作り直し、当てる前の結果に戻します（プログラムも Claude も動かしません）"}
      </span>
    </div>
  );
}
