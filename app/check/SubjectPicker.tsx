import type { SubjectEntry } from "@/lib/subject";
import { GROUP_LABEL, type Tally } from "./case-order";
import styles from "./check.module.css";

const FORMAT_LABEL: Record<string, string> = { pdf: "PDF", text: "テキスト", html: "HTML" };
const RUN_LABEL: Record<string, string> = { command: "コマンド", files: "ファイルを置く", web: "Web（サーバを立てる）" };
const GROUP_CLASS: Record<string, string> = { broken: styles.dotBroken, needs_review: styles.dotReview, unjudged: styles.dotUnjudged, harmless: styles.dotHarmless };

/** A subject as the page lists it: with the counts of its latest result (GET /api/runs). */
export type ListedSubject = SubjectEntry & { latest?: Tally | null };

/** "PDF" / "テキスト（Shift_JIS）": a format, with the encoding when it is not UTF-8. */
function describeOutput({ format, encoding }: { format: string; encoding: string }): string {
  const name = FORMAT_LABEL[format] ?? format;
  return encoding.toLowerCase() === "utf-8" ? name : `${name}（${encoding.toUpperCase().replace("SHIFT_JIS", "Shift_JIS")}）`;
}

/**
 * The subjects down the left, each with what it compares and how its latest result came out.
 * Choosing one swaps the results beside it; the list stays. Not while a job runs: it belongs to this subject.
 */
export function SubjectPicker({ subjects, current, disabled, onChoose }: { subjects: ListedSubject[]; current: string; disabled: boolean; onChoose: (id: string) => void }) {
  return (
    <nav className={styles.subjects} aria-label="題材">
      <p className={styles.subjectsTitle}>題材</p>
      <ul className={styles.subjectList}>
        {subjects.map((s) => {
          const selected = s.id === current;
          return (
            <li key={s.id}>
              <button
                className={`${styles.subjectItem} ${selected ? styles.subjectItemSelected : ""}`}
                aria-current={selected ? "page" : undefined}
                disabled={disabled && !selected}
                onClick={() => {
                  if (!selected) onChoose(s.id);
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
                    <Latest tally={s.latest ?? null} />
                  </>
                ) : (
                  <span className={styles.subjectKind}>設定が読めません</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Latest({ tally }: { tally: Tally | null }) {
  if (!tally) return <span className={styles.subjectLatest}>まだ結果がありません</span>;
  return (
    <span className={styles.subjectLatest}>
      {tally.groups.map((g) => (
        <span key={g.group} className={styles.subjectCount}>
          <span className={`${styles.dot} ${GROUP_CLASS[g.group]}`} aria-hidden />
          {GROUP_LABEL[g.group]} {g.count}
        </span>
      ))}
    </span>
  );
}

/** The name without the "(old → new)" at its end: the item shows the environments on their own line. */
function shortName(s: SubjectEntry): string {
  if (!s.name) return s.id;
  return s.summary ? s.name.replace(/（[^（）]*→[^（）]*）\s*$/, "") : s.name;
}
