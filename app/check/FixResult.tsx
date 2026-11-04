"use client";

import { useEffect, useState } from "react";
import type { Edit } from "@/lib/fix/apply-edit";
import { type CaseDelta, describeDelta, describeRemaining, type FixAttempt, type FixOutcome, leftAsTheyWere } from "@/lib/fix/verify";
import styles from "./check.module.css";

const HEADLINE: Record<FixOutcome, string> = {
  fixed: "直りました",
  notFixed: "まだ直っていません",
  worse: "ほかの入力が悪くなりました",
  changed: "ほかの入力の差が変わりました",
};

/** The answer to "did the edit work?", decided by running everything again (DESIGN 7-4). */
type Props = {
  attempt: FixAttempt;
  labelOf: (caseId: string) => string;
  onUndo: () => void;
  busy: boolean;
  /** The shipped result of an edit applied on the author's machine, not one applied here. */
  bundled: boolean;
  /** The edit as a patch for the original source, to save. */
  patchUrl: string | null;
};

export function FixResult({ attempt, labelOf, onUndo, busy, bundled, patchUrl }: Props) {
  const { edit, applied, verification } = attempt;
  const earlier: Edit[] = attempt.earlier ?? [];
  if (applied.kind === "refused") {
    return (
      <div className={styles.problem} role="alert">
        <p>直し方を当てられませんでした: {applied.message}</p>
        <p className={styles.nextStep}>→ {applied.nextStep}</p>
        <UndoRow onUndo={onUndo} busy={busy} bundled={bundled} />
      </div>
    );
  }
  if (!verification) return null;
  const target = verification.deltas.find((d) => d.caseId === attempt.caseId);
  return (
    <section className={verification.outcome === "fixed" ? styles.fixOk : styles.fixNotYet}>
      <p className={styles.fixHeadline}>
        {HEADLINE[verification.outcome]}
        {target && `: ${labelOf(attempt.caseId)} は ${describeRemaining(target.before)} → ${describeRemaining(target.after)}`}
      </p>
      <p className={styles.muted}>
        {bundled && "同梱の結果です（開発者の手元で当てて流し直したもの）。"}
        <code className={styles.location}>
          {applied.file}:{applied.line}
        </code>{" "}
        に当てて、新の環境で全部の入力を流し直し、<strong>当てる前の旧の出力</strong>（元のコード）と比べました。直ったかは差の有無で決まります（判定は呼んでいません）。言えるのは、この {verification.deltas.length} 件の入力についてだけです
      </p>
      {earlier.length > 0 && <p className={styles.muted}>このコピーには、前に当てた直し方も入っています（{earlier.length + 1} つ。上から順に当てました）</p>}
      {[...earlier, edit].map((e, i) => (
        <pre key={i} className={styles.code}>
          {earlier.length > 0 && `${e.file}\n`}
          {[...e.oldText.split("\n").map((l) => `- ${l}`), ...e.newText.split("\n").map((l) => `+ ${l}`)].join("\n")}
        </pre>
      ))}
      <ul className={styles.deltas}>
        {verification.deltas.map((d) => (
          <li key={d.caseId}>
            <span className={styles.caseLabel}>{d.label}</span> {describeDelta(d)}
          </li>
        ))}
      </ul>
      {verification.outcome === "fixed" && <LeftOver cases={leftAsTheyWere(verification.deltas, attempt.caseId)} />}
      {verification.outcome === "fixed" && (
        <IntoTheSource where={earlier.length > 0 ? [...new Set([...earlier, edit].map((e) => e.file))].join("・") : `${applied.file}:${applied.line}`} patchUrl={patchUrl} />
      )}
      <UndoRow onUndo={onUndo} busy={busy} bundled={bundled} />
    </section>
  );
}

/** The cases this edit did not touch that still hold a difference, so "直りました" is not read as the whole run. */
function LeftOver({ cases }: { cases: CaseDelta[] }) {
  if (cases.length === 0) return null;
  return (
    <div className={styles.leftOver}>
      <p>
        まだ差が残っている入力: {cases.map((d) => `${d.label}（${describeRemaining(d.after)}）`).join("・")}。この直しの前と後で変わっていません
      </p>
      <p className={styles.nextStep}>→ 一覧で開いて、別に確かめてください</p>
    </div>
  );
}

/**
 * What to do next: the edit was made to the copy only. A person puts it into the original with
 * their usual steps, then runs again, which copies the original afresh and checks the real fix.
 */
function IntoTheSource({ where, patchUrl }: { where: string; patchUrl: string | null }) {
  const patch = usePatch(patchUrl);
  return (
    <div className={styles.nextSteps}>
      <p className={styles.nextStepsTitle}>元のソースに入れるには</p>
      <p className={styles.muted}>かわりめが書き換えたのはコピー（work/）だけです。元のソースは、いつもの手順（ブランチ・レビュー・コミット）で直してください。</p>
      <ol className={styles.nextStepsList}>
        <li>
          元のソースの <code className={styles.location}>{where}</code> を開く
        </li>
        <li>
          上の差分のとおりに書き換える
          {patch.kind === "ready" && (
            <>
              。または{" "}
              <a className={styles.smallAction} href={patchUrl ?? undefined} download>
                パッチを保存
              </a>{" "}
              して <code className={styles.location}>git apply</code> で当てる
            </>
          )}
          {patch.kind === "unavailable" && (
            <span className={styles.patchProblem}>
              （パッチは作れません: {patch.message} → {patch.nextStep}）
            </span>
          )}
        </li>
        <li>もう一度「実行して判定する」を押す。毎回、元のソースからコピーを作り直して動かすので、直した元のコードで比べ直せます。差なしになったら、確かめた記録を残して本番へ</li>
      </ol>
    </div>
  );
}

function UndoRow({ onUndo, busy, bundled }: { onUndo: () => void; busy: boolean; bundled: boolean }) {
  return (
    <div className={styles.applyRow}>
      <button className={styles.subButton} onClick={onUndo} disabled={busy}>
        元に戻す
      </button>
      <span className={styles.muted}>
        {bundled ? "当てる前の同梱の結果に戻ります（何も動かしません）" : "work/ を元のソースから作り直し、当てる前の結果に戻します（プログラムも Claude も動かしません）"}
      </span>
    </div>
  );
}

type PatchState = { kind: "checking" } | { kind: "ready" } | { kind: "unavailable"; message: string; nextStep: string };

/** Whether the patch can be made, asked before the link is offered (a failed download says nothing useful). */
function usePatch(url: string | null): PatchState {
  const [state, setState] = useState<PatchState>({ kind: "checking" });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) return setState({ kind: "ready" });
        const body = await res.json().catch(() => null);
        setState({ kind: "unavailable", message: body?.message ?? `HTTP ${res.status}`, nextStep: body?.nextStep ?? "画面を読み込み直してください" });
      })
      .catch(() => !cancelled && setState({ kind: "unavailable", message: "画面のサーバに接続できません", nextStep: "npm run dev が動いているか確認してください" }));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return url ? state : { kind: "unavailable", message: "この結果からはパッチを作れません", nextStep: "上の差分のとおりに直してください" };
}
