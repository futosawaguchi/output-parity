"use client";

import { useState } from "react";
import type { CaseReport, RunReport } from "@/lib/pipeline";
import { GROUP_LABEL, groupOf, inReadingOrder, MANY_CASES, tally } from "./case-order";
import { CaseDetail } from "./CaseDetail";
import { CaseTable } from "./CaseTable";
import styles from "./check.module.css";
import type { CauseActions } from "./CauseView";
import { CompareView } from "./CompareView";
import { FixResult } from "./FixResult";

/** The overview of one run, and below it either one case in detail or two side by side. */
export function ReportView({
  report,
  record,
  cause,
  onUndo,
  onJudgeHeld,
}: {
  report: RunReport;
  /** The record of what was checked (DESIGN 4-5), when it can be made for this report. */
  record: { page: string; markdown: string } | null;
  cause: CauseActions;
  onUndo: () => void;
  onJudgeHeld: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // With many inputs the harmless ones are folded: the point is the few that need a look.
  const [showHarmless, setShowHarmless] = useState(false);

  const byId = (id: string) => report.cases.find((c) => c.caseId === id);
  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : p));

  // Same order as the table, whichever box was ticked first.
  const pair = picked.length === 2 ? (report.cases.filter((c) => picked.includes(c.caseId)) as [CaseReport, CaseReport]) : null;
  const open = openId ? byId(openId) : undefined;
  const finishedAt = new Date(report.finishedAt).toLocaleString("ja-JP");
  const ordered = inReadingOrder(report.cases);
  const folding = report.cases.length > MANY_CASES && !showHarmless;
  const harmless = ordered.filter((c) => groupOf(c) === "harmless").length;
  const listed = folding ? ordered.filter((c) => groupOf(c) !== "harmless" || c.caseId === openId) : ordered;

  return (
    <div className={styles.report}>
      <p className={styles.reportMeta}>
        {
          {
            run: `${finishedAt} に実行`,
            bundled: `同梱の結果です（${finishedAt} に作者の手元で実行し、リポジトリに入れたもの）。プログラムを動かす環境も API キーも無しで見られます。`,
            rejudge: `同梱の出力（作者の手元でプログラムが出したもの）を、${finishedAt} にこの環境の Claude が判定し直した結果です。`,
          }[report.origin]
        }
      </p>
      {report.fixAttempt && (
        <FixResult attempt={report.fixAttempt} labelOf={(id) => byId(id)?.label ?? id} onUndo={onUndo} busy={cause.busy} bundled={report.origin === "bundled"} />
      )}
      {report.judgeHeld && <HeldNotice held={report.judgeHeld} busy={cause.busy} onJudge={onJudgeHeld} />}
      <div className={styles.countBand}>
        <CountLine cases={report.cases} />
        {record && (
          <p className={styles.recordLinks}>
            <a className={styles.pageLink} href={record.page} target="_blank" rel="noreferrer">
              確かめた記録を見る
            </a>
            <a className={styles.smallAction} href={record.markdown} download>
              Markdown で保存
            </a>
            <span className={styles.muted}>どの入力で何を確かめたか・言えないことを1枚に</span>
          </p>
        )}
      </div>
      <CaseTable cases={listed} openId={openId} onOpen={setOpenId} picked={picked} onPick={togglePick} />
      {folding && harmless > 0 && (
        <button className={styles.linkButton} onClick={() => setShowHarmless(true)}>
          無害 {harmless} 件も表示する
        </button>
      )}
      {pair ? (
        <CompareView report={report} cases={pair} onClose={() => setPicked([])} />
      ) : open ? (
        <CaseDetail report={report} c={open} cause={cause} onClose={() => setOpenId(null)} />
      ) : (
        <p className={styles.hint}>行を押すと、その入力の出力・差・判定の根拠が出ます。「並べる」に2つチェックすると、左右に並べて見られます。</p>
      )}
    </div>
  );
}

const COUNT_CLASS: Record<string, string> = { broken: styles.countBroken, needs_review: styles.countReview, unjudged: styles.countUnjudged, harmless: styles.countHarmless };

/** "32 件: 壊れている 3・無害 29", each group in its colour. The words stay the plain line (the checks read it). */
function CountLine({ cases }: { cases: CaseReport[] }) {
  const { total, groups } = tally(cases);
  return (
    <p className={styles.countLine}>
      <span className={styles.countTotal}>{total} 件: </span>
      {groups.map((g, i) => (
        <span key={g.group}>
          {i > 0 && "・"}
          <span className={COUNT_CLASS[g.group]}>
            {GROUP_LABEL[g.group]} {g.count}
          </span>
        </span>
      ))}
    </p>
  );
}

/** More cases needed Claude than may be sent without asking: say how many calls it takes, and let a person decide. */
function HeldNotice({ held, busy, onJudge }: { held: NonNullable<RunReport["judgeHeld"]>; busy: boolean; onJudge: () => void }) {
  return (
    <div className={styles.notice}>
      <p>
        Claude に判定させる入力が {held.count} 件あります。1件ごとに Claude を1回呼び、新しい出力の全文を送ります。
        確かめずに送るのは {held.limit} 件までなので、まだ何も送っていません（下の一覧では「未判定」）。
      </p>
      <button className={styles.subButton} onClick={onJudge} disabled={busy}>
        {held.count} 件を Claude に判定させる
      </button>
    </div>
  );
}
