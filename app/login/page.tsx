import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Brand } from "../check/Brand";
import { readShowcase } from "@/lib/showcase";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

const README = "https://github.com/futosawaguchi/output-parity#readme";

/** The showcase's way in (DESIGN 7-2 revised): what can and cannot be tried here, and why, before the code. */
export default function LoginPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={null}>
        <OnlyInShowcase />
      </Suspense>
      <header className={styles.top}>
        <Brand />
      </header>
      <main className={styles.main}>
        <h1 className={styles.title}>審査用の公開環境</h1>
        <p className={styles.lead}>
          ここは審査のための見本です。このツールは本来、自分のシステムのソースと、旧と新の実行環境（PHP 7.4 と 8.5 など）がある<b>手元</b>
          で使います。ここでは、同梱した架空のサンプルで、画面と Claude の判定を確かめられます。
        </p>

        <section className={styles.section}>
          <h2>ここでできること（Claude はその場で動きます）</h2>
          <ul>
            <li>架空書店・見積書・作業日報の結果を見る（判定と根拠、PDF や画面の左右の比較、Claude に送った全文）</li>
            <li>「同梱の出力を Claude に判定し直させる」</li>
            <li>壊れている入力の詳細で「原因を探す」</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>ここでできないこと</h2>
          <ul>
            <li>
              「実行して判定する」と「当てて確かめる」: この環境には、旧と新の実行環境（PHP 7.4・8.5、Python 3.10・3.12）を入れていないためです。
              当てて確かめた結果は、手元で実行したときの記録で見られます（画面に「同梱の結果です」と出ます）
            </li>
            <li>題材「TCPDF 65本」: 実行した結果を同梱していないため、手元でだけ動きます</li>
          </ul>
          <p className={styles.note}>
            全部を手元で動かす手順は <a href={README}>README</a> の「全部動かす」にあります。
            一度に動かせる作業は1つです。ほかの方が Claude を動かしている間は、終わるまでお待ちください。
          </p>
        </section>

        <LoginForm />
      </main>
    </div>
  );
}

/** On one's own machine there is no code to give: the page goes to the tool itself. */
async function OnlyInShowcase() {
  await connection();
  if (!readShowcase(process.env)) redirect("/check");
  return null;
}
