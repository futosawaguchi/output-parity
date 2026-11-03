import { spawn } from "node:child_process";

/** Runs a command to the end; its output is returned (and kept for the message when it fails). */
export function run(command: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: opts.cwd ?? process.cwd(), env: opts.env ?? process.env });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(text) : reject(new Error(`${[command, ...args].join(" ")} が終了コード ${code}: ${lastLines(text)}`))));
  });
}

function lastLines(text: string): string {
  return text.trim().split("\n").slice(-3).join(" / ").slice(0, 300);
}
