import type { SentRecord } from "@/lib/sent-log";
import styles from "./check.module.css";
import { sentUrl } from "./urls";

/** What was sent to Claude for one result, with a link to the text exactly as sent (DESIGN 7-4e ④). */
export function SentLine({ sent, subjectId }: { sent: SentRecord; subjectId: string }) {
  return (
    <p className={styles.sentLine}>
      Claude に送ったもの: {sent.chars.toLocaleString()} 字
      {sent.masked > 0 ? `（${sent.maskedKinds.join("・")} を ${sent.masked} か所 *** にして送った）` : "（*** にした値はなし）"}{" "}
      <a href={sentUrl(subjectId, sent.file)} target="_blank" rel="noreferrer">
        送った全文を見る
      </a>
    </p>
  );
}
