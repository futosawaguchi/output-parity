// What the page is told while a job runs. Kept apart from the pipeline so the page can import it
// without the server-only modules the pipeline uses.

/** The last event of a case each time it has been compared (and judged, when it was): the page fills its square. */
export const CASE_CHECKED = "確かめ終わりました";
