import { ConfigError } from "../errors";
import type { Extractor } from "./document";
import { extractPdf } from "./pdf";

export type Adapter = {
  extract: Extractor;
  /** How the extracted lines relate to the original output. Shown to the judge as is. */
  description: string;
};

/**
 * Output format → adapter. Supporting a new format means adding one adapter file
 * (e.g. text.ts) and one line here; nothing after extraction depends on the format.
 */
const adapters: Record<string, Adapter> = {
  pdf: {
    extract: extractPdf,
    description:
      "PDF から取り出したテキスト。先頭に文書のメタデータ（meta・xmp・id で始まる行）、" +
      "続いてページごとに「--- page N ---」の行と本文の行が上から順に並ぶ。" +
      "文字の位置（座標）は捨てているので、同じ高さにある文字は1行にまとめてある。",
  },
};

export function adapterFor(format: string): Adapter {
  const adapter = adapters[format];
  if (!adapter) {
    throw new ConfigError(
      `output.format「${format}」には対応していません`,
      `設定ファイルの output.format を ${Object.keys(adapters).join(" / ")} のどれかにしてください`,
    );
  }
  return adapter;
}
