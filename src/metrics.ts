import { spawnSync } from "node:child_process";
import { cpus, freemem, totalmem } from "node:os";
import type { Task } from "./domain.js";

type CpuSample = { idle: number; total: number };
let previous = cpuSample();
let cachedAt = 0;
let cached: Record<string, unknown>;

function cpuSample(): CpuSample {
  const cores = cpus();
  return cores.reduce(
    (sum, core) => {
      const values = Object.values(core.times);
      return {
        idle: sum.idle + core.times.idle,
        total: sum.total + values.reduce((a, b) => a + b, 0),
      };
    },
    { idle: 0, total: 0 },
  );
}

function gpuSample() {
  const command = process.platform === "win32" ? "nvidia-smi.exe" : "nvidia-smi";
  const result = spawnSync(
    command,
    [
      "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
      "--format=csv,noheader,nounits",
    ],
    { encoding: "utf8", timeout: 1200, windowsHide: true },
  );
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return result.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [name, utilization, used, total, temperature] = line
        .split(",")
        .map((value) => value.trim());
      return {
        name,
        utilization: Number(utilization),
        memoryUsedMiB: Number(used),
        memoryTotalMiB: Number(total),
        temperatureC: Number(temperature),
      };
    });
}

export function hostMetrics(tasks: Task[]) {
  if (Date.now() - cachedAt < 2500 && cached) return cached;
  const current = cpuSample();
  const elapsed = current.total - previous.total;
  const cpuPercent = elapsed > 0
    ? Math.max(0, Math.min(100, (1 - (current.idle - previous.idle) / elapsed) * 100))
    : 0;
  previous = current;
  const totalMemory = totalmem();
  const freeMemory = freemem();
  cached = {
    cpuPercent: Math.round(cpuPercent),
    memoryTotalBytes: totalMemory,
    memoryUsedBytes: totalMemory - freeMemory,
    activeAgents: tasks.filter((task) => task.status === "running").length,
    queuedAgents: tasks.filter((task) => ["queued", "waiting_model"].includes(task.status)).length,
    maxConcurrentAgents: 1,
    gpus: gpuSample(),
    updatedAt: new Date().toISOString(),
  };
  cachedAt = Date.now();
  return cached;
}
