import { copyFile, mkdir, readdir, readlink, realpath, rm, symlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { insideRoot } from "./safe-path";

// work/: the copy of the program that the tool runs and may change (DESIGN 7-4). The original
// source is never written to, so a demo can be repeated by copying it again.

/**
 * Replaces `work` with a fresh copy of `source`. Directories named in `link` (dependencies such
 * as vendor/) are linked, not copied: they are large and the tool never changes them.
 */
export async function prepareWorkspace(source: string, work: string, link: readonly string[]): Promise<void> {
  await rm(work, { recursive: true, force: true });
  await copyTree(source, work, new Set(link), { source: resolve(source), work: resolve(work) });
}

type Roots = { source: string; work: string };

async function copyTree(from: string, to: string, link: ReadonlySet<string>, roots: Roots): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory() && link.has(entry.name)) await symlink(src, dest, "dir");
    else if (entry.isDirectory()) await copyTree(src, dest, link, roots);
    else if (entry.isFile()) await copyFile(src, dest);
    else if (entry.isSymbolicLink()) await symlink(await linkTarget(src, roots), dest);
  }
}

/**
 * Where a link in the source points to, for the same link in work/. A link is part of the program
 * (config.php -> config.local.php), so it is not dropped. A target inside the source points to its
 * copy in work/; a target outside it points to the same place as before. writableFile follows
 * links, so the original stays out of reach for writing either way.
 */
async function linkTarget(src: string, roots: Roots): Promise<string> {
  const target = resolve(dirname(src), await readlink(src));
  const inside = relative(roots.source, target);
  const outside = inside === ".." || inside.startsWith(".." + sep) || isAbsolute(inside);
  return outside ? target : join(roots.work, inside);
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
