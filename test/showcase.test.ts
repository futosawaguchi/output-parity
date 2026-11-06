import assert from "node:assert/strict";
import { test } from "node:test";
import { codeMatches, gate, isValidSession, MIN_CODE_LENGTH, readShowcase, sessionValue } from "../lib/showcase";

const CODE = "a-code-long-enough-1234";

test("without an access code, there is no showcase and nothing changes", () => {
  assert.equal(readShowcase({}), null);
  assert.equal(readShowcase({ KAWARIME_ACCESS_CODE: "" }), null);
  assert.equal(readShowcase({ KAWARIME_ACCESS_CODE: "   " }), null);
});

test("an access code turns the showcase on; one too short to keep anyone out stops the server", () => {
  assert.deepEqual(readShowcase({ KAWARIME_ACCESS_CODE: ` ${CODE} ` }), { accessCode: CODE });
  assert.throws(() => readShowcase({ KAWARIME_ACCESS_CODE: "x".repeat(MIN_CODE_LENGTH - 1) }), /KAWARIME_ACCESS_CODE/);
});

test("only the exact code signs in; spaces around a pasted code are forgiven", async () => {
  assert.equal(await codeMatches(CODE, CODE), true);
  assert.equal(await codeMatches(` ${CODE}\n`, CODE), true);
  for (const wrong of ["", CODE.slice(0, -1), `${CODE}x`, CODE.toUpperCase()]) assert.equal(await codeMatches(wrong, CODE), false, wrong);
});

test("the session cookie is valid only for the code that made it", async () => {
  const cookie = await sessionValue(CODE);
  assert.equal(cookie.includes(CODE), false);
  assert.equal(await isValidSession(cookie, CODE), true);
  assert.equal(await isValidSession(cookie, `${CODE}-changed`), false);
  for (const forged of [undefined, "", "abc", cookie.slice(0, -1)]) assert.equal(await isValidSession(forged, CODE), false, String(forged));
});

test("signed in, everything passes", () => {
  for (const path of ["/check", "/api/runs", "/api/rejudge", "/login"]) assert.equal(gate(path, true), "pass", path);
});

test("not signed in: the sign-in page and what draws it are open, other pages go to it, the API refuses", () => {
  for (const path of ["/login", "/api/login", "/_next/static/chunks/a.js", "/favicon.ico", "/icon.svg"]) assert.equal(gate(path, false), "pass", path);
  for (const path of ["/", "/check", "/check/sent/x", "/check/record", "/loginx"]) assert.equal(gate(path, false), "login", path);
  for (const path of ["/api/runs", "/api/rejudge", "/api/cause", "/api/apply", "/api/login/x"]) assert.equal(gate(path, false), "deny", path);
});
