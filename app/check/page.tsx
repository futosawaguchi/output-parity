import styles from "./check.module.css";
import { RunPanel } from "./RunPanel";

export default function CheckPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>output-parity</h1>
        <p className={styles.lead}>
          同じ入力を移行前と移行後の環境で動かし、出力の違いを「無害・要確認・壊れている」に分けます。差の大きさではなく、読む人の判断が変わるかで分けます。
        </p>
      </header>
      <RunPanel />
    </main>
  );
}
