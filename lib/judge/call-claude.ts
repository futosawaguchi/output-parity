import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { classifyApiError, type JudgeFailure } from "./api-failure";
import { JudgeResponseSchema, type JudgeResponse } from "./schema";

export const JUDGE_MODEL = "claude-opus-5-5";

export type ClaudeAnswer =
  | { kind: "answered"; response: JudgeResponse; model: string }
  | { kind: "failed"; failure: JudgeFailure };

/**
 * One call judges one whole output pair (DESIGN 8-5 G1). The client is passed in, so this
 * module never reads the API key itself.
 */
export async function askClaude(client: Anthropic, system: string, user: string): Promise<ClaudeAnswer> {
  let message;
  try {
    message = await client.beta.messages.parse(
      {
        model: JUDGE_MODEL,
        max_tokens: 16000,
        // Opus 5.5 always thinks and rejects temperature; effort is the only knob (default medium).
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: betaZodOutputFormat(JudgeResponseSchema) },
        // If a safety classifier declines, retry server-side on the model Anthropic recommends.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content: user }],
      },
      { timeout: 180_000 },
    );
  } catch (e) {
    return { kind: "failed", failure: classifyApiError(e) };
  }

  if (message.stop_reason === "refusal") {
    return {
      kind: "failed",
      failure: { reason: "Claude が判定を断りました", nextStep: "もう一度実行してください。続く場合は人が確認してください", retryable: true },
    };
  }
  if (message.stop_reason === "max_tokens") {
    return {
      kind: "failed",
      failure: { reason: "判定が途中で切れました（出力の上限に達しました）", nextStep: "人が確認してください", retryable: false },
    };
  }
  if (!message.parsed_output) {
    return {
      kind: "failed",
      failure: { reason: "判定の返事が決めた形になっていませんでした", nextStep: "もう一度実行してください", retryable: true },
    };
  }
  return { kind: "answered", response: message.parsed_output, model: message.model };
}
