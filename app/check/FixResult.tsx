import { describeDelta, describeRemaining, type FixAttempt, type FixOutcome } from "@/lib/fix/verify";
import styles from "./check.module.css";

const HEADLINE: Record<FixOutcome, string> = {
  fixed: "直りました",
  notFixed: "まだ直っていません",
  worse: "ほかの入力が悪くなりました",
  changed: "ほかの入力の差が変わりました",
};

/** The answer to "did the edit work?", decided by running everything again (DESIGN 7-4). */
type Props = {
  attempt: FixAttempt;
  labelOf: (caseId: string) => string;
  onUndo: () => void;
  busy: boolean;
  /** The shipped result of an edit applied on the author's machine, not one applied here. */
  bundled: boolean;
  /** The edit as a patch for the original source, to save. */
  patchUrl: string | null;
};

export function FixResult({ attempt, labelOf, onUndo, busy, bundled, patchUrl }: Props) {
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
            <span className={styles.caseLabel}>{d.label}</span> {describeDelta(d)}
          </li>
        ))}
      </ul>
      {verification.outcome === "fixed" && <IntoTheSource file={applied.file} line={applied.line} patchUrl={patchUrl} />}
      <UndoRow onUndo={onUndo} busy={busy} bundled={bundled} />
    </section>
  );
}

/**
 * What to do next: the edit was made to the copy only. A person puts it into the original with
 * their usual steps, then runs again, which copies the original afresh and checks the real fix.
 */
function IntoTheSource({ file, line, patchUrl }: { file: string; line: number; patchUrl: string | null }) {
  return (
    <div className={styles.nextSteps}>
      <p className={styles.nextStepsTitle}>元のソースに入れるには</p>
      <p className={styles.muted}>かわりめが書き換えたのは写し（work/）だけです。元のソースは、いつもの手順（ブランチ・レビュー・コミット）で直してください。</p>
      <ol className={styles.nextStepsList}>
        <li>
          元のソースの <code className={styles.location}>{file}:{line}</code> を開く
        </li>
        <li>
          上の差分のとおりに書き換える
          {patchUrl && (
            <>
              。または{" "}
              <a className={styles.smallAction} href={patchUrl} download>
                パッチを保存
              </a>{" "}
              して <code className={styles.location}>git apply</code> で当てる
            </>
          )}
        </li>
        <li>もう一度「実行して判定する」を押す。毎回、元のソースから写しを作り直して動かすので、直した元のコードで比べ直せます。差なしになったら、確かめた記録を残して本番へ</li>
      </ol>
    </div>
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
