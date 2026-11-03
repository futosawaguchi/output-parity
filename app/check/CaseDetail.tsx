"use client";

import { useState } from "react";
import type { Comparison } from "@/lib/compare/compare-case";
import { checkArithmetic } from "@/lib/judge/arithmetic";
import type { CaseVerdict, Finding } from "@/lib/judge/verdict";
import type { CaseReport, RunReport } from "@/lib/pipeline";
import { describeOutcome } from "@/lib/runner/outcome";
import { Badge } from "./Badge";
import { CauseSection, type CauseActions } from "./CauseView";
import styles from "./check.module.css";
import { NaiveDiffView } from "./NaiveDiffView";
import { OutputView, type HtmlView } from "./OutputView";
import { SentLine } from "./SentLine";

/** Everything about one case: both outputs, the plain diff, the verdict and what was set aside. */
export function CaseDetail({ report, c, cause }: { report: RunReport; c: CaseReport; cause: CauseActions }) {
  const run = (slot: "old" | "new") => c.runs.find((r) => r.slot === slot)!;
  const [view, setView] = useState<HtmlView>("page");
  return (
    <article className={styles.case}>
      <header className={styles.caseHeader}>
        <h2 className={styles.caseTitle}>
          {c.label}
          <span className={styles.caseDescription}>{c.description}</span>
        </h2>
        <span className={styles.runs}>
          {run("new").request && <code className={styles.request}>{run("new").request}</code>}
          {report.environments.old.label}: {describeOutcome(run("old").outcome)} ／ {report.environments.new.label}:{" "}
          {describeOutcome(run("new").outcome)}
        </span>
      </header>
      {report.outputFormat === "html" && (
        <div className={styles.viewSwitch} role="group" aria-label="出力の見せ方">
          {(["page", "lines"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "page" ? "画面で見る" : "比べた文字で見る"}
            </button>
          ))}
        </div>
      )}
      <div className={styles.pdfs}>
        {(["old", "new"] as const).map((slot) =>
          run(slot).outputPath ? (
            <OutputView key={slot} report={report} c={c} slot={slot} view={view} />
          ) : (
            <figure key={slot} className={styles.pdf}>
              <figcaption className={styles.pdfLabel}>{report.environments[slot].label}</figcaption>
              <p className={styles.noOutput}>出力なし（{describeOutcome(run(slot).outcome)}）</p>
            </figure>
          ),
        )}
      </div>
      <NaiveDiffView naive={c.naive} />
      {c.verdict ? (
        <VerdictBlock verdict={c.verdict} subjectId={report.subjectId} />
      ) : c.carried ? (
        <>
          <p className={styles.muted}>当てたあとは判定していません。差が当てる前とまったく同じなので、当てる前の判定を出しています</p>
          <VerdictBlock verdict={c.carried} subjectId={report.subjectId} />
        </>
      ) : (
        <p className={styles.muted}>判定していません</p>
      )}
      <CauseSection c={c} subjectId={report.subjectId} actions={cause} />
      <DroppedLines comparison={c.comparison} />
    </article>
  );
}

export function VerdictBlock({ verdict, subjectId }: { verdict: CaseVerdict; subjectId: string }) {
  const by =
    verdict.judgedBy.kind === "claude"
      ? `Claude（${verdict.judgedBy.model}）が判定`
      : verdict.judgedBy.kind === "machine"
        ? "機械が判定（Claude は不要）"
        : "判定できませんでした";
  return (
    <div>
      <div className={styles.verdictLine}>
        <Badge verdict={verdict.verdict} />
        <p className={styles.summary}>{verdict.summary}</p>
      </div>
      <p className={styles.judgedBy}>
        {by}
        {verdict.judgedBy.kind === "failed" && ` → ${verdict.judgedBy.nextStep}`}
      </p>
      {verdict.excerpt && (
        <p className={styles.sentLine}>
          ⚠️ 出力が長い（全 {verdict.excerpt.totalLines.toLocaleString()} 行）ので、Claude には全文ではなく、変わった行の前後 {verdict.excerpt.around} 行ずつだけを送りました
        </p>
      )}
      {verdict.sent && <SentLine sent={verdict.sent} subjectId={subjectId} />}
      {verdict.findings.length > 0 && (
        <ul className={styles.findings}>
          {verdict.findings.map((f, i) => (
            <FindingItem key={i} finding={f} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FindingItem({ finding }: { finding: Finding }) {
  return (
    <li className={styles.finding}>
      <p className={styles.findingWhat}>
        <Badge verdict={finding.verdict} small />
        {finding.what}
      </p>
      <dl className={styles.facts}>
        <dt>理由</dt>
        <dd>{finding.why}</dd>
        {finding.evidence.length > 0 && (
          <>
            <dt>根拠</dt>
            <dd>
              {finding.evidence.map((e, i) => (
                <code key={i} className={styles.quote}>
                  {e}
                </code>
              ))}
            </dd>
          </>
        )}
        {finding.calculation && (
          <>
            <dt>計算</dt>
            <dd>
              <code className={styles.calc}>{finding.calculation}</code>
              <CalcCheck calculation={finding.calculation} />
            </dd>
          </>
        )}
        <dt>見る場所</dt>
        <dd>{finding.checkHere}</dd>
        {finding.machineNotes && finding.machineNotes.length > 0 && (
          <>
            <dt>機械の確認</dt>
            <dd className={styles.calcWrong}>
              {finding.machineNotes.join(" ／ ")}
            </dd>
          </>
        )}
      </dl>
    </li>
  );
}

/** DESIGN 8-3: the machine re-does Claude's arithmetic. Silent when there is nothing it can read. */
export function CalcCheck({ calculation }: { calculation: string }) {
  const checks = checkArithmetic(calculation);
  if (checks.length === 0) return null;
  const wrong = checks.filter((c) => !c.ok);
  if (wrong.length === 0) return <p className={styles.calcOk}>機械の検算: 合っています（{checks.length} か所）</p>;
  return (
    <p className={styles.calcWrong}>
      機械の検算: 合わない式があります — {wrong.map((c) => c.text).join("、")}
    </p>
  );
}

/** DESIGN 4-2: what the baseline threw away is shown, never hidden. */
function DroppedLines({ comparison }: { comparison: Comparison }) {
  if (comparison.kind !== "compared") return null;
  const dropped = comparison.changes.filter((c) => c.explainedByBaseline);
  if (comparison.baseline.kind === "unavailable") {
    return <p className={styles.muted}>ベースラインが使えなかったので、何も除外していません（{comparison.baseline.reason}）</p>;
  }
  if (dropped.length === 0) return null;
  const lines = dropped.flatMap((c) => c.newLines);
  return (
    <details className={styles.dropped}>
      <summary>
        毎回変わる値として除外した {lines.length} 行（同じ環境で2回動かして違った行。判定の対象外）
      </summary>
      <pre className={styles.droppedLines}>{lines.join("\n")}</pre>
    </details>
  );
}
