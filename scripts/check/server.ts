import { spawn, type ChildProcess } from "node:child_process";
import { run } from "./command";

// A production server of the tool for the checks: built and started in `dir` on its own port, so
// the dev server someone is using is left alone, and no job from earlier is in its memory.

export type Server = { base: string; stop: () => Promise<void> };

export async function buildApp(dir: string): Promise<void> {
  await run("npx", ["next", "build"], { cwd: dir });
}

export async function startApp(dir: string, port: number): Promise<Server> {
  const child: ChildProcess = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: dir, stdio: "ignore", detached: true });
  const base = `http://127.0.0.1:${port}`;
  const stop = async () => {
    // npx starts next as a child: stop the whole group.
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  };
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${base}/check`).then((r) => r.ok, () => false);
    if (ok) return { base, stop };
    await new Promise((r) => setTimeout(r, 500));
  }
  await stop();
  throw new Error(`${base} が 30 秒たっても応えません（ポート ${port} が使われていないか確かめてください）`);
}
