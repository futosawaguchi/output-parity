import { connection } from "next/server";
import { Suspense } from "react";
import { buildRecordDoc, reportForRecord } from "@/lib/record/build";
import { subjectIdOf } from "@/lib/subject";
import { DocHeader } from "../DocHeader";
import { RecordView } from "../RecordView";
import styles from "../doc.module.css";

/**
 * The record of what was checked (DESIGN 4-5) to read, for the report the tool showed: a finished
 * job's (?job=) or the bundled run (?from=). The same record is saved as Markdown by /api/record.
 */
export default function RecordPage({ searchParams }: PageProps<"/check/record">) {
  return (
    <main className={styles.page}>
      <Suspense fallback={<p className={styles.muted}>記録を作っています…</p>}>
        <Record searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Record({ searchParams }: Pick<PageProps<"/check/record">, "searchParams">) {
  await connection();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const subjectId = subjectIdOf(one(params.subject));
  const which = { from: one(params.from), job: one(params.job) };
  const root = process.cwd();
  const report = await reportForRecord(root, subjectId, which);
  if (!report) {
    return (
      <>
        <DocHeader subjectId={subjectId} kind="確かめた記録" />
        <div className={styles.problem}>
          <p>記録を作る結果が見つかりません</p>
          <p className={styles.muted}>→ 道具の画面を読み込み直してください。サーバを起動し直した場合は npm run record で runs/ から作れます</p>
        </div>
      </>
    );
  }
  const query = new URLSearchParams({ subject: subjectId, ...(which.from ? { from: which.from } : { job: which.job ?? "" }) });
  return (
    <>
      <DocHeader subjectId={subjectId} kind="確かめた記録" />
      <p className={styles.actions}>
        <a className={styles.action} href={`/api/record?${query}`} download>
          Markdown で保存
        </a>
        <span className={styles.muted}>保存したファイルは、この画面と同じ中身です</span>
      </p>
      <RecordView doc={await buildRecordDoc(report, root)} />
    </>
  );
}
