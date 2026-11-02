/**
 * What every output becomes before comparison: plain lines in reading order.
 * Only the adapters (one file per output format) know how to produce this.
 */
export type ExtractedDocument = {
  /** Metadata lines first, then each page as a marker line followed by its text lines. */
  lines: string[];
  /** Layout facts kept before coordinates are thrown away (DESIGN 4-2). Empty for formats without pages. */
  pages: PageLayout[];
  /** Parts that could not be turned into text, e.g. images. Reported, never silently skipped. */
  unreadable: string[];
};

export type PageLayout = {
  page: number;
  width: number;
  height: number;
  /** Number of non-whitespace characters on the page. */
  charCount: number;
  /** Rightmost edge of any text, in points from the left edge. */
  textRight: number;
  /** Lowest text baseline, in points from the top edge. */
  textBottom: number;
};

export type Extractor = (path: string) => Promise<ExtractedDocument>;

/** Thrown when an output exists but cannot be read. The comparison records it as a result. */
export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}
