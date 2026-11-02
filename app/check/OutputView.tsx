import type { CaseReport, RunReport } from "@/lib/pipeline";
import styles from "./check.module.css";
import { PdfView } from "./PdfView";
import { outputUrl } from "./urls";

/**
 * One side's output. A PDF is drawn as it is. Anything else (text, HTML) is shown as the lines it
 * was compared by, with the changed ones marked: the raw file may be in Shift_JIS, and an HTML
 * page from the program under test is never rendered inside this page.
 */
export function OutputView({ report, c, slot }: { report: RunReport; c: CaseReport; slot: "old" | "new" }) {
  const label = report.environments[slot].label;
  if (report.outputFormat === "pdf") return <PdfView src={outputUrl(report, c.caseId, slot)} label={label} />;

  const comparison = c.comparison;
  if (comparison.kind !== "compared") {
    return (
      <figure className={styles.pdf}>
        <figcaption className={styles.pdfLabel}>{label}</figcaption>
        <p className={styles.noOutput}>テキストにできませんでした（下の比較の欄を見てください）</p>
      </figure>
    );
  }
  const changed = new Set<number>();
  for (const ch of comparison.changes) {
    if (ch.explainedByBaseline) continue;
    const [start, count] = slot === "old" ? [ch.oldStart, ch.oldLines.length] : [ch.newStart, ch.newLines.length];
    for (let i = start; i < start + count; i++) changed.add(i);
  }
  return (
    <figure className={styles.pdf}>
      <figcaption className={styles.pdfLabel}>
        {label}（{report.outputFormat === "html" ? "画面に見える文字とフォームの値" : "テキスト"}・{comparison[slot].lines.length} 行）
      </figcaption>
      <ol className={styles.textLines}>
        {comparison[slot].lines.map((line, i) => (
          <li key={i} className={changed.has(i) ? (slot === "old" ? styles.lineRemoved : styles.lineAdded) : undefined}>
            {line || " "}
          </li>
        ))}
      </ol>
    </figure>
  );
}
