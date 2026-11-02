import { VERDICT_LABEL, type Verdict } from "@/lib/judge/verdict";
import styles from "./check.module.css";

const VERDICT_CLASS: Record<Verdict, string> = {
  harmless: styles.harmless,
  needs_review: styles.review,
  broken: styles.broken,
};

/** The verdict as a coloured label. Colour carries meaning only (DESIGN 5). */
export function Badge({ verdict, small = false }: { verdict: Verdict; small?: boolean }) {
  return <span className={`${styles.badge} ${VERDICT_CLASS[verdict]} ${small ? styles.badgeSmall : ""}`}>{VERDICT_LABEL[verdict]}</span>;
}
