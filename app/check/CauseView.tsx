import type { EditCheck, LineCheck } from "@/lib/fix/check-cause";
import type { Edit } from "@/lib/fix/apply-edit";
import type { CauseCandidate, CauseReport } from "@/lib/fix/locate-cause";
import { remainingOf } from "@/lib/fix/verify";
import type { CaseReport } from "@/lib/pipeline";
import styles from "./check.module.css";
import { SentLine } from "./SentLine";

type Problem = { message: string; nextStep: string };

/** What the page lets a case do about its cause, and what is happening right now. */
export type CauseActions = {
  busy: boolean;
  /** Why Claude cannot be asked here (no key). */
  cannot: Problem | null;
  find: (caseId: string) => void;
  /** Why an edit cannot be applied and run again here (no PHP). */
  cannotApply: Problem | null;
  apply: (caseId: string, candidate: number) => void;
  /**
   * An edit already applied and checked on the author's machine, shipped with the bundle. Offered
   * instead of applying when this machine cannot run the programs (no PHP).
   */
  replay: { caseId: string; edit: Edit; show: () => void } | null;
  /** A cause being looked for: which case (null until the server has answered) and the latest step. */
  working: { caseId: string | null; message: string } | null;
};

/** Where in the source a broken or doubtful case comes from (DESIGN 7-4). Asked for by a button. */
export function CauseSection({ c, subjectId, actions }: { c: CaseReport; subjectId: string; actions: CauseActions }) {
  // Judged cases that are not harmless; unjudged ones (the run after an edit) while a difference is left.
  const left = remainingOf(c.comparison);
  const worthAsking = c.verdict ? c.verdict.verdict !== "harmless" : !(left.kind === "lines" && left.count === 0);
  if (!worthAsking) return null;
  const working = actions.working !== null && (actions.working.caseId === c.caseId || actions.working.caseId === null);
  return (
    <section className={styles.cause}>
      <div className={styles.causeHead}>
        <h3 className={styles.causeTitle}>原因</h3>
        <button
          className={styles.subButton}
          onClick={() => actions.find(c.caseId)}
          disabled={actions.busy || actions.cannot !== null}
          title={actions.cannot ? `${actions.cannot.message} → ${actions.cannot.nextStep}` : undefined}
        >
          {working ? "探しています…" : c.cause ? "もう一度探す" : "原因を探す"}
        </button>
      </div>
      {working ? (
        <p className={styles.progress} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden />
          {actions.working?.message || "Claude が原因を探し始めました"}
        </p>
      ) : c.cause ? (
        <CauseResult
          cause={c.cause}
          subjectId={subjectId}
          onApply={(i) => actions.apply(c.caseId, i)}
          busy={actions.busy}
          cannotApply={actions.cannotApply}
          replay={actions.replay?.caseId === c.caseId ? actions.replay : null}
        />
      ) : (
        <p className={styles.muted}>
          Claude がプログラムのソースと入力データを読んで、どの行が原因かを探します（プログラムを動かす環境は要りません）。
          {actions.cannot && ` いまは押せません: ${actions.cannot.message} → ${actions.cannot.nextStep}`}
        </p>
      )}
    </section>
  );
}

type ApplyProps = { onApply: (candidate: number) => void; busy: boolean; cannotApply: Problem | null; replay: CauseActions["replay"] };

function CauseResult({ cause, subjectId, ...apply }: { cause: CauseReport; subjectId: string } & ApplyProps) {
  if (cause.kind === "failed") {
    return (
      <div className={styles.problem} role="alert">
        <p>原因を探せませんでした: {cause.reason}</p>
        <p className={styles.nextStep}>→ {cause.nextStep}</p>
        {cause.sent && <SentLine sent={cause.sent} subjectId={subjectId} />}
      </div>
    );
  }
  return (
    <div>
      <p className={styles.summary}>{cause.summary}</p>
      <p className={styles.judgedBy}>
        Claude（{cause.model}）が {cause.reads.join("・") || "ソース"} を読んで特定
        {cause.candidates.length > 1 && `。候補は ${cause.candidates.length} つ（確からしい順）`}
      </p>
      {cause.sent && <SentLine sent={cause.sent} subjectId={subjectId} />}
      <ul className={styles.findings}>
        {cause.candidates.map((k, i) => (
          <Candidate key={i} k={k} {...apply} onApply={() => apply.onApply(i)} replay={apply.replay && k.edit && sameEdit(apply.replay.edit, k.edit) ? apply.replay : null} />
        ))}
      </ul>
    </div>
  );
}

function sameEdit(a: Edit, b: Edit): boolean {
  return a.file === b.file && a.oldText === b.oldText && a.newText === b.newText;
}

function Candidate({ k, onApply, busy, cannotApply, replay }: { k: CauseCandidate; onApply: () => void } & Omit<ApplyProps, "onApply">) {
  return (
    <li className={styles.finding}>
      <p className={styles.findingWhat}>
        <code className={styles.location}>
          {k.file}:{k.line}
        </code>
      </p>
      <pre className={styles.code}>{k.code}</pre>
      <p className={k.lineCheck === "matches" ? styles.calcOk : styles.calcWrong}>{LINE_CHECK[k.lineCheck]}</p>
      <dl className={styles.facts}>
        <dt>何が違う</dt>
        <dd>{k.change}</dd>
        <dt>なぜ</dt>
        <dd>{k.why}</dd>
        <dt>直し方</dt>
        <dd>
          {k.edit ? (
            <>
              <pre className={styles.code}>
                {[...k.edit.oldText.split("\n").map((l) => `- ${l}`), ...k.edit.newText.split("\n").map((l) => `+ ${l}`)].join("\n")}
              </pre>
              <p className={k.editCheck === "once" ? styles.calcOk : styles.calcWrong}>{EDIT_CHECK[k.editCheck ?? "missing"](k.edit.file)}</p>
              {k.editCheck === "once" && <ApplyRow onApply={onApply} busy={busy} cannotApply={cannotApply} replay={replay} />}
            </>
          ) : (
            <>
              <ol className={styles.steps}>
                {k.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <p className={styles.muted}>1か所の書き換えでは直せないので、道具では当てません。直したあと「実行して判定する」で確かめられます。</p>
            </>
          )}
        </dd>
      </dl>
    </li>
  );
}

/** Apply the edit and run everything again, or, where that cannot run, look at the bundled result of doing so. */
function ApplyRow({ onApply, busy, cannotApply, replay }: { onApply: () => void } & Omit<ApplyProps, "onApply">) {
  if (cannotApply && replay) {
    return (
      <div className={styles.applyRow}>
        <button className={styles.subButton} onClick={replay.show} disabled={busy}>
          同梱の「当てて確かめた結果」を見る
        </button>
        <span className={styles.muted}>
          この環境では当てて流し直せません（{cannotApply.message}）。作者の手元で同じ直し方を work/ に当て、全部の入力を流し直した結果を見せます
        </span>
      </div>
    );
  }
  return (
    <div className={styles.applyRow}>
      <button className={styles.subButton} onClick={onApply} disabled={busy || cannotApply !== null}>
        work/ に当てて、もう一度流して確かめる
      </button>
      <span className={styles.muted}>
        {cannotApply ? `いまは押せません: ${cannotApply.message} → ${cannotApply.nextStep}` : "原本は書き換えません。当てるのは写しの work/ です"}
      </span>
    </div>
  );
}

/** The machine's check of the line Claude pointed at (lib/fix/check-cause.ts). */
const LINE_CHECK: Record<LineCheck, string> = {
  matches: "機械の確認: この行は実在し、引用と一致します",
  differs: "機械の確認: その行番号の中身が引用と違います（行番号がずれている可能性があります）",
  missing: "機械の確認: そのファイルか行が見つかりません",
};

const EDIT_CHECK: Record<EditCheck, (file: string) => string> = {
  once: (file) => `機械の確認: 書き換える前の文は ${file} に1か所だけあり、そのまま当てられます`,
  notFound: (file) => `機械の確認: 書き換える前の文が ${file} に見つかりません。このままでは当てられません`,
  several: (file) => `機械の確認: 書き換える前の文が ${file} に2か所以上あり、どこを直すか決められません`,
  missing: (file) => `機械の確認: ${file} が見つかりません`,
};
