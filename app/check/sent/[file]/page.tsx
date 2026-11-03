import { join } from "node:path";
import { connection } from "next/server";
import { Suspense } from "react";
import { bundledDir } from "@/lib/bundled";
import { describeSentFile, readSent } from "@/lib/sent-log";
import { subjectIdOf } from "@/lib/subject";
import { DocHeader } from "../../DocHeader";
import styles from "../../doc.module.css";

/** What was sent to Claude for one verdict or one cause, exactly as sent (DESIGN 7-4e ④), to read. */
export default function SentPage({ params, searchParams }: PageProps<"/check/sent/[file]">) {
  return (
    <main className={styles.page}>
      <Suspense fallback={<p className={styles.muted}>読み込んでいます…</p>}>
        <Sent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Sent({ params, searchParams }: Pick<PageProps<"/check/sent/[file]">, "params" | "searchParams">) {
  await connection();
  const { file } = await params;
  const subject = (await searchParams).subject;
  const subjectId = subjectIdOf(typeof subject === "string" ? subject : null);
  const root = process.cwd();
  const bundled = await bundledDir(root, subjectId);
  const text = await readSent([join(root, "runs", "sent"), ...(bundled ? [join(bundled, "sent")] : [])], file);
  const about = describeSentFile(file);
  if (text === null || !about) {
    return (
      <>
        <DocHeader subjectId={subjectId} kind="Claude に送った全文" />
        <div className={styles.problem}>
          <p>送ったものの記録が見つかりません</p>
          <p className={styles.muted}>→ runs/sent/ を消していないか確認してください</p>
        </div>
      </>
    );
  }
  return (
    <>
      <DocHeader subjectId={subjectId} kind="Claude に送った全文" />
      <h1 className={styles.docTitle}>
        {about.purpose === "judge" ? "判定" : "原因探し"}のために送った全文（{about.caseId}）
      </h1>
      <p className={styles.meta}>
        {about.at} に送信・{text.length.toLocaleString("ja-JP")} 字・{file}
      </p>
      <p className={styles.note}>
        Claude に渡った文そのままです。パスワード・鍵・トークンに見える値は、送る前に *** にしてあります。
        {about.purpose === "cause" && "原因探しでは、Claude が自分で選んで読んだファイルの中身も、この下に続きます。"}
      </p>
      <pre className={styles.sentText}>{text}</pre>
      <p className={styles.actions}>
        <a className={styles.action} href={`/api/sent/${encodeURIComponent(file)}?subject=${encodeURIComponent(subjectId)}`}>
          テキストのまま開く
        </a>
      </p>
    </>
  );
}
