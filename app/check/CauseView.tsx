import type { EditCheck, LineCheck } from "@/lib/fix/check-cause";
import type { CauseCandidate, CauseReport } from "@/lib/fix/locate-cause";
import type { CaseReport } from "@/lib/pipeline";
import styles from "./check.module.css";

type Problem = { message: string; nextStep: string };

/** What the page lets a case do about its cause, and what is happening right now. */
export type CauseActions = {
  busy: boolean;
  /** Why Claude cannot be asked here (no key). */
  cannot: Problem | null;
  find: (caseId: string) => void;
  /** A cause being looked for: which case (null until the server has answered) and the latest step. */
  working: { caseId: string | null; message: string } | null;
};

/** Where in the source a broken or doubtful case comes from (DESIGN 7-4). Asked for by a button. */
export function CauseSection({ c, actions }: { c: CaseReport; actions: CauseActions }) {
  if (!c.verdict || c.verdict.verdict === "harmless") return null;
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
        <CauseResult cause={c.cause} />
      ) : (
        <p className={styles.muted}>
          Claude がプログラムのソースと入力データを読んで、どの行が原因かを探します（PHP は要りません）。
          {actions.cannot && ` いまは押せません: ${actions.cannot.message} → ${actions.cannot.nextStep}`}
        </p>
      )}
    </section>
  );
}

function CauseResult({ cause }: { cause: CauseReport }) {
  if (cause.kind === "failed") {
    return (
      <div className={styles.problem} role="alert">
        <p>原因を探せませんでした: {cause.reason}</p>
        <p className={styles.nextStep}>→ {cause.nextStep}</p>
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
      <ul className={styles.findings}>
        {cause.candidates.map((k, i) => (
          <Candidate key={i} k={k} />
        ))}
      </ul>
    </div>
  );
}

function Candidate({ k }: { k: CauseCandidate }) {
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
