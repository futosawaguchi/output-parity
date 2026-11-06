import type { JobState } from "@/lib/jobs";
import { readShowcase } from "@/lib/showcase";

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
  const busy = inShowcase()
    ? { message: "この題材で、いま Claude が動いています（ほかの方の操作かもしれません）", nextStep: "終わると、その結果がこの画面に出ます" }
    : { message: "すでに実行中です", nextStep: "終わるまで待ってください" };
  return Response.json({ ...busy, jobId: running.jobId }, { status: 409 });
}

/** Why nothing can start while a job of another subject runs: the programs and work/ are shared. */
export function busyWithAnother(runningSubjectId: string): { message: string; nextStep: string } {
  // In the showcase it is likely another judge, and the subject's id means nothing to them.
  if (inShowcase()) {
    return { message: "別の題材で、いま Claude が動いています（ほかの方の操作かもしれません。一度に動かせるのは1つです）", nextStep: "終わるまで待ってから、画面を読み込み直してください" };
  }
  return { message: `別の題材「${runningSubjectId}」を実行中です（一度に動かせるのは1つです）`, nextStep: "終わるまで待ってから、画面を読み込み直してください" };
}

function inShowcase(): boolean {
  return readShowcase(process.env) !== null;
}
