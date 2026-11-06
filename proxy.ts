import { NextResponse, type NextRequest } from "next/server";
import { isLocalHost } from "@/lib/local-host";
import { gate, isValidSession, readShowcase, SESSION_COOKIE } from "@/lib/showcase";

/**
 * On one's own machine, every request, pages and API alike, must be addressed to this machine
 * (lib/local-host.ts). In the showcase the address is public by design, so the access code takes
 * that check's place (lib/showcase.ts).
 */
export async function proxy(request: NextRequest) {
  const showcase = readShowcase(process.env);
  if (showcase) {
    const signedIn = await isValidSession(request.cookies.get(SESSION_COOKIE)?.value, showcase.accessCode);
    const decision = gate(request.nextUrl.pathname, signedIn);
    if (decision === "pass") return NextResponse.next();
    if (decision === "login") return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.json(
      { message: "アクセスコードを入れてから使ってください", nextStep: "/login を開き、審査員向けに渡されたアクセスコードを入れてください" },
      { status: 401 },
    );
  }
  if (isLocalHost(request.headers.get("host"))) return NextResponse.next();
  return NextResponse.json(
    {
      message: "このサーバは、手元のアドレス（127.0.0.1・localhost）で開いたときだけ応答します",
      nextStep: "ブラウザで http://127.0.0.1:3000/check を開いてください",
    },
    { status: 403 },
  );
}
