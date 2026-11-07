import { ConfigError } from "../errors";
import type { Extractor } from "./document";
import { extractHtml } from "./html";
import { extractPdf } from "./pdf";
import { extractText } from "./text";

export type Adapter = {
  extract: Extractor;
  /** How the extracted lines relate to the original output. Shown to the judge as is. */
  description: string;
};

/** What an adapter is chosen by: the settings' output.format, and the encoding for text formats. */
export type OutputKind = { format: string; encoding?: string };

export const DEFAULT_ENCODING = "utf-8";

/**
 * Output format → adapter. Supporting a new format means adding one adapter file
 * (e.g. text.ts) and one entry here; nothing after extraction depends on the format.
 */
const adapters: Record<string, (encoding: string) => Adapter> = {
  pdf: () => ({
    extract: extractPdf,
    description:
      "PDF から取り出したテキスト。先頭の「file」で始まる行は、ファイルの %PDF- の前と %%EOF のうしろに余分な文字（混ざった警告など）があるか。" +
      "続いて文書のメタデータ（meta・xmp・id で始まる行）、" +
      "続いてページごとに「--- page N ---」の行と本文の行が上から順に並ぶ。" +
      "文字の位置（座標）は捨てているので、同じ高さにある文字は1行にまとめてある。" +
      "「form」で始まる行はフォームの欄（AcroForm）の名前と値で、選ぶ欄には（選択肢 …）として選べる選択肢を並べてある。" +
      "各ページの最後の「layout」で始まる行は、文字以外の見た目（用紙の大きさ・画像の数・文字のはみ出し）を表す。",
  }),
  text: (encoding) => ({
    extract: (path) => extractText(path, encoding),
    description: `テキストの出力（ログ・CSV・標準出力など）を、文字コード ${encoding} で読んで行ごとに並べたもの。行の中身には手を加えていない。最後の「layout」で始まる行はツールが付けた行で、改行コード・先頭の BOM・最後の改行の有無を表す。`,
  }),
  html: (encoding) => ({
    extract: (path) => extractHtml(path, encoding),
    description:
      "HTML の画面の文字を上から順に行にしたもの（隠された要素の中の文字も含む）。段落や見出しなどのまとまりごとに1行、" +
      "表は1つの行（tr）を1行にしてセルを「 | 」で区切る。「[input …]」「[select …]」「[textarea …]」「[checkbox …]」の形の部分はフォームの値（hidden を含む。select は選ばれている選択肢の文字と、（選択肢 …）として選べる選択肢の文字）。" +
      "「title:」で始まる行はページの題名。最後の「layout」で始まる行はツールが付けた行で、画像（img）の数を表す。script・style は除いてあり、色や配置などの見た目と、リンク先・選択肢の value・押せるかどうか（disabled）などの属性は見ていない。",
  }),
};

export const OUTPUT_FORMATS = Object.keys(adapters);

export function adapterFor(output: OutputKind): Adapter {
  const make = adapters[output.format];
  if (!make) {
    throw new ConfigError(
      `output.format「${output.format}」には対応していません`,
      `設定ファイルの output.format を ${OUTPUT_FORMATS.join(" / ")} のどれかにしてください`,
    );
  }
  return make(output.encoding ?? DEFAULT_ENCODING);
}

/** The adapter for each case, by its id. */
export type AdapterOf = (caseId: string) => Adapter;

/**
 * One adapter per case: the case's own output kind when it has one (a CSV export among the pages
 * of a web app), the default otherwise. Every kind is checked here, so a format no adapter reads
 * stops the run before anything runs, not halfway through.
 */
export function adaptersFor(fallback: OutputKind, cases: { id: string; output?: OutputKind }[]): AdapterOf {
  const base = adapterFor(fallback);
  const own = new Map(cases.flatMap((c) => (c.output ? [[c.id, adapterFor(c.output)] as const] : [])));
  return (caseId) => own.get(caseId) ?? base;
}

/** The adapters for a subject's settings (cases already expanded from caseGroups). */
export function adaptersForConfig(config: { output: OutputKind; cases: { id: string; output?: OutputKind }[] }): AdapterOf {
  return adaptersFor(config.output, config.cases);
}

/** The adapters a saved report was read with, to compare and judge its outputs again. */
export function adaptersForReport(report: { outputFormat: string; outputEncoding?: string; cases: { caseId: string; output?: OutputKind }[] }): AdapterOf {
  return adaptersFor({ format: report.outputFormat, encoding: report.outputEncoding }, report.cases.map((c) => ({ id: c.caseId, output: c.output })));
}
