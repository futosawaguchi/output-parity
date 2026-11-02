import { ConfigError } from "../errors";
import type { Extractor } from "./document";
import { extractPdf } from "./pdf";

/**
 * Output format → adapter. Supporting a new format means adding one adapter file
 * (e.g. text.ts) and one line here; nothing after extraction depends on the format.
 */
const extractors: Record<string, Extractor> = {
  pdf: extractPdf,
};

export function extractorFor(format: string): Extractor {
  const extractor = extractors[format];
  if (!extractor) {
    throw new ConfigError(
      `output.format「${format}」には対応していません`,
      `設定ファイルの output.format を ${Object.keys(extractors).join(" / ")} のどれかにしてください`,
    );
  }
  return extractor;
}
