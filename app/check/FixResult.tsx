import { describeRemaining, type FixAttempt, type FixOutcome } from "@/lib/fix/verify";
import styles from "./check.module.css";

const HEADLINE: Record<FixOutcome, string> = {
  fixed: "直りました",
  notFixed: "まだ直っていません",
  worse: "ほかの入力が悪くなりました",
};

/** The answer to "did the edit work?", decided by running everything again (DESIGN 7-4). */
export function FixResult({ attempt, labelOf }: { attempt: FixAttempt; labelOf: (caseId: string) => string }) {
  const { edit, applied, verification } = attempt;
  if (applied.kind === "refused") {
    return (
      <div className={styles.problem} role="alert">
        <p>直し方を当てられませんでした: {applied.message}</p>
        <p className={styles.nextStep}>→ {applied.nextStep}</p>
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
        <code className={styles.location}>
          {applied.file}:{applied.line}
        </code>{" "}
        に当てて、全部の入力をもう一度流して比べました（判定は呼んでいません。直ったかは差の有無で決まります）
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
      <p className={styles.muted}>work/ に当てたままです。元に戻すには「実行して判定する」を押してください（work/ を samples/ から作り直します）。</p>
    </section>
  );
}
