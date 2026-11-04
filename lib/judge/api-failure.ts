import Anthropic from "@anthropic-ai/sdk";

/** Why the judge could not answer, worded per DESIGN 7-6 C: the cause plus the next step. */
export type JudgeFailure = { reason: string; nextStep: string; retryable: boolean };

/**
 * Maps an exception from the SDK to a failure the user can act on. `task` names the call in the
 * wording (判定, 原因探し). Classified by type, never by the text of the message (CLAUDE.md).
 * Rethrows anything that is not an API error, because that is a bug in this tool and must not
 * be disguised as "needs review".
 */
export function classifyApiError(e: unknown, task = "判定"): JudgeFailure {
  // Most specific first. In the TypeScript SDK the connection errors are subclasses of APIError.
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return { reason: `${task}が時間内に終わりませんでした`, nextStep: "もう一度実行してください", retryable: true };
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return { reason: "Anthropic に接続できませんでした", nextStep: "ネットワークを確認して、もう一度実行してください", retryable: true };
  }
  if (e instanceof Anthropic.AuthenticationError) {
    return { reason: "API キーが拒否されました", nextStep: "Console でキーが有効か確認し、.env の ANTHROPIC_API_KEY を直してください", retryable: false };
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return { reason: `この API キーでは${task}に使うモデルを呼べません`, nextStep: "Console でキーの権限とワークスペースを確認してください", retryable: false };
  }
  if (e instanceof Anthropic.RateLimitError) {
    const after = e.headers?.get("retry-after");
    return {
      reason: after ? `呼び出しが多すぎます（${after} 秒後に再試行できます）` : "呼び出しが多すぎます",
      nextStep: "少し待ってから、もう一度実行してください",
      retryable: true,
    };
  }
  if (e instanceof Anthropic.InternalServerError) {
    return { reason: "Anthropic 側で一時的な問題が起きています", nextStep: "少し待ってから、もう一度実行してください", retryable: true };
  }
  if (e instanceof Anthropic.APIError) {
    // 402 has no dedicated class; the SDK exposes the API's error type as a typed field.
    if (e.status === 402 || e.type === "billing_error") {
      return { reason: "API の残高が足りません", nextStep: "Console で組織のクレジット残高を確認してください", retryable: false };
    }
    return {
      reason: `${task}の呼び出しが受け付けられませんでした（HTTP ${e.status ?? "不明"}）`,
      nextStep: "このツールの不具合の可能性があります。runs/ の記録を添えて報告してください",
      retryable: false,
    };
  }
  throw e;
}
