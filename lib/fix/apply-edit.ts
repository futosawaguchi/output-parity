import { writeFile } from "node:fs/promises";
import { writableFile } from "../workspace";
import { readSourceText } from "./source-text";

/** One proposed change: replace `oldText` with `newText` in `file` (relative to work/). */
export type Edit = { file: string; oldText: string; newText: string };

export type ApplyResult =
  | { kind: "applied"; file: string; line: number }
  | { kind: "refused"; message: string; nextStep: string };

/**
 * Writes one edit into work/, only when it can be applied exactly as proposed (DESIGN 7-4).
 * This is the tool writing, not Claude: Claude only returned text. Anything that does not match
 * is refused with the reason, never written half-way and never reported as applied.
 */
export async function applyEdit(work: string, edit: Edit): Promise<ApplyResult> {
  const path = await writableFile(work, edit.file);
  if (!path) {
    return refused(`書き換え先が work/ の中のファイルではありません: ${edit.file}`, "原因をもう一度探してください（依存ライブラリと work/ の外は書き換えません）");
  }
  const text = await readSourceText(path);
  if (text === null) return refused(`${edit.file} が読めません`, "「実行して判定する」で work/ を作り直してから、原因をもう一度探してください");
  if (text === "notUtf8") {
    return refused(`${edit.file} は UTF-8 ではない文字コード（Shift_JIS など）で書かれているので、書き換えません（日本語が壊れるため）`, "示された直し方を見て、元のソースを手で直してください");
  }
  const at = text.indexOf(edit.oldText);
  if (edit.oldText === "" || at === -1) {
    return refused(`書き換える前の文が ${edit.file} に見つかりません`, "ファイルが変わっている可能性があります。「実行して判定する」で work/ を作り直してから、原因をもう一度探してください");
  }
  if (text.indexOf(edit.oldText, at + 1) !== -1) {
    return refused(`書き換える前の文が ${edit.file} に2か所以上あり、どこを直すか決められません`, "原因をもう一度探してください");
  }
  await writeFile(path, text.slice(0, at) + edit.newText + text.slice(at + edit.oldText.length));
  return { kind: "applied", file: edit.file, line: text.slice(0, at).split("\n").length };
}

function refused(message: string, nextStep: string): ApplyResult {
  return { kind: "refused", message, nextStep };
}
