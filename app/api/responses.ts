import type { JobState } from "@/lib/jobs";

// Responses shared by the routes that start a job. Fixed wording, nothing from the SDK or the system.

export const NO_KEY = { message: "API キーが設定されていません", nextStep: ".env の ANTHROPIC_API_KEY を設定して、npm run dev を起動し直してください" };
export const NO_BUNDLE = { message: "同梱の結果がありません", nextStep: "npm run bundle で作ってください" };

export function notFromOurPage(): Response {
  return Response.json({ message: "この画面以外からの実行は受け付けません", nextStep: "画面のボタンから実行してください" }, { status: 403 });
}

/**
 * 409 while a job runs. The page follows it when it is about the same subject; a job of another
 * subject is only named, so its report never appears under this subject.
 */
export function alreadyRunning(running: JobState, subjectId: string): Response {
  if (running.subjectId !== subjectId) return Response.json(busyWithAnother(running.subjectId), { status: 409 });
  return Response.json({ message: "すでに実行中です", nextStep: "終わるまで待ってください", jobId: running.jobId }, { status: 409 });
}

/** Why nothing can start while a job of another subject runs: the programs and work/ are shared. */
export function busyWithAnother(runningSubjectId: string): { message: string; nextStep: string } {
  return { message: `別の題材「${runningSubjectId}」を実行中です（一度に動かせるのは1つです）`, nextStep: "終わるまで待ってから、画面を読み込み直してください" };
}
