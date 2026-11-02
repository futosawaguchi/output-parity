import { copyFile, mkdir, readdir, realpath, rm, symlink } from "node:fs/promises";
import { join, sep } from "node:path";
import { insideRoot } from "./safe-path";

// work/: the copy of the program that the tool runs and may change (DESIGN 7-4). The original
// under samples/ is never written to, so a demo can be repeated by copying it again.

/** Dependencies are linked, not copied: they are large and the tool never changes them. */
const DEPENDENCY_DIRS = new Set(["vendor", "node_modules"]);

/** Replaces `work` with a fresh copy of `source`. */
export async function prepareWorkspace(source: string, work: string): Promise<void> {
  await rm(work, { recursive: true, force: true });
  await copyTree(source, work);
}

async function copyTree(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory() && DEPENDENCY_DIRS.has(entry.name)) await symlink(src, dest, "dir");
    else if (entry.isDirectory()) await copyTree(src, dest);
    else if (entry.isFile()) await copyFile(src, dest);
  }
}

/**
 * The real path of an existing file inside `work` that may be written to, or null.
 * The file name comes from Claude's answer, so it is data, not an instruction: it is checked
 * both as written (no climbing out) and after following links (no writing through the linked
 * dependencies into the original). Reading may follow those links; writing may not.
 */
export async function writableFile(work: string, file: string): Promise<string | null> {
  const target = insideRoot(work, file);
  if (!target) return null;
  const [real, realWork] = await Promise.all([realpath(target).catch(() => null), realpath(work).catch(() => null)]);
  return real && realWork && real.startsWith(realWork + sep) ? real : null;
}
