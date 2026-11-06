import { isAbsolute, join, relative } from "node:path";
import { SetupError } from "./errors";

/** What a failed job shows: the cause and the next step (DESIGN 7-6). */
export type JobFailure = { message: string; nextStep: string };

/** The folders the tool writes to. A file error inside them is about saving, not about the program under test. */
const OWN_FOLDERS = ["runs", "work"];

const WRITE_PROBLEMS: Record<string, { reason: string; nextStep: string }> = {
  EACCES: {
    reason: "権限がありません",
    nextStep: "アプリを動かしているユーザが、このリポジトリの runs/ と work/ に書き込めるようにしてから、もう一度押してください",
  },
  EPERM: {
    reason: "権限がありません",
    nextStep: "アプリを動かしているユーザが、このリポジトリの runs/ と work/ に書き込めるようにしてから、もう一度押してください",
  },
  ENOSPC: { reason: "ディスクの空きがありません", nextStep: "サーバのディスクの空きを増やしてから、もう一度押してください" },
  EROFS: { reason: "ディスクが読み取り専用です", nextStep: "書き込めるディスクの上でアプリを動かしてください" },
};

/**
 * Why a job stopped. Setup problems carry their own wording; a folder of the tool that cannot be
 * written is told as such; anything else is a bug in this tool and gets a fixed message, so no SDK
 * or system detail reaches the page. `root` is the repository the tool runs from.
 */
export function describeFailure(e: unknown, root: string): JobFailure {
  if (e instanceof SetupError) return { message: e.message, nextStep: e.nextStep };
  const write = ownFolderWriteProblem(e, root);
  if (write) return write;
  return {
    message: "予期しないエラーで止まりました",
    nextStep: "もう一度押してください。続くときは、サーバのログを確かめてください（ローカル環境なら npm run dev のターミナル）",
  };
}

function ownFolderWriteProblem(e: unknown, root: string): JobFailure | null {
  if (!(e instanceof Error)) return null;
  const { code, path } = e as NodeJS.ErrnoException;
  const problem = code === undefined ? undefined : WRITE_PROBLEMS[code];
  if (!problem || typeof path !== "string") return null;
  // Only the part under the repository is shown: the absolute path is the server's, not the reader's.
  const inRepo = relative(root, path);
  if (inRepo.startsWith("..") || isAbsolute(inRepo)) return null;
  if (!OWN_FOLDERS.some((folder) => inRepo === folder || inRepo.startsWith(join(folder, "/")))) return null;
  return { message: `結果をサーバに保存できませんでした（${inRepo} に書き込めません: ${problem.reason}）`, nextStep: problem.nextStep };
}
