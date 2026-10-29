import { spawn } from "node:child_process";
export function runProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    input?: string;
    timeout?: number;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      err = "",
      settled = false;
    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
      child.kill("SIGKILL");
    };
    const timer = setTimeout(
      () => fail(new Error("执行超时")),
      options.timeout ?? 30000,
    );
    const abort = () => fail(new Error("操作已取消"));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout.on("data", (b: Buffer) => {
      out += b.toString();
      if (out.length > 500000) fail(new Error("输出超过限制"));
    });
    child.stderr.on("data", (b: Buffer) => {
      err = (err + b.toString()).slice(-20000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (!settled) {
        settled = true;
        reject(e);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (settled) return;
      settled = true;
      code === 0
        ? resolve(out)
        : reject(new Error(`进程退出 ${code}: ${err || out}`));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");
  });
}
