"use client";

import { useState } from "react";
import type { CaseReport, RunReport } from "@/lib/pipeline";
import { CaseDetail } from "./CaseDetail";
import { CaseTable } from "./CaseTable";
import styles from "./check.module.css";
import type { CauseActions } from "./CauseView";
import { CompareView } from "./CompareView";
import { FixResult } from "./FixResult";

/** The overview of one run, and below it either one case in detail or two side by side. */
export function ReportView({ report, cause, onUndo }: { report: RunReport; cause: CauseActions; onUndo: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const byId = (id: string) => report.cases.find((c) => c.caseId === id);
  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : p));

  // Same order as the table, whichever box was ticked first.
  const pair = picked.length === 2 ? (report.cases.filter((c) => picked.includes(c.caseId)) as [CaseReport, CaseReport]) : null;
  const open = openId ? byId(openId) : undefined;
  const finishedAt = new Date(report.finishedAt).toLocaleString("ja-JP");

  return (
    <div className={styles.report}>
      <p className={styles.reportMeta}>
        {
          {
            run: `${finishedAt} に実行`,
            bundled: `同梱の結果です（${finishedAt} に作者の手元で実行し、リポジトリに入れたもの）。PHP も API キーも無しで見られます。`,
            rejudge: `同梱の出力（作者の手元で PHP が出したもの）を、${finishedAt} にこの環境の Claude が判定し直した結果です。`,
          }[report.origin]
        }
      </p>
      {report.fixAttempt && (
        <FixResult attempt={report.fixAttempt} labelOf={(id) => byId(id)?.label ?? id} onUndo={onUndo} busy={cause.busy} />
      )}
      <CaseTable cases={report.cases} openId={openId} onOpen={setOpenId} picked={picked} onPick={togglePick} />
      {pair ? (
        <CompareView report={report} cases={pair} />
      ) : open ? (
        <CaseDetail report={report} c={open} cause={cause} />
      ) : (
        <p className={styles.hint}>行を押すと、その入力の PDF・差・判定の根拠が出ます。「並べる」に2つチェックすると、左右に並べて見られます。</p>
      )}
    </div>
  );
}
