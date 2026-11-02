// Responses shared by the routes that start a job. Fixed wording, nothing from the SDK or the system.

export const NO_KEY = { message: "API キーが設定されていません", nextStep: ".env の ANTHROPIC_API_KEY を設定して、npm run dev を起動し直してください" };
export const NO_BUNDLE = { message: "同梱の結果がありません", nextStep: "npm run bundle で作ってください" };

export function notFromOurPage(): Response {
  return Response.json({ message: "この画面以外からの実行は受け付けません", nextStep: "画面のボタンから実行してください" }, { status: 403 });
}

export function alreadyRunning(runningJobId: string): Response {
  return Response.json({ message: "すでに実行中です", nextStep: "終わるまで待ってください", jobId: runningJobId }, { status: 409 });
}
