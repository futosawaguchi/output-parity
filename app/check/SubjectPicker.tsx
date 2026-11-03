import type { SubjectEntry } from "@/lib/subject";
import { GROUP_LABEL, type Tally } from "./case-order";
import styles from "./check.module.css";

const FORMAT_LABEL: Record<string, string> = { pdf: "PDF", text: "テキスト", html: "HTML" };
const RUN_LABEL: Record<string, string> = { command: "コマンド", files: "ファイルを置く", web: "Web（サーバを立てる）" };

/** A subject as the page lists it: with the counts of its latest result (GET /api/runs). */
export type ListedSubject = SubjectEntry & { latest?: Tally | null };

/** "PDF" / "テキスト（Shift_JIS）": a format, with the encoding when it is not UTF-8. */
function describeOutput({ format, encoding }: { format: string; encoding: string }): string {
  const name = FORMAT_LABEL[format] ?? format;
  return encoding.toLowerCase() === "utf-8" ? name : `${name}（${encoding.toUpperCase().replace("SHIFT_JIS", "Shift_JIS")}）`;
}

/**
 * The subjects as the row of names at the top, the one shown underlined, each with how many of its
 * latest result are broken. Choosing one swaps the page below; the row stays. Not while a job
 * runs: it belongs to this subject.
 */
export function SubjectPicker({ subjects, current, disabled, onChoose }: { subjects: ListedSubject[]; current: string; disabled: boolean; onChoose: (id: string) => void }) {
  return (
    <nav aria-label="題材">
      <ul className={styles.subjectList}>
        {subjects.map((s) => {
          const selected = s.id === current;
          const broken = s.latest?.groups.find((g) => g.group === "broken")?.count ?? 0;
          return (
            <li key={s.id}>
              <button
                className={`${styles.subjectItem} ${selected ? styles.subjectItemSelected : ""}`}
                aria-current={selected ? "page" : undefined}
                disabled={disabled && !selected}
                title={describe(s)}
                onClick={() => {
                  if (!selected) onChoose(s.id);
                }}
              >
                {shortName(s)}
                {broken > 0 && (
                  <span className={styles.subjectBroken} aria-label={`壊れている ${broken}`}>
                    {broken}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** What the subject compares, in one line: the environments, the outputs, how they are made, the latest counts. */
function describe(s: ListedSubject): string {
  if (!s.summary) return "設定が読めません";
  const kinds = [...s.summary.outputs.map(describeOutput), RUN_LABEL[s.summary.runType] ?? s.summary.runType].join("・");
  const latest = s.latest ? s.latest.groups.map((g) => `${GROUP_LABEL[g.group]} ${g.count}`).join("・") : "まだ結果がありません";
  return `${s.summary.old} → ${s.summary.new}（${kinds}）／ ${latest}`;
}

function shortName(s: SubjectEntry): string {
  return s.shortName ?? s.name ?? s.id;
}
