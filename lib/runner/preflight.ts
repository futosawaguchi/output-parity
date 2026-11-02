import { access, constants, stat } from "node:fs/promises";
import type { ParityConfig } from "../config";
import { CommandNotFoundError, ConfigError } from "../errors";

/**
 * Checks the user's setup before anything runs, so a missing interpreter is reported
 * once with its path instead of showing up as twelve failed runs.
 */
export async function preflight(config: ParityConfig, cwd: string): Promise<void> {
  const dir = await stat(cwd).catch(() => null);
  if (!dir?.isDirectory()) {
    throw new ConfigError(`実行するディレクトリがありません: ${cwd}`, "パスを確認してください");
  }
  for (const env of Object.values(config.run.environments)) {
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
