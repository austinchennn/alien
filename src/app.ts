import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { join, resolve, relative } from "node:path";
import { createReadStream } from "node:fs";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { workspacePath } from "./policy.js";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { totalmem, freemem, platform } from "node:os";
import { Store } from "./store.js";
import {
  defaults,
  now,
  type Config,
  type Task,
  type Memory,
  type Skill,
  type TestCase,
  type Capability,
} from "./domain.js";
import { validateConfig } from "./policy.js";
import { ContainerSandbox, type Sandbox } from "./sandbox.js";
import { Registry } from "./registry.js";
import { Changes } from "./changes.js";
import { ModelGateway } from "./model.js";
import { Engine } from "./engine.js";
import { Vault } from "./vault.js";
import { CalendarConnector } from "./calendar.js";
export async function createApp(options: {
  dir: string;
  root: string;
  token?: string;
  sandbox?: Sandbox;
  startEngine?: boolean;
}) {
  const { dir, root } = options;
  const store = new Store(dir);
  const tokenPath = join(dir, "access-token");
  const token =
    options.token ??
    (existsSync(tokenPath)
      ? readFileSync(tokenPath, "utf8")
      : randomBytes(32).toString("hex"));
  if (!options.token) writeFileSync(tokenPath, token, { mode: 0o600 });
  let config =
    store.get<Config>("settings", "config") ?? structuredClone(defaults);
  const modelFile=join(dir,'model.json');
  if(existsSync(modelFile)){
    try{
      const raw=readFileSync(modelFile,'utf8').replace(/^\uFEFF/,'');
      const local=JSON.parse(raw) as {Context:number};
      if(raw!==store.get('settings','modelFile')&&Number.isInteger(local.Context)&&local.Context>=2048&&local.Context<=65536){
        config={...config,model:{...config.model,id:'alien-local',baseUrl:defaults.model.baseUrl,contextWindow:local.Context,maxOutputTokens:Math.min(config.model.maxOutputTokens,Math.floor(local.Context/2))}};
        validateConfig(config);store.put('settings','config',config);store.put('settings','modelFile',raw);
      }
    }catch{store.event('system','model_config_error',{reason:'本地模型选择配置无效，保留现有运行设置'});}
  }
  const getConfig = () => config;
  const nativeSandbox = new ContainerSandbox(getConfig);
  const sandbox = options.sandbox ?? nativeSandbox;
  const registry = new Registry(store, sandbox),
    changes = new Changes(store, nativeSandbox, getConfig, root),
    model = new ModelGateway(getConfig),
    calendar = new CalendarConnector(new Vault(dir));
  const engine = new Engine(
    store,
    getConfig,
    model,
    registry,
    changes,
    calendar,
    root,
  );
  const app = Fastify({
    bodyLimit: 512000,
    logger: false,
    requestTimeout: 30000,
  });
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;
    const host = String(req.headers.host ?? "");
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host))
      return reply.code(403).send({ error: "仅接受本机访问" });
    if (!req.url.startsWith("/api/")) return;
    const supplied = String(req.headers.authorization ?? "").replace(
      /^Bearer /,
      "",
    );
    const a = Buffer.from(supplied),
      b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return reply.code(401).send({ error: "需要本机访问密钥" });
    if (req.headers.origin) {
      const u = new URL(req.headers.origin);
      if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
        return reply.code(403).send({ error: "来源不允许" });
    }
  });
  app.setErrorHandler((e, _req, reply) => {
    const error = e as { statusCode?: number; message?: string };
    return reply
      .code(error.statusCode ?? 400)
      .send({ error: error.message ?? String(e) });
  });
  app.get("/health", async () => ({
    ok: true,
    service: "alien",
    version: "0.1.0",
  }));
  const bundled = loadSkillsFromDir({
    dir: join(root, "skills"),
    source: "bundled",
  }).skills.map((s) => ({
    id: "bundled:" + s.name,
    name: s.name,
    version: "pinned",
    source: "bundled",
    instructions: readFileSync(s.filePath, "utf8"),
  }));
  const outputs = () =>
    readdirSync(join(dir, "workspace"), {
      recursive: true,
      withFileTypes: true,
    })
      .filter((f) => f.isFile())
      .map((f) =>
        relative(join(dir, "workspace"), join(f.parentPath, f.name)).replaceAll(
          "\\",
          "/",
        ),
      )
      .filter((p) => p.startsWith("output/"))
      .slice(0, 100);
  app.get("/api/state", async () => ({
    tasks: store.list<Task>("task"),
    capabilities: store.list<Capability>("capability"),
    memories: store.list<Memory>("memory"),
    skills: [...bundled, ...store.list<Skill>("skill")],
    outputs: outputs(),
    changes: store.list("change"),
    config,
    calendarConfigured: calendar.configured(),
    system: {
      platform: platform(),
      ram: totalmem(),
      freeRam: freemem(),
      pid: process.pid,
    },
    recovery: existsSync(join(dir, "supervisor.json"))
      ? JSON.parse(readFileSync(join(dir, "supervisor.json"), "utf8"))
      : null,
  }));
  const taskSchema = {
    body: {
      type: "object",
      required: ["goal"],
      additionalProperties: false,
      properties: {
        goal: { type: "string", minLength: 1, maxLength: 12000 },
        kind: { enum: ["task", "develop", "repair"] },
        toolId: { type: "string", maxLength: 56 },
        acceptance: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            required: ["input", "expected"],
            additionalProperties: false,
            properties: { input: {}, expected: {} },
          },
        },
      },
    },
  };
  app.post<{
    Body: {
      goal: string;
      kind?: "task" | "develop" | "repair";
      acceptance?: TestCase[];
      toolId?: string;
    };
  }>("/api/tasks", { schema: taskSchema }, async (req) =>
    engine.create(
      req.body.goal,
      req.body.kind,
      req.body.acceptance,
      req.body.toolId,
    ),
  );
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/api/tasks/:id/events",
    async (req) => store.events(req.params.id, Number(req.query.after) || 0),
  );
  app.post<{ Params: { id: string } }>("/api/tasks/:id/cancel", async (req) => {
    await engine.cancel(req.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/tasks/:id/retry", async (req) =>
    engine.retry(req.params.id),
  );
  app.get("/api/model/status", async () => {
    try {
      return { ok: true, models: await model.discover() };
    } catch (e) {
      return { ok: false, models: [], error: String(e) };
    }
  });
  app.get("/api/sandbox/status", async () => sandbox.health());
  app.put<{ Body: Config }>("/api/config", async (req) => {
    const candidate = validateConfig(req.body);
    config = candidate;
    store.put("settings", "config", config);
    return config;
  });
  app.post<{ Body: { text: string; expiresAt?: string } }>(
    "/api/memories",
    {
      schema: {
        body: {
          type: "object",
          required: ["text"],
          additionalProperties: false,
          properties: {
            text: { type: "string", minLength: 1, maxLength: 3000 },
            expiresAt: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      if (
        req.body.expiresAt &&
        !Number.isFinite(Date.parse(req.body.expiresAt))
      )
        throw new Error("过期时间无效");
      const m: Memory = {
        id: randomUUID(),
        ...req.body,
        source: "user",
        createdAt: now(),
      };
      store.put("memory", m.id, m);
      return m;
    },
  );
  app.delete<{ Params: { id: string } }>("/api/memories/:id", async (req) => {
    store.remove("memory", req.params.id);
    return { ok: true };
  });
  app.post<{ Body: { id: string; version: number; cases: TestCase[] } }>(
    "/api/capabilities/promote",
    async (req) =>
      registry.promote(req.body.id, req.body.version, req.body.cases),
  );
  app.post<{ Body: { id: string; version: number } }>(
    "/api/capabilities/rollback",
    async (req) => registry.rollback(req.body.id, req.body.version),
  );
  app.post<{ Params: { id: string } }>(
    "/api/changes/:id/publish",
    async (req) => changes.publish(req.params.id),
  );
  app.post<{ Body: { username: string; password: string } }>(
    "/api/calendar",
    {
      schema: {
        body: {
          type: "object",
          required: ["username", "password"],
          additionalProperties: false,
          properties: {
            username: { type: "string", maxLength: 200 },
            password: { type: "string", maxLength: 200 },
          },
        },
      },
    },
    async (req) => {
      calendar.save(req.body);
      return { ok: true };
    },
  );
  app.get("/api/workspace", async () => outputs());
  app.get<{ Querystring: { path: string } }>(
    "/api/files",
    async (req, reply) => {
      if (!req.query.path?.startsWith("output/"))
        throw new Error("只能下载 output/ 文件");
      const path = await workspacePath(join(dir, "workspace"), req.query.path);
      reply.type("application/octet-stream");
      return reply.send(createReadStream(path));
    },
  );
  app.post("/api/backup", async () => {
    const { backup } = await import("node:sqlite");
    const folder = join(dir, "backups");
    mkdirSync(folder, { recursive: true });
    const file = join(folder, "alien-" + Date.now() + ".sqlite");
    await backup(store.db, file);
    return { ok: true, file };
  });
  const web = join(
    resolve(process.env.ALIEN_RELEASE_DIR ?? join(root, "dist")),
    "web",
  );
  if (existsSync(web)) {
    await app.register(fastifyStatic, { root: web });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "接口不存在" })
        : reply.sendFile("index.html"),
    );
  }
  app.addHook("onClose", async () => {
    await engine.close();
    store.close();
  });
  const repairFile=join(dir,'repair-request.json');
  if(config.autoRepair&&existsSync(repairFile)){
    const request=JSON.parse(readFileSync(repairFile,'utf8')) as {candidateId:string;reason:string};
    const key='core:'+request.candidateId;
    if(/^[a-f0-9-]{36}$/.test(request.candidateId)&&!store.get('recovery_repair',key)){
      const task=engine.create(`应用候选 ${request.candidateId} 启动失败，守护进程已回滚。原因：${request.reason}。用 core_inspect 读取失败补丁，用 core_read/core_edit 创建修复并验收。固定恢复模块不可修改。`,'repair');
      store.put('recovery_repair',key,{taskId:task.id});
    }
    renameSync(repairFile,repairFile+'.handled-'+Date.now());
  }
  if (options.startEngine !== false) setImmediate(() => void engine.pump());
  return { app, store, engine, registry, token, config: getConfig };
}
