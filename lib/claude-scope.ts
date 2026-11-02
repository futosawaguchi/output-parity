import type { ParityConfig, SendScope } from "./config";

// What each use of Claude sends, against what the settings allow (DESIGN 7-4e ①). Checked by every
// entry point before a client is created, and shown on the page before anything is pressed.

export type ClaudeTask = "judge" | "cause";

/** The lowest setting that allows each task. */
const NEEDS: Record<ClaudeTask, SendScope> = { judge: "output", cause: "output-and-source" };
const ORDER: readonly SendScope[] = ["none", "output", "output-and-source"];

export function allows(config: Pick<ParityConfig, "claude">, task: ClaudeTask): boolean {
  return ORDER.indexOf(config.claude.send) >= ORDER.indexOf(NEEDS[task]);
}

/** Why `task` may not send anything for this subject, or null when it may. */
export function whyNotSending(config: Pick<ParityConfig, "claude">, task: ClaudeTask): { message: string; nextStep: string } | null {
  if (allows(config, task)) return null;
  if (task === "judge") {
    return {
      message: "この題材は Claude に何も送らない設定です（claude.send が none）。比べて、機械で決まるものだけ判定します",
      nextStep: "Claude に判定させるには、設定の claude.send を output にしてください（送るのは出力だけです）",
    };
  }
  return {
    message: `この題材はソースを Claude に送らない設定です（claude.send が ${config.claude.send}）。原因探しはソースを読ませるので使えません`,
    nextStep: "原因探しを使うには、設定の claude.send を output-and-source にしてください（Claude が選んだソースのファイルを送ります）",
  };
}

/** What will be sent, in one line per task, for the page to show before anything is pressed. */
export function describeScope(config: Pick<ParityConfig, "claude">): string[] {
  switch (config.claude.send) {
    case "none":
      return ["Claude には何も送りません（比べるだけ）"];
    case "output":
      return ["判定: 新しい出力の全文・変わった行（旧の側も）・レイアウトの数値・環境名と終了コード", "原因探し: 送りません（ソースは送らない設定）"];
    case "output-and-source":
      return [
        "判定: 新しい出力の全文・変わった行（旧の側も）・レイアウトの数値・環境名と終了コード",
        "原因探し: 判定・変わった行・実行のしかた・標準エラー出力の先頭と、Claude が選んで読んだソースと入力データ",
        `読ませないもの: .env・鍵・証明書・.git など（いつも）${config.claude.neverRead.length > 0 ? `と、設定の claude.neverRead（${config.claude.neverRead.join("・")}）` : ""}`,
      ];
  }
}
