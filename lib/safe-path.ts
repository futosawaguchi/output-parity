import { resolve, sep } from "node:path";

/**
 * Joins `parts` under `root` and returns null if the result would leave `root`.
 * Every path built from values that came from the browser goes through this.
 */
export function insideRoot(root: string, ...parts: string[]): string | null {
  const base = resolve(root);
  const target = resolve(base, ...parts);
  return target === base || target.startsWith(base + sep) ? target : null;
}
