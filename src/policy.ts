import { isIP } from "node:net";
import { resolve, relative, isAbsolute } from "node:path";
import { lstat, realpath } from "node:fs/promises";
import type { Config, Patch } from "./domain.js";
export function localEndpoint(value: string): URL {
  const u = new URL(value);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    !["127.0.0.1", "[::1]"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error("只允许本机 127.0.0.1 或 [::1] 模型端点，禁止云端兜底");
  if (u.pathname.replace(/\/$/, "") !== "/v1")
    throw new Error("模型地址必须以 /v1 结尾");
  return u;
}
export function validateConfig(c: Config): Config {
  localEndpoint(c.model.baseUrl);
  if (
    !Number.isInteger(c.model.contextWindow) ||
    c.model.contextWindow < 2048 ||
    c.model.contextWindow > 65536
  )
    throw new Error("上下文必须为 2048–65536");
  if (
    !Number.isInteger(c.model.maxOutputTokens) ||
    c.model.maxOutputTokens < 256 ||
    c.model.maxOutputTokens > c.model.contextWindow / 2
  )
    throw new Error("输出预算必须为 256 到上下文的一半");
  if (
    !["podman", "docker"].includes(c.sandbox.engine) ||
    !/^[a-zA-Z0-9._-]{1,60}$/.test(c.sandbox.distro)
  )
    throw new Error("沙箱配置无效");
  if (
    ![c.sandbox.image, c.sandbox.evaluatorImage].every((s) =>
      /^[a-zA-Z0-9./:@_-]{1,200}$/.test(s),
    )
  )
    throw new Error("镜像名称无效");
  if (
    c.limits.turns < 1 ||
    c.limits.turns > 60 ||
    c.limits.taskSeconds < 10 ||
    c.limits.taskSeconds > 3600 ||
    c.limits.repairAttempts < 0 ||
    c.limits.repairAttempts > 3 ||
    c.limits.contextChars < 1000 ||
    c.limits.contextChars > 40000
  )
    throw new Error("资源预算超出范围");
  if (c.webDomains.some((d) => !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(d)))
    throw new Error("网站白名单必须是域名");
  return c;
}
export function safeId(id: string) {
  if (!/^[a-z][a-z0-9_]{2,55}$/.test(id))
    throw new Error("名称只能包含小写字母、数字和下划线，3–56 字符");
  return id;
}
export async function workspacePath(
  root: string,
  input: string,
  writing = false,
): Promise<string> {
  if (
    !input ||
    isAbsolute(input) ||
    input.includes("\0") ||
    input.includes("\\") ||
    input.includes(":")
  )
    throw new Error("只能使用工作区内的相对路径");
  const base = await realpath(root);
  const target = resolve(base, input);
  const rel = relative(base, target);
  if (rel.startsWith("..") || isAbsolute(rel))
    throw new Error("路径超出工作区");
  let current = target;
  while (current !== base) {
    try {
      const s = await lstat(current);
      if (s.isSymbolicLink()) throw new Error("工作区不允许符号链接");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      if (!writing) throw e;
    }
    current = resolve(current, "..");
  }
  return target;
}
export function validatePatches(patches: Patch[]) {
  if (!patches.length || patches.length > 12)
    throw new Error("补丁必须含 1–12 个文件");
  for (const p of patches) {
    if (
      !/^src\/runtime\/[a-zA-Z0-9_-]+\.ts$/.test(p.path) &&
      !/^web\/src\/[a-zA-Z0-9_-]+\.(tsx|ts|css)$/.test(p.path)
    )
      throw new Error(
        "核心修复仅允许 runtime 策略和 GUI 文件；恢复、费用、权限与验收根受保护",
      );
    if (p.content.length > 100000) throw new Error("单文件过大");
  }
  if (new Set(patches.map((p) => p.path)).size !== patches.length)
    throw new Error("补丁路径重复");
}
export function publicAddress(address: string) {
  if (!isIP(address)) return false;
  if (address.includes(":"))
    return (
      !/^(::|fc|fd|fe80|ff)/i.test(address) &&
      !address.toLowerCase().startsWith("::ffff:")
    );
  const [a, b] = address.split(".").map(Number) as [number, number];
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
