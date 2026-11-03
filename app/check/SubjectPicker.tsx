import type { SubjectEntry } from "@/lib/subject";
import styles from "./check.module.css";

const FORMAT_LABEL: Record<string, string> = { pdf: "PDF", text: "テキスト", html: "HTML" };
const RUN_LABEL: Record<string, string> = { command: "コマンド", files: "ファイルを置く", web: "Web（サーバを立てる）" };

/** "PDF" / "テキスト（Shift_JIS）": a format, with the encoding when it is not UTF-8. */
function describeOutput({ format, encoding }: { format: string; encoding: string }): string {
  const name = FORMAT_LABEL[format] ?? format;
  return encoding.toLowerCase() === "utf-8" ? name : `${name}（${encoding.toUpperCase().replace("SHIFT_JIS", "Shift_JIS")}）`;
}

/**
 * The subjects side by side, each with what it compares: the environments, the output and how the
 * outputs are made. Choosing one loads the page for it. Not while a job runs: it belongs to this subject.
 */
export function SubjectPicker({ subjects, current, disabled }: { subjects: SubjectEntry[]; current: string; disabled: boolean }) {
  const listed = subjects.some((s) => s.id === current) ? subjects : [...subjects, { id: current, name: null }];
  return (
    <nav className={styles.subjects} aria-label="題材">
      <p className={styles.subjectsTitle}>題材</p>
      <div className={styles.subjectCards}>
        {listed.map((s) => {
          const selected = s.id === current;
          return (
            <button
              key={s.id}
              className={`${styles.subjectCard} ${selected ? styles.subjectCardSelected : ""}`}
              aria-current={selected ? "page" : undefined}
              disabled={disabled && !selected}
              onClick={() => {
                if (!selected) window.location.search = new URLSearchParams({ subject: s.id }).toString();
              }}
            >
              <span className={styles.subjectName}>{shortName(s)}</span>
              {s.summary ? (
                <>
                  <span className={styles.subjectEnvs}>
                    {s.summary.old} → {s.summary.new}
                  </span>
                  <span className={styles.subjectKind}>
                    {[...s.summary.outputs.map(describeOutput), RUN_LABEL[s.summary.runType] ?? s.summary.runType].join("・")}
                  </span>
                </>
              ) : (
                <span className={styles.subjectKind}>{subjects.some((x) => x.id === s.id) ? "設定が読めません" : "見つかりません"}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** The name without the "(old → new)" at its end: the card shows the environments on their own line. */
function shortName(s: SubjectEntry): string {
  if (!s.name) return s.id;
  return s.summary ? s.name.replace(/（[^（）]*→[^（）]*）\s*$/, "") : s.name;
}
