import { AppBar } from "./AppBar";
import styles from "./check.module.css";
import { RunPanel } from "./RunPanel";

export default function CheckPage() {
  return (
    <>
      <AppBar home />
      <div className={styles.page}>
        <RunPanel />
      </div>
    </>
  );
}
