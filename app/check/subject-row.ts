/**
 * How many subjects the top row shows before the rest fold under "ほか N つ": a number, not what
 * fits, so the row does not change with the window or the zoom. The samples are four.
 */
export const SHOWN_SUBJECTS = 4;

/**
 * The subjects in the row and the rest, both in their order. The one on the page is always in the
 * row: when it is one of the rest, it takes the last place, so the row keeps its width.
 */
export function splitSubjects<T extends { id: string }>(subjects: T[], current: string, max = SHOWN_SUBJECTS): { shown: T[]; more: T[] } {
  if (subjects.length <= max) return { shown: subjects, more: [] };
  const chosen = subjects.slice(max).find((s) => s.id === current);
  const shown = chosen ? [...subjects.slice(0, max - 1), chosen] : subjects.slice(0, max);
  return { shown, more: subjects.filter((s) => !shown.includes(s)) };
}
