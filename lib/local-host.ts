// The app listens on 127.0.0.1 only, but that alone does not keep other sites out. A page on
// another site can make its own name resolve to 127.0.0.1 (DNS rebinding) and then call this server
// as if it were its own; the browser still sends that other name in the Host header. So a request
// is served only when it was addressed to this machine by a local name.

const LOCAL_NAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** True when a Host header names this machine (any port). */
export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.toLowerCase().replace(/:\d+$/, "");
  return LOCAL_NAMES.has(name);
}
