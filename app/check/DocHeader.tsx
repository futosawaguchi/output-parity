import styles from "./doc.module.css";

/** The top of a page opened from the tool (the record, what was sent): the way back, and what it is. */
export function DocHeader({ subjectId, kind }: { subjectId: string; kind: string }) {
  return (
    <header className={styles.top}>
      <a className={styles.home} href={`/check?subject=${encodeURIComponent(subjectId)}`}>
        output-parity
      </a>
      <span className={styles.kind}>{kind}</span>
    </header>
  );
}
