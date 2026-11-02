import { z } from "zod";

/** What Claude must return (DESIGN 8-3). Enforced by structured outputs; no confidence score on purpose. */
export const JudgeResponseSchema = z.object({
  summary: z.string().describe("一覧全体を1文で。画面の見出しになる"),
  findings: z.array(
    z.object({
      change_ids: z.array(z.string()).describe("この項目が扱う変更の ID（C1 など）。変更に結びつかない指摘なら空"),
      verdict: z.enum(["harmless", "needs_review", "broken"]),
      what: z.string().describe("何が変わったか（1文）"),
      why: z.string().describe("なぜその判定なのか（1〜2文）"),
      evidence: z.array(z.string()).describe("根拠。出力の該当行を一字一句そのまま引用する"),
      calculation: z.string().nullable().describe("数を使って判断したときの式。使っていなければ null"),
      check_here: z.string().describe("人が確かめるべき場所"),
    }),
  ),
});

export type JudgeResponse = z.infer<typeof JudgeResponseSchema>;
