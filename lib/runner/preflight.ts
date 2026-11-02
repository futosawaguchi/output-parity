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
  for (const env of Object.values(run.environments)) {
    try {
      await access(env.command, constants.X_OK);
    } catch {
      throw new CommandNotFoundError(
        `設定された実行コマンドが見つからないか、実行できません: ${env.command}（${env.label}）`,
        "設定ファイルの run.environments の command を確認してください",
      );
    }
  }
}
