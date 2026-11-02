import { z } from "zod";

/** What Claude must return when looking for a cause (DESIGN 8「原因特定」). Enforced by structured outputs. */
export const CauseResponseSchema = z.object({
  summary: z.string().describe("原因を1文で。画面の見出しになる"),
  candidates: z
    .array(
      z.object({
        file: z.string().describe("原因のファイル。ソースのディレクトリからの相対パス"),
        line: z.number().int().describe("原因の行番号。read_file で実際に見た番号"),
        code: z.string().describe("その行を一字一句そのまま"),
        change: z.string().describe("旧と新で何が違うのか（言語の仕様・標準関数・ライブラリの版など）。1〜2文"),
        why: z.string().describe("その違いで、入力データのどの値がどう扱われ、出力がどう変わったか。1〜3文"),
        edit: z
          .object({
            file: z.string().describe("書き換えるファイル。ソースのディレクトリからの相対パス"),
            old_text: z.string().describe("書き換える前の文字列。ファイルの中にそのまま1回だけ現れるもの"),
            new_text: z.string().describe("書き換えた後の文字列"),
          })
          .nullable()
          .describe("1か所の書き換えで直せるときだけ。直せないときは null"),
        steps: z.array(z.string()).describe("edit で直せないとき（依存ライブラリの版上げなど）に人がやる手順。edit があるときは空"),
      }),
    )
    .describe("原因の候補。確からしい順。確信が持てないときは複数挙げる"),
});

export type CauseResponse = z.infer<typeof CauseResponseSchema>;
