import { useEffect, useRef, useState } from "react";
import type { SubjectEntry } from "@/lib/subject";
import { GROUP_LABEL, type Tally } from "./case-order";
import styles from "./check.module.css";
import { splitSubjects } from "./subject-row";

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
 * The subjects as the row of names at the top, the one shown filled, each with how many of its
 * latest result are broken. Past the first few, the rest fold under "ほか N つ" (subject-row.ts).
 * Choosing one swaps the page below; the row stays. Not while a job runs: it belongs to this subject.
 */
export function SubjectPicker({ subjects, current, disabled, onChoose }: { subjects: ListedSubject[]; current: string; disabled: boolean; onChoose: (id: string) => void }) {
  const { shown, more } = splitSubjects(subjects, current);
  return (
    <nav aria-label="題材" className={styles.subjectNav}>
      <span className={styles.subjectsTitle}>題材</span>
      <ul className={styles.subjectList}>
        {shown.map((s) => {
          const selected = s.id === current;
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
                <BrokenCount subject={s} />
              </button>
            </li>
          );
        })}
        {more.length > 0 && <MoreSubjects subjects={more} disabled={disabled} onChoose={onChoose} />}
      </ul>
    </nav>
  );
}

/** The folded subjects: a button that opens their list under it, each with what it compares. */
function MoreSubjects({ subjects, disabled, onChoose }: { subjects: ListedSubject[]; disabled: boolean; onChoose: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <li ref={box} className={styles.subjectMore}>
      <button className={styles.subjectItem} aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}>
        ほか {subjects.length} つ {open ? "▴" : "▾"}
      </button>
      {open && (
        <ul className={styles.subjectMoreList}>
          {subjects.map((s) => (
            <li key={s.id}>
              <button
                className={styles.subjectMoreItem}
                onClick={() => {
                  setOpen(false);
                  onChoose(s.id);
                }}
              >
                <span className={styles.subjectMoreName}>
                  {shortName(s)}
                  <BrokenCount subject={s} />
                </span>
                <span className={styles.subjectMoreAbout}>{whatItCompares(s)}</span>
                <span className={styles.subjectMoreAbout}>{latestOf(s)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** How many of the subject's latest result are broken; nothing when none are. */
function BrokenCount({ subject }: { subject: ListedSubject }) {
  const broken = subject.latest?.groups.find((g) => g.group === "broken")?.count ?? 0;
  if (broken === 0) return null;
  return (
    <span className={styles.subjectBroken} aria-label={`壊れている ${broken}`}>
      {broken}
    </span>
  );
}

/** What the subject compares, in one line: the environments, the outputs, how they are made, the latest counts. */
function describe(s: ListedSubject): string {
  return s.summary ? `${whatItCompares(s)}／ ${latestOf(s)}` : whatItCompares(s);
}

/** The environments, the outputs and how they are made. */
function whatItCompares(s: ListedSubject): string {
  if (!s.summary) return "設定が読めません";
  const kinds = [...s.summary.outputs.map(describeOutput), RUN_LABEL[s.summary.runType] ?? s.summary.runType].join("・");
  return `${s.summary.old} → ${s.summary.new}（${kinds}）`;
}

/** The counts of the latest result. */
function latestOf(s: ListedSubject): string {
  return s.latest ? s.latest.groups.map((g) => `${GROUP_LABEL[g.group]} ${g.count}`).join("・") : "まだ結果がありません";
}

function shortName(s: SubjectEntry): string {
  return s.shortName ?? s.name ?? s.id;
}
