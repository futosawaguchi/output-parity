"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SAME_ORIGIN_HEADER } from "@/lib/same-origin";
import styles from "./login.module.css";

type Problem = { message: string; nextStep: string };

/** The access code, sent to /api/login; the cookie it sets is the only thing kept. */
export function LoginForm() {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read from the field, not from state: a code pasted before the page came alive is still there.
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setSending(true);
    setProblem(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", [SAME_ORIGIN_HEADER]: "1" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        router.replace("/check");
        return;
      }
      setProblem(await res.json());
    } catch {
      setProblem({ message: "サーバに接続できません", nextStep: "少し待ってから、もう一度入ってください" });
    }
    setSending(false);
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label} htmlFor="code">
        アクセスコード（提出フォームの審査員向けの欄にあります）
      </label>
      <div className={styles.row}>
        <input
          id="code"
          className={styles.input}
          name="code"
          type="password"
          autoComplete="off"
          required
        />
        <button className={styles.button} type="submit" disabled={sending}>
          {sending ? "確かめています…" : "入る"}
        </button>
      </div>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem.message}
          <br />→ {problem.nextStep}
        </p>
      )}
    </form>
  );
}
