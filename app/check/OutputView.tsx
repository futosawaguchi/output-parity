import type { CaseReport, RunReport } from "@/lib/pipeline";
import styles from "./check.module.css";
import { PdfView } from "./PdfView";
import { outputUrl, pageUrl } from "./urls";

/** How an HTML output is shown: drawn as the page, or as the lines it was compared by. */
export type HtmlView = "page" | "lines";

/**
 * One side's output. A PDF is drawn as it is. An HTML page may be drawn too, inside a sandboxed
 * frame with nothing allowed (no script, no request, no form: the route sets the same policy).
 * Otherwise the output is shown as the lines it was compared by, with the changed ones marked
 * (a text output may be in Shift_JIS, which the browser would not read right on its own).
 */
export function OutputView({ report, c, slot, view = "lines" }: { report: RunReport; c: CaseReport; slot: "old" | "new"; view?: HtmlView }) {
  const label = report.environments[slot].label;
  if (report.outputFormat === "pdf") return <PdfView src={outputUrl(report, c.caseId, slot)} label={label} />;
  if (report.outputFormat === "html" && view === "page") {
    return (
      <figure className={styles.pdf}>
        <figcaption className={styles.pdfLabel}>{label}（画面。スクリプトと外のファイルは読み込みません）</figcaption>
        <iframe className={styles.pageFrame} src={pageUrl(report, c.caseId, slot)} sandbox="" referrerPolicy="no-referrer" title={`${label} の画面`} />
      </figure>
    );
  }

  const comparison = c.comparison;
  if (comparison.kind !== "compared") {
    return (
      <figure className={styles.pdf}>
        <figcaption className={styles.pdfLabel}>{label}</figcaption>
        <p className={styles.noOutput}>
          {comparison.kind === "missingOutput" ? "もう片方に出力が無いので、比べていません" : "テキストにできませんでした（下の比較の欄を見てください）"}
        </p>
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
