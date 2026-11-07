// PreToolUse hook (Bash): stops a git commit while an Anthropic API key could go into it.
// A key committed once has leaked, even if the history is rewritten later, so this is checked
// by a machine before every commit instead of relying on someone remembering to.
import { spawnSync } from "node:child_process";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const command = JSON.parse(input).tool_input?.command ?? "";
if (!/\bgit\b.*\bcommit\b/s.test(command)) process.exit(0);

// Split so that this file, once published, does not match its own search.
const pattern = "sk-" + "ant";
const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// --cached: what is staged now. --untracked: tracked and new files in the working tree, for
// "git add . && git commit" and "git commit -a", which stage after this hook has run.
const found = new Set();
for (const scope of ["--cached", "--untracked"]) {
  const r = spawnSync("git", ["grep", "-l", "-i", scope, "-e", pattern], { cwd, encoding: "utf8" });
  if (r.status === 0) r.stdout.split("\n").filter(Boolean).forEach((f) => found.add(f));
  else if (r.status !== 1) {
    process.stderr.write(`鍵の確認ができませんでした（git grep が終了コード ${r.status}）。コミットせずに git grep を手で実行して確かめてください\n`);
    process.exit(2);
  }
}
if (found.size === 0) process.exit(0);

process.stderr.write(
  `コミットを止めました: API キーらしい文字列がコミットされうるファイルにあります: ${[...found].join("、")}\n` +
    "→ キーは .env に移し、該当の行を消してから、もう一度コミットしてください\n",
);
process.exit(2);
