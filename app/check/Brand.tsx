import styles from "./check.module.css";

/** The name of the tool at the left of the top row, the same on every page. */
export function Brand() {
  return (
    <p className={styles.appName}>
      <span className={styles.appMark} aria-hidden />
      <span className={styles.brandKana}>かわりめ</span>
      <span className={styles.brandRoman}>kawarime</span>
      <span className={styles.brandLine}>バージョンの変わり目で、見落とさない。</span>
    </p>
  );
}
