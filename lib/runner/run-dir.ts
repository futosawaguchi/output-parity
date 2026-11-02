import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Creates a fresh directory under `runsRoot` for one run. Each run gets its own
 * directory so two runs can never overwrite each other's outputs (DESIGN 5, layer 3).
 */
export async function createRunDir(runsRoot: string, now = new Date()): Promise<{ id: string; path: string }> {
  await mkdir(runsRoot, { recursive: true });
  const id = `${localStamp(now)}-${randomBytes(2).toString("hex")}`;
  const path = join(runsRoot, id);
  // Not recursive: fails if the directory already exists instead of sharing it.
  await mkdir(path);
  return { id, path };
}

/** Local time as YYYY-MM-DD_HH-MM-SS, so a directory name reads as when the user ran it. */
function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
