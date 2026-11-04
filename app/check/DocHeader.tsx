import { join } from "node:path";
import { loadConfig } from "@/lib/config";
import { CONFIG_FILE, findSubjectDir } from "@/lib/subject";
import { Brand } from "./Brand";
import checkStyles from "./check.module.css";
import styles from "./doc.module.css";

/** The top of a page opened from the tool (the record, what was sent): the same row as the tool's, what this page is, and the way back. */
export async function DocHeader({ subjectId, kind }: { subjectId: string; kind: string }) {
  const name = await shortNameOf(process.cwd(), subjectId);
  return (
    <header className={checkStyles.top}>
      <Brand />
      <p className={styles.where}>
        <span className={styles.kind}>
          {kind}
          {name && `・${name}`}
        </span>
        <a className={styles.back} href={`/check?subject=${encodeURIComponent(subjectId)}`}>
          ← {name ?? "題材"}の画面に戻る
        </a>
      </p>
    </header>
  );
}

/** The subject's short name as the row of subjects shows it; null when its settings cannot be read. */
async function shortNameOf(root: string, subjectId: string): Promise<string | null> {
  const dir = await findSubjectDir(root, subjectId);
  if (!dir) return null;
  const config = await loadConfig(join(dir, CONFIG_FILE)).catch(() => null);
  return config?.shortName ?? null;
}
