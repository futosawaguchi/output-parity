import { readFile } from "node:fs/promises";
import { basename, dirname, relative, sep } from "node:path";
import type { ParityConfig } from "../config";
import type { CaseReport } from "../pipeline";
import { describeOutcome } from "../runner/outcome";

// The same rule as the judge (DESIGN 7-9): nothing here may be specific to one program, language
// or kind of document, and the samples are never used as examples (DESIGN 8-4). When a cause is
// missed, the fix is to let Claude read more, never to add a hint here.

export const CAUSE_SYSTEM_PROMPT = `あなたは、プログラムの実行環境を移行したとき（言語やライブラリの版上げなど）に出力が変わった原因を、ソースコードから探す担当です。
移行前の環境（旧）と移行後の環境（新）で同じプログラムを同じ入力で動かした結果と、出力の違いについての判定が渡されます。
道具（list_files・read_file・search_text）でプログラムのソースと入力データを読み、原因の箇所を特定してください。

進め方:
- 推測で答えないでください。原因として挙げる行は、必ず read_file で実際に読んでから挙げてください。行番号は read_file が示した番号を使ってください。
- 実行に使われた入力データも読み、どの値がどう扱われて出力が変わったのかで説明してください。
- 旧と新で何が違うのか（言語の仕様・標準関数の挙動・ライブラリの版など）を具体的に書いてください。
- 確信が持てないときは候補を複数挙げ、断定しないでください。

直し方:
- 目標は「新しい環境で、旧環境と同じ出力になる」ことです。新しい環境で動くだけでは足りません。
- 直し方を決める前に、入力データにある値のすべてについて、旧環境と同じ結果になるかを確かめてください。
- 1か所の書き換えで直せるなら edit に書いてください。old_text はファイルの中にそのまま1回だけ現れる文字列にしてください（必要なら前後を含めて一意にする）。
- 書き換えるのはプログラム本体です。依存ライブラリ（vendor/ や node_modules/ の中）は書き換えないでください。
- 依存ライブラリの版上げなど、1か所の書き換えで直せないものは edit を null にし、steps に人がやる手順を具体的に書いてください。

文章は日本語で、短く書いてください。人が数秒で確かめられることを目指してください。`;

/** What the judge found for one case, plus how the programs were run, for Claude to start from. */
export async function buildCauseMessage(c: CaseReport, environments: ParityConfig["environments"], root: string): Promise<string> {
  // Paths in error messages are made relative to the source directory, the way Claude reads files.
  const prefixes = [root + sep, relative(process.cwd(), root) + sep];
  const fromRoot = (text: string) => prefixes.reduce((t, p) => t.split(p).join(""), text);
  const runs = await Promise.all(
    c.runs
      .filter((r) => r.slot !== "baseline")
      .map(async (r) => {
        // The output path is the tool's own (runs/…/<slot>/output.*); a placeholder says more.
        const args = r.args.map((a) => (basename(a).startsWith("output.") && basename(dirname(a)) === r.slot ? "<出力ファイル>" : a));
        const stderr = fromRoot((await readFile(r.stderrPath, "utf8").catch(() => "")).trim().split("\n").slice(0, 5).join("\n"));
        return [
          `${environments[r.env].label}: ${basename(r.command)} ${args.join(" ")} → ${describeOutcome(r.outcome)}`,
          stderr ? `標準エラー出力の先頭:\n${stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      }),
  );

  const sections = [
    `## 環境\n旧: ${environments.old.label}\n新: ${environments.new.label}`,
    `## 実行のしかた（作業ディレクトリはソースのディレクトリ）\n${runs.join("\n\n")}`,
  ];
  if (c.comparison.kind === "compared") {
    const kept = c.comparison.changes.filter((ch) => !ch.explainedByBaseline);
    sections.push(
      `## 出力の違い（旧 → 新）\n` +
        kept.map((ch) => [...ch.oldLines.map((l) => `- ${l}`), ...ch.newLines.map((l) => `+ ${l}`)].join("\n")).join("\n\n"),
    );
  }
  if (c.verdict) {
    sections.push(
      `## 判定\n${c.verdict.summary}\n` +
        c.verdict.findings
          .filter((f) => f.verdict !== "harmless")
          .map((f) => [`- ${f.what}`, `  理由: ${f.why}`, f.calculation ? `  計算: ${f.calculation}` : ""].filter(Boolean).join("\n"))
          .join("\n"),
    );
  }
  return sections.join("\n\n");
}
