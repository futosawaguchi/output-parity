/**
 * Header that every state-changing request from our own page must carry. A page on another
 * site cannot add a custom header without a CORS preflight, which this app never allows,
 * so a request without it did not come from our page (a cross-site request forgery).
 */
export const SAME_ORIGIN_HEADER = "x-output-parity";

export function isFromOurPage(request: Request): boolean {
  return request.headers.get(SAME_ORIGIN_HEADER) === "1";
}
