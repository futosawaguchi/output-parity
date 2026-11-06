// The showcase: this app put on a public address for the judges, with the bundled samples only
// (DESIGN 7-2 revised). It is on only when KAWARIME_ACCESS_CODE is set; run on one's own machine,
// nothing here changes. The showcase never runs programs: it has no PHP or Python, and the routes
// that would run them refuse, so no public request can execute anything or write the source.
//
// The caller passes the environment in; this file reads no environment of its own.

export interface Showcase {
  accessCode: string;
}

export const SESSION_COOKIE = "kawarime_session";

/** Shorter codes can be guessed by trying; a judge pastes it, so length costs nothing. */
export const MIN_CODE_LENGTH = 12;

/** Why nothing runs here, for the buttons that would run programs. Fixed wording. */
export const NOT_IN_SHOWCASE = {
  message: "旧と新の実行環境（PHP 7.4・8.5 や Python 3.10・3.12）を入れていません",
  nextStep: "実際に実行するには、ローカル環境で動かしてください（README「全部動かす」）",
};

/** A subject with no bundled run (TCPDF's 65 examples) has nothing to show here. */
export const NOT_BUNDLED_IN_SHOWCASE = {
  message: "この題材は、実行した結果を同梱していません",
  nextStep: "ローカル環境でだけ動く題材です（README「全部動かす」）",
};

/** The showcase, when the environment asks for one. A code too short to keep anyone out is a mistake, not a choice. */
export function readShowcase(env: Record<string, string | undefined>): Showcase | null {
  const accessCode = env.KAWARIME_ACCESS_CODE?.trim();
  if (!accessCode) return null;
  if (accessCode.length < MIN_CODE_LENGTH) {
    throw new Error(`KAWARIME_ACCESS_CODE は ${MIN_CODE_LENGTH} 文字以上にしてください（openssl rand -base64 18 などで作れます）`);
  }
  return { accessCode };
}

/**
 * The cookie value that shows the code was given: an HMAC of a fixed text, keyed by the code. It
 * holds no secret of its own, and changing the code makes every earlier cookie invalid.
 */
export async function sessionValue(accessCode: string): Promise<string> {
  return hmacHex(accessCode, "kawarime-showcase-session-v1");
}

export async function isValidSession(cookie: string | undefined, accessCode: string): Promise<boolean> {
  if (!cookie) return false;
  return sameText(cookie, await sessionValue(accessCode));
}

/** Compared as HMACs of equal length, so the time taken says nothing about how much of the code was right. */
export async function codeMatches(given: string, accessCode: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmacHex(accessCode, given.trim()), hmacHex(accessCode, accessCode)]);
  return sameText(a, b);
}

export type GateDecision = "pass" | "login" | "deny";

/**
 * What the showcase does with one request. The sign-in page, its route and the files the browser
 * needs to draw it are open; everything else needs the cookie. A page without it goes to the
 * sign-in page; an API call without it is refused (a redirect would hand the page HTML for JSON).
 */
export function gate(pathname: string, signedIn: boolean): GateDecision {
  if (signedIn || isOpen(pathname)) return "pass";
  return pathname.startsWith("/api/") ? "deny" : "login";
}

function isOpen(pathname: string): boolean {
  return pathname === "/login" || pathname === "/api/login" || pathname.startsWith("/_next/") || pathname === "/favicon.ico" || pathname === "/icon.svg";
}

async function hmacHex(key: string, text: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(text));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
