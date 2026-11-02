"use client";

import { useState } from "react";
import type { CaseReport, RunReport } from "@/lib/pipeline";
import { CaseDetail } from "./CaseDetail";
import { CaseTable } from "./CaseTable";
import styles from "./check.module.css";
import { CompareView } from "./CompareView";

/** The overview of one run, and below it either one case in detail or two side by side. */
export function ReportView({ report }: { report: RunReport }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const byId = (id: string) => report.cases.find((c) => c.caseId === id);
  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : p));

  // Same order as the table, whichever box was ticked first.
  const pair = picked.length === 2 ? (report.cases.filter((c) => picked.includes(c.caseId)) as [CaseReport, CaseReport]) : null;
  const open = openId ? byId(openId) : undefined;

  return (
    <div className={styles.report}>
      <p className={styles.reportMeta}>{new Date(report.finishedAt).toLocaleString("ja-JP")} に実行</p>
      <CaseTable cases={report.cases} openId={openId} onOpen={setOpenId} picked={picked} onPick={togglePick} />
      {pair ? (
        <CompareView report={report} cases={pair} />
      ) : open ? (
        <CaseDetail report={report} c={open} />
      ) : (
        <p className={styles.hint}>行を押すと、その入力の PDF・差・判定の根拠が出ます。「並べる」に2つチェックすると、左右に並べて見られます。</p>
      )}
    </div>
  );
}
