import { codeMatches, readShowcase, sessionValue, SESSION_COOKIE } from "@/lib/showcase";
import { isFromOurPage } from "@/lib/same-origin";
import { notFromOurPage } from "../responses";

// Reads KAWARIME_ACCESS_CODE (the showcase's code), never the API key.

/** A wrong code waits this long before the answer, so trying codes one after another is slow. */
const WRONG_CODE_DELAY_MS = 1000;

const COOKIE_DAYS = 14;

/** Signs in to the showcase. Body: { code }. 204 with the session cookie, 401 for a wrong code. */
export async function POST(request: Request): Promise<Response> {
  const showcase = readShowcase(process.env);
  if (!showcase) {
    return Response.json({ message: "この環境ではアクセスコードは要りません", nextStep: "/check を開いてください" }, { status: 404 });
  }
  if (!isFromOurPage(request)) return notFromOurPage();
  const code = ((await request.json().catch(() => ({}))) as { code?: unknown }).code;
  if (typeof code !== "string" || !(await codeMatches(code, showcase.accessCode))) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_CODE_DELAY_MS));
    return Response.json(
      { message: "アクセスコードが違います", nextStep: "提出フォームの審査員向けの欄にあるコードを、そのまま貼り付けてください" },
      { status: 401 },
    );
  }
  const cookie = [
    `${SESSION_COOKIE}=${await sessionValue(showcase.accessCode)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${COOKIE_DAYS * 24 * 60 * 60}`,
  ].join("; ");
  return new Response(null, { status: 204, headers: { "Set-Cookie": cookie } });
}
