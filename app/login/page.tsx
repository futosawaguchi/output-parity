import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Brand } from "../check/Brand";
import { ShowcaseScope } from "../check/ShowcaseScope";
import frame from "../check/check.module.css";
import { readShowcase } from "@/lib/showcase";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

/** The showcase's way in (DESIGN 7-2 revised): what can and cannot be tried here, and why, before the code. */
export default function LoginPage() {
  return (
    // The same frame as /check (the name top left, the line under it), so the page before signing in and after look alike.
    <div className={frame.page}>
      <Suspense fallback={null}>
        <OnlyInShowcase />
      </Suspense>
      <header className={frame.top}>
        <Brand />
      </header>
      <main className={frame.main}>
        <h1 className={styles.title}>審査用の公開環境（見本）</h1>
        <p className={styles.lead}>
          ここは審査のための見本です。このツールは本来、自分のシステムのソースと旧と新の実行環境がある<b>ローカル環境</b>
          で使います。ここでは、同梱した架空のサンプルで、画面と Claude の判定を確かめられます。
        </p>
        <ShowcaseScope />
        <p className={styles.note}>一度に動かせる作業は1つです。ほかの方が Claude を動かしている間は、終わるまでお待ちください。</p>
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
