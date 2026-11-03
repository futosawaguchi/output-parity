// What the page is told while a job runs. Kept apart from the pipeline so the page can import it
// without the server-only modules the pipeline uses.

/**
 * The last event of a case each time it has been compared (and judged, when it was), with its
 * verdict (null while none: Claude is still to judge it, or is not asked). The page colours its square.
 */
export const CASE_CHECKED = "確かめ終わりました";

/** A case being read by Claude: the page marks its square as being judged. */
export const CASE_JUDGING = "Claude が新しい出力の全文を読んで判定しています";
