import type { NaiveDiff } from "@/lib/compare/naive";
import styles from "./check.module.css";

/** What a plain diff of the two raw files says, folded: shown so the verdict can be read against it. */
export function NaiveDiffView({ naive }: { naive: NaiveDiff | null }) {
  if (!naive) {
    return (
      <div className={styles.naive}>
        <p className={styles.naiveHead}>素朴な diff: 片方に出力が無いので比べられません</p>
      </div>
    );
  }
  const same = naive.differingLines === 0;
  return (
    <details className={styles.naive}>
      <summary className={styles.naiveHead}>
        素朴な diff（生のファイルをそのまま比べた結果）:{" "}
        <strong>{same ? "同じ" : `違う — ${naive.totalLines} 行中 ${naive.differingLines} 行`}</strong>
        <span className={styles.muted}>
          {" "}
          （{naive.oldBytes.toLocaleString()} B → {naive.newBytes.toLocaleString()} B）
        </span>
      </summary>
      {naive.excerpt.length > 0 && <pre className={styles.naiveExcerpt}>{naive.excerpt.join("\n")}</pre>}
    </details>
  );
}
