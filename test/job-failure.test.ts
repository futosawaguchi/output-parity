import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandNotFoundError } from "../lib/errors";
import { describeFailure } from "../lib/job-failure";

const ROOT = "/srv/app";

function fsError(code: string, path: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: mkdir '${path}'`), { code, syscall: "mkdir", path });
}

test("a setup problem keeps its own cause and next step", () => {
  assert.deepEqual(describeFailure(new CommandNotFoundError("PHP 7.4（旧）の実行コマンドが見つかりません", "設定を直してください"), ROOT), {
    message: "PHP 7.4（旧）の実行コマンドが見つかりません",
    nextStep: "設定を直してください",
  });
});

test("a folder of the tool that cannot be written says which folder and why, without the server's path", () => {
  const denied = describeFailure(fsError("EACCES", "/srv/app/runs"), ROOT);
  assert.equal(denied.message, "結果をサーバに保存できませんでした（runs に書き込めません: 権限がありません）");
  assert.match(denied.nextStep, /runs\/ と work\/ に書き込めるように/);
  assert.equal(denied.message.includes(ROOT), false);

  assert.match(describeFailure(fsError("ENOSPC", "/srv/app/runs/sent/a.txt"), ROOT).message, /runs\/sent\/a\.txt に書き込めません: ディスクの空きがありません/);
  assert.match(describeFailure(fsError("EROFS", "/srv/app/work/estimate"), ROOT).message, /work\/estimate に書き込めません: ディスクが読み取り専用です/);
});

test("anything else stays a fixed message, so no system detail reaches the page", () => {
  const unexpected = "予期しないエラーで止まりました";
  for (const e of [
    new Error("something broke"),
    "not an error",
    fsError("EACCES", "/etc/secret"),
    fsError("EACCES", "/srv/app/samples/estimate/app.php"),
    fsError("EACCES", "/srv/app/runsx"),
    fsError("ENOENT", "/srv/app/runs"),
  ]) {
    assert.equal(describeFailure(e, ROOT).message, unexpected, String(e));
  }
});
