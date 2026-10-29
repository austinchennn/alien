export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_model"
  | "waiting_review"
  | "succeeded"
  | "failed"
  | "cancelled";
export type TaskKind = "task" | "develop" | "repair";
export interface TestCase {
  input: unknown;
  expected: unknown;
}
export interface Task {
  id: string;
  goal: string;
  kind: TaskKind;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  result?: string;
  error?: string;
  acceptance: TestCase[];
  toolId?: string;
  attempts: number;
  contextTokens?: number;
}
export interface EventRecord {
  seq: number;
  taskId: string;
  type: string;
  data: unknown;
  createdAt: string;
}
export interface Memory {
  id: string;
  text: string;
  source: "user" | "agent";
  createdAt: string;
  expiresAt?: string;
}
export interface Skill {
  id: string;
  name: string;
  instructions: string;
  version: number;
  source: "user" | "agent";
  createdAt: string;
}
export interface Capability {
  id: string;
  version: number;
  name: string;
  description: string;
  source: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  tests: TestCase[];
  acceptance: TestCase[];
  originTask: string;
  state: "candidate" | "tested" | "active" | "quarantined";
  hash: string;
  createdAt: string;
  report?: {
    passed: number;
    total: number;
    error?: string;
    independent: boolean;
  };
}
export interface Config {
  model: {
    baseUrl: string;
    id: string;
    contextWindow: number;
    maxOutputTokens: number;
    thinking: boolean;
  };
  sandbox: {
    engine: "podman" | "docker";
    wsl: boolean;
    distro: string;
    image: string;
    evaluatorImage: string;
  };
  limits: {
    turns: number;
    taskSeconds: number;
    repairAttempts: number;
    contextChars: number;
  };
  autoRepair: boolean;
  autoPublishCore: boolean;
  webDomains: string[];
  browserEnabled?: boolean;
}
export interface Patch {
  path: string;
  content: string;
}
export interface CoreChange {
  id: string;
  taskId: string;
  patches: Patch[];
  state: "candidate" | "verified" | "published" | "failed";
  report?: string;
  createdAt: string;
}
export const defaults: Config = {
  model: {
    baseUrl: "http://127.0.0.1:8000/v1",
    id: "alien-local",
    contextWindow: 8192,
    maxOutputTokens: 2048,
    thinking: true,
  },
  sandbox: {
    engine: "podman",
    wsl: process.platform === "win32",
    distro: "Ubuntu",
    image: "docker.io/library/node:22-alpine",
    evaluatorImage: "localhost/alien-evaluator:0.1.0",
  },
  limits: {
    turns: 20,
    taskSeconds: 600,
    repairAttempts: 3,
    contextChars: 10000,
  },
  autoRepair: true,
  autoPublishCore: false,
  webDomains: [],
};
export const now = () => new Date().toISOString();
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
