import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Config } from "./domain.js";
import { runProcess } from "./process.js";
export interface Sandbox {
  execute(
    source: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<unknown>;
  health(): Promise<{ ok: boolean; detail: string }>;
}
const RUNNER = `let raw='';for await(const b of process.stdin)raw+=b;const {source,input}=JSON.parse(raw);const {Script,createContext}=await import('node:vm');const context=createContext({input},{codeGeneration:{strings:false,wasm:false}});const output=new Script('('+source+')(input)').runInContext(context,{timeout:5000});if(output&&typeof output.then==='function')throw Error('Only synchronous JSON transforms are supported');process.stdout.write(JSON.stringify(output));`;
export class ContainerSandbox implements Sandbox {
  constructor(private config: () => Config) {}
  private command(args: string[]) {
    const c = this.config().sandbox;
    return c.wsl && process.platform === "win32"
      ? { cmd: "wsl.exe", args: ["-d", c.distro, "--", c.engine, ...args] }
      : { cmd: c.engine, args };
  }
  async health() {
    try {
      const p = this.command(["info"]);
      await runProcess(p.cmd, p.args, { timeout: 10000 });
      const image = this.command([
        "image",
        "inspect",
        this.config().sandbox.image,
      ]);
      await runProcess(image.cmd, image.args, { timeout: 10000 });
      return { ok: true, detail: "隔离引擎与工具镜像可用" };
    } catch (e) {
      return { ok: false, detail: String(e) };
    }
  }
  async execute(
    source: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (source.length > 40000 || JSON.stringify(input).length > 100000)
      throw new Error("工具输入或源码超过限制");
    const name = "alien-" + randomUUID();
    const p = this.command([
      "run",
      "--pull=never",
      "--name",
      name,
      "--rm",
      "-i",
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--pids-limit=32",
      "--memory=256m",
      "--cpus=1",
      "--user=65534:65534",
      "--tmpfs=/tmp:rw,noexec,nosuid,size=16m",
      this.config().sandbox.image,
      "node",
      "--input-type=module",
      "-e",
      RUNNER,
    ]);
    try {
      return JSON.parse(
        await runProcess(p.cmd, p.args, {
          input: JSON.stringify({ source, input }),
          timeout: 10000,
          signal,
        }),
      );
    } finally {
      const clean = this.command(["rm", "-f", name]);
      await runProcess(clean.cmd, clean.args, { timeout: 5000 }).catch(
        () => {},
      );
    }
  }
  async nativePath(path: string) {
    if (process.platform !== "win32" || !this.config().sandbox.wsl)
      return resolve(path);
    return (
      await runProcess("wsl.exe", [
        "-d",
        this.config().sandbox.distro,
        "--",
        "wslpath",
        "-a",
        resolve(path),
      ])
    ).trim();
  }
  async evaluate(candidate: string, output: string, signal?: AbortSignal) {
    const name = "alien-eval-" + randomUUID();
    const src = await this.nativePath(candidate),
      dest = await this.nativePath(output);
    let identity:string[]=[];
    if(this.config().sandbox.engine==='docker'){
      if(process.platform==='win32'&&this.config().sandbox.wsl){
        const id=async(flag:string)=>(await runProcess('wsl.exe',['-d',this.config().sandbox.distro,'--','id',flag])).trim();
        const [uid,gid]=await Promise.all([id('-u'),id('-g')]);
        if(!/^\d+$/.test(uid)||!/^\d+$/.test(gid))throw new Error('无法获取验收输出目录的用户身份');
        identity=['--user',`${uid}:${gid}`];
      }else if(typeof process.getuid==='function'&&typeof process.getgid==='function')identity=['--user',`${process.getuid()}:${process.getgid()}`];
    }
    const p = this.command([
      "run",
      ...identity,
      "--pull=never",
      "--name",
      name,
      "--rm",
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--pids-limit=256",
      "--memory=2g",
      "--cpus=2",
      "--tmpfs=/tmp:rw,exec,nosuid,size=768m",
      "-v",
      `${src}:/candidate:ro`,
      "-v",
      `${dest}:/output:rw`,
      this.config().sandbox.evaluatorImage,
    ]);
    try {
      return await runProcess(p.cmd, p.args, { timeout: 300000, signal });
    } finally {
      const clean = this.command(["rm", "-f", name]);
      await runProcess(clean.cmd, clean.args, { timeout: 5000 }).catch(
        () => {},
      );
    }
  }
}
