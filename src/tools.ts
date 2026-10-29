import { realpathSync } from "node:fs";
import { readdir, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import {
  createReadTool,
  createWriteTool,
  createEditTool,
} from "@earendil-works/pi-coding-agent";
import { createHash, randomUUID } from "node:crypto";
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Capability, Config, Memory, Skill, Task } from "./domain.js";
import { now, errorText } from "./domain.js";
import { Store } from "./store.js";
import { Registry } from "./registry.js";
import { Changes } from "./changes.js";
import { CalendarConnector, expandICS } from "./calendar.js";
import { workspacePath, safeId, validatePatches } from "./policy.js";
import { publicPage } from "./network.js";
import { compactObservation } from "./runtime/context.js";
export interface TaskResult {
  summary: string;
  kind: "answer" | "action";
  evidence: string[];
}
export interface ToolContext {
  store: Store;
  registry: Registry;
  changes: Changes;
  calendar: CalendarConnector;
  config: () => Config;
  task: Task;
  root: string;
  finish?: (result: TaskResult) => void;
  loadTools?: (names: string[]) => unknown;
  toolFailed?: (c: Capability, error: string) => void;
}
const testcase = Type.Object({
  input: Type.Unknown(),
  expected: Type.Unknown(),
});
export function taskTools(ctx: ToolContext): AgentTool[] {
  const { store, task, registry } = ctx;
  const workspace = realpathSync(join(store.dir, "workspace"));
  const guard = async (absolute: string, writing = false) => {
    const rel = relative(workspace, absolute).replaceAll("\\", "/");
    if (writing && !rel.startsWith("output/"))
      throw new Error("只能写入 output/");
    return workspacePath(workspace, rel, writing);
  };
  const read = createReadTool(workspace, {
    operations: {
      readFile: async (p) => readFile(await guard(p)),
      access: async (p) => {
        await guard(p);
      },
    },
  });
  const atomic = async (p: string, text: string) => {
    const target = await guard(p, true);
    await mkdir(dirname(target), { recursive: true });
    const temp = target + "." + randomUUID() + ".tmp";
    await writeFile(temp, text);
    await rename(temp, target);
    if ((await readFile(target, "utf8")) !== text)
      throw new Error("写入核验失败");
  };
  const write = createWriteTool(workspace, {
    operations: { writeFile: atomic, mkdir: async () => {} },
  });
  const edit = createEditTool(workspace, {
    operations: {
      readFile: async (p) => readFile(await guard(p, true)),
      writeFile: atomic,
      access: async (p) => {
        await guard(p, true);
      },
    },
  });
  const corePath = (p:string) => {
    const path=relative(ctx.root,p).replaceAll('\\','/');
    validatePatches([{path,content:''}]);return path;
  };
  const coreRead = createReadTool(ctx.root,{operations:{
    access:async p=>{corePath(p);},
    readFile:async p=>Buffer.from(await ctx.changes.readCurrent(corePath(p))),
  }});
  const make = (
    name: string,
    description: string,
    parameters: any,
    execute: (args: any, signal?: AbortSignal) => Promise<unknown>,
    effect = false,
  ): AgentTool => ({
    name,
    label: name,
    description,
    parameters,
    replay: effect ? "never" : "safe",
    executionMode: "sequential",
    async execute(callId, args, signal) {
      const key = createHash("sha256")
        .update(task.id + name + JSON.stringify(args))
        .digest("hex");
      if (effect) {
        const old = store.get<{ state: string; value?: unknown }>(
          "effect",
          key,
        );
        if (old?.state === "done") {
          store.put("evidence", callId, {
            taskId: task.id,
            tool: name,
            value: old.value,
            createdAt: now(),
            reused: true,
          });
          return {
            content: [
              {
                type: "text",
                text: compactObservation({
                  callId,
                  result: old.value,
                  reused: true,
                }),
              },
            ],
            details: old.value,
          };
        }
        if (old?.state === "intent")
          throw new Error("上次操作结果未知，已阻止盲目重放；请核对任务证据");
        store.put("effect", key, {
          state: "intent",
          taskId: task.id,
          name,
          callId,
          createdAt: now(),
        });
      }
      try {
        const value = await execute(args, signal);
        if (effect)
          store.put("effect", key, {
            state: "done",
            value,
            taskId: task.id,
            callId,
          });
        store.put("evidence", callId, {
          taskId: task.id,
          tool: name,
          value,
          createdAt: now(),
        });
        store.event(task.id, "verified_tool", {
          callId,
          tool: name,
          result: value,
        });
        return {
          content: [
            {
              type: "text",
              text: compactObservation({ callId, result: value }),
            },
          ],
          details: value,
        };
      } catch (e) {
        if (effect)
          store.put("effect", key, {
            state: "failed",
            taskId: task.id,
            error: errorText(e),
          });
        throw e;
      }
    },
  });
  return [
    make(
      "tools_load",
      "按需加载工具。可选组：workspace（文件）, memory（记忆）, skill（技能）, tools（开发、检查、运行）, calendar（日历）, web（网页）, core（应用修复）",
      Type.Object({
        groups: Type.Array(Type.String(), { minItems: 1, maxItems: 3 }),
      }),
      async (a) => ctx.loadTools?.(a.groups),
    ),
    make(
      "workspace_list",
      "列出独立工作区中的文件，不能访问电脑的其他目录",
      Type.Object({ path: Type.Optional(Type.String()) }),
      async (a) => {
        const p = a.path ? await workspacePath(workspace, a.path) : workspace;
        return (await readdir(p, { withFileTypes: true }))
          .filter((d) => !d.isSymbolicLink())
          .map((d) => ({ name: d.name, directory: d.isDirectory() }));
      },
    ),
    make("read", read.description, read.parameters, async (a, signal) =>
      read.execute(randomUUID(), a, signal),
    ),
    make(
      "workspace_search",
      "在工作区内按文件名或文本搜索，最多读取 100 个文件，不跟随符号链接",
      Type.Object({
        query: Type.String({ minLength: 1, maxLength: 200 }),
        content: Type.Optional(Type.Boolean()),
      }),
      async (a) => {
        const found: { path: string; excerpt?: string }[] = [];
        let count = 0;
        async function visit(dir: string) {
          for (const entry of await readdir(dir, { withFileTypes: true })) {
            if (count >= 100 || found.length >= 30) return;
            if (entry.isSymbolicLink()) continue;
            const rel =
              dir === workspace
                ? entry.name
                : dir.slice(workspace.length + 1).replaceAll("\\", "/") +
                  "/" +
                  entry.name;
            const p = await workspacePath(workspace, rel);
            if (entry.isDirectory()) await visit(p);
            else if (entry.isFile()) {
              count++;
              if (rel.toLowerCase().includes(a.query.toLowerCase()))
                found.push({ path: rel });
              else if (a.content) {
                const text = await readFile(p, "utf8");
                if (text.length <= 100000) {
                  const at = text.toLowerCase().indexOf(a.query.toLowerCase());
                  if (at >= 0)
                    found.push({
                      path: rel,
                      excerpt: text.slice(Math.max(0, at - 80), at + 200),
                    });
                }
              }
            }
          }
        }
        await visit(workspace);
        return { filesScanned: count, matches: found };
      },
    ),
    make(
      "edit",
      edit.description + "；只能编辑 output/。",
      edit.parameters,
      async (a, signal) => edit.execute(randomUUID(), a, signal),
      true,
    ),
    make(
      "task_progress",
      "记录计划与当前进度。进度是步骤事实，不表示任务已经完成",
      Type.Object({
        plan: Type.Array(
          Type.Object({
            title: Type.String({ maxLength: 200 }),
            state: Type.Union([
              Type.Literal("pending"),
              Type.Literal("running"),
              Type.Literal("done"),
            ]),
          }),
          { maxItems: 20 },
        ),
      }),
      async (a) => {
        store.put("plan", task.id, a.plan);
        store.event(task.id, "plan", a.plan);
        return { saved: true };
      },
    ),
    make(
      "write",
      write.description + "；只能写入 output/。",
      write.parameters,
      async (a, signal) => write.execute(randomUUID(), a, signal),
      true,
    ),
    make(
      "memory_search",
      "搜索有来源的记忆；agent 来源是未经用户确认的经验",
      Type.Object({ query: Type.String() }),
      async (a) =>
        store
          .list<Memory>("memory")
          .filter(
            (m) =>
              (!m.expiresAt || Date.parse(m.expiresAt) > Date.now()) &&
              m.text.toLowerCase().includes(a.query.toLowerCase()),
          )
          .slice(0, 12),
    ),
    make(
      "memory_remember",
      "保存带来源的候选经验，不能覆盖用户偏好",
      Type.Object({
        text: Type.String({ maxLength: 3000 }),
        expiresAt: Type.Optional(Type.String()),
      }),
      async (a) => {
        if (a.expiresAt && !Number.isFinite(Date.parse(a.expiresAt)))
          throw new Error("过期时间无效");
        const m: Memory = {
          id: randomUUID(),
          text: a.text,
          source: "agent",
          createdAt: now(),
          expiresAt: a.expiresAt,
        };
        store.put("memory", m.id, m);
        return m;
      },
      true,
    ),
    make(
      "skill_save",
      "保存可复用 Skill。Skill 是带版本的操作经验，不会扩大权限",
      Type.Object({
        id: Type.String(),
        name: Type.String(),
        instructions: Type.String({ minLength: 20, maxLength: 10000 }),
      }),
      async (a) => {
        safeId(a.id);
        const old = store
          .list<Skill>("skill")
          .filter((s) => s.id === a.id)
          .sort((x, y) => y.version - x.version)[0];
        const s: Skill = {
          ...a,
          version: (old?.version ?? 0) + 1,
          source: "agent",
          createdAt: now(),
        };
        store.put("skill", `${s.id}:${s.version}`, s);
        return s;
      },
      true,
    ),
    make(
      "tools_search",
      "搜索已经注册的工具与候选版本",
      Type.Object({ query: Type.Optional(Type.String()) }),
      async (a) =>
        store
          .list<Capability>("capability")
          .filter(
            (c) =>
              !a.query ||
              (c.id + " " + c.description)
                .toLowerCase()
                .includes(a.query.toLowerCase()),
          )
          .map(({ source, tests, acceptance, ...rest }) => rest)
          .slice(0, 30),
    ),
    make(
      "tools_inspect",
      "读取工具的源代码、自测与失败记录，用于修复；独立验收用例不会返回",
      Type.Object({ id: Type.String(), version: Type.Optional(Type.Number()) }),
      async (a) => {
        const c = registry.find(a.id, a.version) ?? registry.versions(a.id)[0];
        if (!c) throw new Error("工具不存在");
        const { acceptance, ...rest } = c;
        return rest;
      },
    ),
    make(
      "tools_develop",
      "编写纯 JSON 转换工具：source 必须为同步 JavaScript 函数表达式，例如 input => ({total: input.values.reduce((a,b)=>a+b,0)})。在无网络容器中执行至少三个自测；具有任务独立验收用例的版本才会自动启用",
      Type.Object({
        id: Type.String(),
        name: Type.String(),
        description: Type.String(),
        source: Type.String(),
        inputSchema: Type.Record(Type.String(), Type.Unknown()),
        outputSchema: Type.Record(Type.String(), Type.Unknown()),
        tests: Type.Array(testcase, { minItems: 3, maxItems: 20 }),
      }),
      async (a, signal) => {
        const { acceptance, ...candidate } = await registry.propose(
          task,
          a,
          signal,
        );
        return candidate;
      },
      true,
    ),
    make(
      "tools_run",
      "运行已启用的工具，或当前任务创建且自测通过的候选；所有版本均在隔离容器中运行",
      Type.Object({
        id: Type.String(),
        version: Type.Optional(Type.Number()),
        input: Type.Record(Type.String(), Type.Unknown()),
      }),
      async (a, signal) => {
        const c =
          registry.find(a.id, a.version) ??
          registry
            .versions(a.id)
            .find((v) => v.state === "tested" && v.originTask === task.id);
        if (!c || (c.state !== "active" && c.originTask !== task.id))
          throw new Error("没有可用于本任务的已验证版本");
        try {
          return await registry.invoke(c, a.input, signal);
        } catch (e) {
          ctx.toolFailed?.(c, errorText(e));
          throw e;
        }
      },
    ),
    make(
      "web_read",
      "读取用户授权域名内的公开文本网页；不能访问私有网络，重定向不自动跟随",
      Type.Object({ url: Type.String() }),
      async (a, signal) => ({
        url: a.url,
        text: await publicPage(a.url, ctx.config().webDomains, signal),
        source: "untrusted_external_data",
      }),
    ),
    make(
      "calendar_read",
      "读取 iCloud 日历事件（只读），日期使用明确时区的 ISO 格式，最多 31 天",
      Type.Object({ start: Type.String(), end: Type.String() }),
      async (a) => ctx.calendar.events(a.start, a.end),
    ),
    make(
      "calendar_read_ics",
      "从工作区 ICS 文件读取含重复规则的日程",
      Type.Object({
        path: Type.String(),
        start: Type.String(),
        end: Type.String(),
      }),
      async (a) => {
        const file = await workspacePath(workspace, a.path);
        return expandICS(await readFile(file, "utf8"), a.start, a.end);
      },
    ),
    make(
      "core_read",
      "分页读取可自主修复的 runtime 或 GUI 文件，复用 Pi read 的 offset/limit 参数。",
      coreRead.parameters,
      async (a,signal) => coreRead.execute(randomUUID(),a,signal),
    ),
    make(
      "core_edit",
      "精确编辑 runtime/GUI 的文本片段，再对完整候选运行独立验收。复用 Pi edit，无需重新输出整个文件。",
      edit.parameters,
      async(a,signal)=>{
        const patches=new Map<string,string>();
        const tool=createEditTool(ctx.root,{operations:{
          access:async p=>{corePath(p);},
          readFile:async p=>Buffer.from(await ctx.changes.readCurrent(corePath(p))),
          writeFile:async(p,content)=>{patches.set(corePath(p),content);},
        }});
        await tool.execute(randomUUID(),a,signal);
        return ctx.changes.propose(task.id,[...patches].map(([path,content])=>({path,content})),signal);
      },true,
    ),
    make(
      "core_inspect",
      "读取应用候选的补丁和失败报告，供恢复后的 Agent 定位问题。",
      Type.Object({id:Type.String()}),
      async a=>{const c=store.get('change',a.id);if(!c)throw new Error('候选不存在');return c;},
    ),
    make(
      "core_propose",
      "提出 runtime/GUI 的完整文件替换，在独立镜像内运行受保护的检查、回归和构建。通过后按设置自动发布或等待审阅",
      Type.Object({
        patches: Type.Array(
          Type.Object({ path: Type.String(), content: Type.String() }),
          { minItems: 1, maxItems: 12 },
        ),
      }),
      async (a, signal) => ctx.changes.propose(task.id, a.patches, signal),
      true,
    ),
    make(
      "task_finish",
      "提交最终结果。action 必须引用本任务成功调用的证据 ID；answer 只表示文本答复。不得将未经测试的实现宣称为完成",
      Type.Object({
        summary: Type.String({ minLength: 1, maxLength: 12000 }),
        kind: Type.Union([Type.Literal("answer"), Type.Literal("action")]),
        evidence: Type.Array(Type.String()),
      }),
      async (a) => {
        for (const id of a.evidence) {
          if (store.get<{ taskId: string }>("evidence", id)?.taskId !== task.id)
            throw new Error("证据不存在或属于其他任务");
        }
        if (a.kind === "action" && !a.evidence.length)
          throw new Error("行动结果必须有执行证据");
        ctx.finish?.(a);
        return { accepted: true, kind: a.kind, evidence: a.evidence };
      },
    ),
  ];
}
