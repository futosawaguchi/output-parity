import { access, constants, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ParityConfig } from "../config";
import { CommandNotFoundError, ConfigError } from "../errors";

/**
 * Checks the user's setup before anything runs, so a missing interpreter (or a missing folder of
 * outputs) is reported once with its path instead of showing up as a failure on every case.
 * `root` is where the programs run from: work/<id>/, or the source itself.
 */
export async function preflight(config: ParityConfig, root: string): Promise<void> {
  const run = config.run;
  if (run.type === "files") {
    const dirs = [run.sides.old.dir, run.sides.new.dir, ...(run.baselineDir ? [run.baselineDir] : [])];
    for (const dir of dirs) {
      if (!(await stat(dir).catch(() => null))?.isDirectory()) {
        throw new ConfigError(`出力のフォルダがありません: ${dir}`, "設定ファイルの run.old・run.new・run.baseline の dir を確認してください（設定ファイルからの相対パス）");
      }
    }
    return;
  }
  const cwd = join(root, run.cwd);
  const dir = await stat(cwd).catch(() => null);
  if (!dir?.isDirectory()) {
    throw new ConfigError(`実行するディレクトリがありません: ${cwd}`, "パスを確認してください");
  }
  for (const [side, env] of Object.entries(run.environments)) {
    try {
      await access(env.command, constants.X_OK);
    } catch {
      // The path itself is not shown: in a bundled sample it is the author's machine, which means nothing to the reader.
      throw new CommandNotFoundError(
        `${env.label}（${side === "old" ? "旧" : "新"}）の実行コマンドが見つからないか、実行できません`,
        `設定ファイルの run.environments.${side}.command に、このパソコンでの ${env.label} のフルパスを書いてください`,
      );
    }
  }
  // After the interpreters: without PHP, that is the first thing to fix, not composer.
  for (const need of run.needs) {
    if (!(await stat(join(root, need)).catch(() => null))) {
      throw new ConfigError(
        `実行に要るものがありません: ${join(root, need)}（設定の run.needs）`,
        "依存を取得してから実行してください（composer install など。手順は guide/setup.md）",
      );
    }
  }
  // The original is what every request starts from (runner/web.ts); it is read from the source, never from work/.
  if (run.type === "web" && run.database !== null) {
    const original = join(config.source, run.database);
    if (!(await stat(original).catch(() => null))?.isFile()) {
      throw new ConfigError(`DB のファイルがありません: ${original}（設定の run.database）`, "設定の run.database.file を、source からの相対パスで確かめてください");
    }
  }
}
