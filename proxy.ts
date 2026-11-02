import { NextResponse, type NextRequest } from "next/server";
import { isLocalHost } from "@/lib/local-host";

/** Every request, pages and API alike, must be addressed to this machine (lib/local-host.ts). */
export function proxy(request: NextRequest) {
  if (isLocalHost(request.headers.get("host"))) return NextResponse.next();
  return NextResponse.json(
    {
      message: "このサーバは、手元のアドレス（127.0.0.1・localhost）で開いたときだけ応答します",
      nextStep: "ブラウザで http://127.0.0.1:3000/check を開いてください",
    },
    { status: 403 },
  );
}
