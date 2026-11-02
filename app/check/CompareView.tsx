import type { CaseReport, RunReport } from "@/lib/pipeline";
import { Badge } from "./Badge";
import { CalcCheck } from "./CaseDetail";
import styles from "./check.module.css";
import { PdfView } from "./PdfView";

/**
 * Two cases side by side (DESIGN 6): the new outputs, the text that changed and the verdicts.
 * Works for any two cases, so it is a way of reading results, not a view built for one pair.
 */
export function CompareView({ report, cases }: { report: RunReport; cases: [CaseReport, CaseReport] }) {
  return (
    <section className={styles.compare}>
      <h2 className={styles.compareTitle}>
        {cases[0].label} と {cases[1].label} を並べて見る（{report.environments.new.label} の出力）
      </h2>
      <div className={styles.compareColumns}>
        {cases.map((c) => (
          <CompareColumn key={c.caseId} report={report} c={c} />
        ))}
      </div>
    </section>
  );
}

function CompareColumn({ report, c }: { report: RunReport; c: CaseReport }) {
  const newRun = c.runs.find((r) => r.slot === "new");
  const changed =
    c.comparison.kind === "compared"
      ? c.comparison.changes.filter((ch) => !ch.explainedByBaseline).flatMap((ch) => [...ch.oldLines.map((l) => `- ${l}`), ...ch.newLines.map((l) => `+ ${l}`)])
      : [];
  const calculation = c.verdict?.findings.find((f) => f.calculation)?.calculation ?? null;

  return (
    <div className={styles.compareColumn}>
      <p className={styles.caseTitle}>
        {c.label}
        <span className={styles.caseDescription}>{c.description}</span>
      </p>
      {newRun?.outputPath ? (
        <PdfView src={`/api/outputs/${report.runId}/${c.caseId}/new`} label={report.environments.new.label} />
      ) : (
        <p className={styles.noOutput}>出力なし</p>
      )}
      <div className={styles.compareBlock}>
        <p className={styles.compareLabel}>テキストの差</p>
        {changed.length > 0 ? <pre className={styles.changedLines}>{changed.join("\n")}</pre> : <p className={styles.muted}>なし</p>}
      </div>
      {c.verdict && (
        <div className={styles.compareBlock}>
          <div className={styles.verdictLine}>
            <Badge verdict={c.verdict.verdict} />
            <p>{c.verdict.summary}</p>
          </div>
          {calculation && (
            <>
              <code className={styles.calc}>{calculation}</code>
              <CalcCheck calculation={calculation} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
