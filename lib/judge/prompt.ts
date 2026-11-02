import type { Change } from "../compare/baseline";
import type { PageLayout } from "../compare/document";

// DESIGN 7-9: nothing in here may be specific to one kind of document. When a sample is
// judged wrongly, the fix is to give Claude more of the output, never to add a rule here.
// DESIGN 8-4: the samples are never shown here as examples.

export const SYSTEM_PROMPT = `あなたは、プログラムの実行環境を移行したとき（言語やライブラリの版上げなど）に、同じ入力から作られた出力の違いを判定する担当です。
移行前の環境（旧）と移行後の環境（新）で同じプログラムを同じ入力で動かし、出力を比べた結果が渡されます。
変更のそれぞれについて、次の3段のどれかで判定してください。

- broken（壊れている）: 新しい出力がそれ自体の中で矛盾している、または読む人の判断が確実に変わる
- needs_review（要確認）: 読む人の判断が変わるかどうかが、この出力だけでは決められない
- harmless（無害）: 読む人の判断に関係しないと言い切れる

判断の原則:
- 変わった行だけを見ないでください。新しい出力の全文を読み、変わった部分が文書の他の部分と矛盾しないかを確かめてください。変わっていない行も判断の材料です。
- 差の大きさ・行数・文字数は、重要度と関係がありません。無害な差のほうが、壊れている差より大きいことはよくあります。1文字の違いが致命的で、100行の違いが無害なこともあります。
- 何の出力なのかは、出力そのものから読み取ってください。
- 迷ったら needs_review にしてください。壊れているものを harmless と言うのが最悪の誤りです。根拠なく broken と言うのも、道具が信用を失うので避けてください。

返し方:
- すべての変更 ID（C1, C2, ...）を、どれかの項目の change_ids に必ず含めてください。同じ意味の変更は1項目にまとめて構いません。
- evidence には、出力の該当行を一字一句そのまま引用してください（記号「-」「+」や ID は付けない）。
- 数を使って判断したときは、calculation に式を書いてください（例:「a + b = c ≠ d（差 e）」の形）。数を使っていなければ null にしてください。
- 「毎回変わる値として除外した行」は判定の対象外です。ただし、除外が誤っている（本当の違いを隠している）と考えた場合は、change_ids を空にして needs_review の項目として指摘してください。
- 文章は日本語で、短く書いてください。人が数秒で確かめられることを目指してください。`;

export type JudgeInput = {
  oldLabel: string;
  newLabel: string;
  outputDescription: string;
  oldExit: string;
  newExit: string;
  oldLines: string[];
  newLines: string[];
  /** Changes the baseline did not explain, in document order. They get the IDs C1, C2, ... */
  kept: Change[];
  /** Changes the baseline explained (values that differ on every run). Shown, not judged. */
  dropped: Change[];
  oldPages: PageLayout[];
  newPages: PageLayout[];
  unreadable: string[];
};

export function changeId(index: number): string {
  return `C${index + 1}`;
}

export function buildUserMessage(input: JudgeInput): string {
  const sections = [
    `## 環境\n旧: ${input.oldLabel}（${input.oldExit}）\n新: ${input.newLabel}（${input.newExit}）`,
    `## 出力の形式\n${input.outputDescription}`,
    `## 新しい出力の全文（変更の印つき）\n` +
      `行頭の記号: 「  」旧と新で同じ行／「-」旧にだけある行／「+」新にだけある行。\n` +
      `[C1] などは判定してほしい変更の ID、[除外] は毎回変わる値として除外した変更。\n\n` +
      renderMarked(input),
    `## 判定してほしい変更\n${input.kept.map((c, i) => `${changeId(i)}: ${describeChange(c)}`).join("\n")}`,
    `## 毎回変わる値として除外した行（参考。同じ環境で2回動かして違った行）\n` +
      (input.dropped.length === 0 ? "なし" : input.dropped.flatMap((c) => c.newLines.map((l) => `- ${l}`)).join("\n")),
    `## レイアウト（座標から求めた値。pt）\n${renderLayout(input.oldPages, input.newPages)}`,
  ];
  if (input.unreadable.length > 0) {
    sections.push(`## テキストにできなかった部分\n${input.unreadable.map((u) => `- ${u}`).join("\n")}`);
  }
  return sections.join("\n\n");
}

/** The whole new document, with the old side of each change shown where it used to be. */
export function renderMarked(input: Pick<JudgeInput, "newLines" | "kept" | "dropped">): string {
  const tagged = [
    ...input.kept.map((change, i) => ({ change, tag: `[${changeId(i)}] ` })),
    ...input.dropped.map((change) => ({ change, tag: "[除外] " })),
  ].sort((a, b) => a.change.newStart - b.change.newStart || a.change.oldStart - b.change.oldStart);

  const out: string[] = [];
  let next = 0;
  let j = 0;
  while (j <= input.newLines.length) {
    while (next < tagged.length && tagged[next].change.newStart === j) {
      const { change, tag } = tagged[next++];
      for (const line of change.oldLines) out.push(`- ${tag}${line}`);
      for (const line of change.newLines) out.push(`+ ${tag}${line}`);
      j += change.newLines.length;
    }
    if (j < input.newLines.length) out.push(`  ${input.newLines[j]}`);
    j++;
  }
  return out.join("\n");
}

function describeChange(c: Change): string {
  if (c.newLines.length === 0) return `旧にあった ${c.oldLines.length} 行が、新では無い`;
  if (c.oldLines.length === 0) return `新に ${c.newLines.length} 行が増えた`;
  return `旧の ${c.oldLines.length} 行が、新では ${c.newLines.length} 行に変わった`;
}

function renderLayout(oldPages: PageLayout[], newPages: PageLayout[]): string {
  if (oldPages.length === 0 && newPages.length === 0) return "なし（ページの無い形式）";
  const lines = [`ページ数: 旧 ${oldPages.length} / 新 ${newPages.length}`];
  for (let i = 0; i < Math.max(oldPages.length, newPages.length); i++) {
    const o = oldPages[i];
    const n = newPages[i];
    const fmt = (p?: PageLayout) =>
      p ? `文字数 ${p.charCount}・本文の右端 ${p.textRight}・下端 ${p.textBottom}（用紙 ${p.width}×${p.height}）` : "ページ無し";
    lines.push(`page ${i + 1}: 旧 ${fmt(o)} / 新 ${fmt(n)}`);
  }
  return lines.join("\n");
}
