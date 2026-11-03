import styles from "./check.module.css";

/** The band at the top of every page of the tool: its name, and in one line what it does. */
export function AppBar({ home = false }: { home?: boolean }) {
  return (
    <header className={styles.appBar}>
      <div className={styles.appBarInner}>
        {home ? <span className={styles.appName}>output-parity</span> : <a className={styles.appName} href="/check">output-parity</a>}
        <span className={styles.appLead}>
          バージョンを上げる前と後の出力を比べ、違いを「読む人の判断が変わるか」で分けるツール
        </span>
      </div>
    </header>
  );
}
