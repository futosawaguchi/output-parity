import assert from "node:assert/strict";
import { test } from "node:test";
import { isLocalHost } from "../lib/local-host";

test("local names are served on any port", () => {
  for (const host of ["127.0.0.1:3000", "localhost:3000", "LOCALHOST", "[::1]:3000", "127.0.0.1"]) assert.equal(isLocalHost(host), true, host);
});

test("any other name is refused, even one that resolves to this machine", () => {
  for (const host of ["evil.example:3000", "127.0.0.1.evil.example", "localhost.evil.example:3000", "192.168.0.5:3000", "", null]) {
    assert.equal(isLocalHost(host), false, String(host));
  }
});
