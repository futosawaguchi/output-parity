import { realpath } from "node:fs/promises";
import { relative, sep } from "node:path";
import { insideRoot } from "../safe-path";

// What Claude may read while looking for a cause (DESIGN 7-4e ②). Every path comes from Claude.
// It is checked as written (no climbing out, no hidden name) and again after following links:
// a link inside the source can point anywhere, and a harmless name can point at a key.

/** Never read, whatever the settings say: where keys and passwords usually live. */
export const ALWAYS_HIDDEN: readonly string[] = [
  ".env",
  ".env.*",
  "*.key",
  "*.pem",
  "*.p12",
  "*.pfx",
  "*.jks",
  "*.keystore",
  "id_rsa*",
  "id_dsa*",
  "id_ecdsa*",
  "id_ed25519*",
  ".ssh",
  ".aws",
  ".gnupg",
  ".git",
  ".htpasswd",
  ".netrc",
  ".npmrc",
  "secrets",
  "credentials*",
];

export type ReadScope = {
  /** The source Claude reads: work/<id>/ after a run, the original for a bundled run. */
  root: string;
  /** Folders that links inside `root` may lead to: the original source, whose dependencies are linked into work/. */
  alsoAllow: string[];
  /** The settings' claude.neverRead, on top of ALWAYS_HIDDEN. Patterns relative to the source. */
  neverRead: string[];
};

export type Access = { ok: true; path: string; rel: string } | { ok: false; why: "outside" | "hidden" };

/** Whether Claude may read `path` (relative to the scope's root), and where it is on disk. */
export async function access(scope: ReadScope, path: string): Promise<Access> {
  const target = insideRoot(scope.root, path);
  if (!target) return { ok: false, why: "outside" };
  const rel = toSlashes(relative(scope.root, target));
  const patterns = [...ALWAYS_HIDDEN, ...scope.neverRead];
  if (rel && hiddenBy(rel, patterns)) return { ok: false, why: "hidden" };

  const real = await realpath(target).catch(() => null);
  if (real) {
    const roots = await Promise.all([scope.root, ...scope.alsoAllow].map((r) => realpath(r).catch(() => null)));
    const home = roots.find((r): r is string => r !== null && (real === r || real.startsWith(r + sep)));
    if (!home) return { ok: false, why: "outside" };
    const realRel = toSlashes(relative(home, real));
    if (realRel && hiddenBy(realRel, patterns)) return { ok: false, why: "hidden" };
  }
  return { ok: true, path: target, rel };
}

/** What Claude is told when it may not read something. */
export function refusal(why: "outside" | "hidden", path: string, verb = "読めません"): string {
  return why === "outside" ? `${verb}（ソースのディレクトリの外です）: ${path}` : `${verb}（読ませない範囲です。鍵や設定の claude.neverRead）: ${path}`;
}

/**
 * The first pattern that hides `rel` (a/b/c), or null. Like .gitignore: a pattern without a slash
 * matches a name anywhere (".env" hides every .env and everything under a folder named .env);
 * a pattern with a slash matches from the source's root ("config/local.php", "storage/**").
 * `*` and `?` stay within one name; `**` crosses folders. Case is ignored: on a disk that ignores
 * it (macOS, Windows) server.KEY is the same file as server.key, and must be hidden as well.
 */
export function hiddenBy(rel: string, patterns: readonly string[]): string | null {
  const names = rel.split("/");
  for (const pattern of patterns) {
    const p = pattern.replace(/^\.\//, "").replace(/\/+$/, "");
    if (p === "") continue;
    if (p.includes("/")) {
      if (new RegExp(`^${globToRegex(p)}(/.*)?$`, "i").test(rel)) return pattern;
    } else if (names.some((n) => new RegExp(`^${globToRegex(p)}$`, "i").test(n))) {
      return pattern;
    }
  }
  return null;
}

function globToRegex(glob: string): string {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      out += ".*";
      i++;
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return out;
}

function toSlashes(p: string): string {
  return p.split(sep).join("/");
}
