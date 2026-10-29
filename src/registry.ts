import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Ajv } from "ajv";
import type { Capability, Task, TestCase } from "./domain.js";
import { errorText, now } from "./domain.js";
import { Store } from "./store.js";
import { safeId } from "./policy.js";
import type { Sandbox } from "./sandbox.js";
const ajv = new Ajv({ strict: false, allErrors: true });
export class Registry {
  constructor(
    private store: Store,
    private sandbox: Sandbox,
  ) {}
  active() {
    return this.store
      .list<Capability>("capability")
      .filter((c) => c.state === "active");
  }
  versions(id: string) {
    return this.store
      .list<Capability>("capability")
      .filter((c) => c.id === id)
      .sort((a, b) => b.version - a.version);
  }
  find(id: string, version?: number) {
    return this.versions(id).find((c) =>
      version ? c.version === version : c.state === "active",
    );
  }
  async propose(
    task: Task,
    input: {
      id: string;
      name: string;
      description: string;
      source: string;
      inputSchema: Record<string, unknown>;
      outputSchema: Record<string, unknown>;
      tests: TestCase[];
    },
    signal?: AbortSignal,
  ) {
    safeId(input.id);
    if (input.tests.length < 3 || input.tests.length > 20)
      throw new Error("至少提供 3 个自测用例，最多 20 个");
    if (input.source.length > 40000) throw new Error("源码过大");
    if (input.inputSchema.type !== "object")
      throw new Error("工具输入 schema 必须为 object");
    const v = (this.versions(input.id)[0]?.version ?? 0) + 1;
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const c: Capability = {
      ...input,
      version: v,
      hash,
      originTask: task.id,
      state: "candidate",
      acceptance: task.acceptance,
      createdAt: now(),
    };
    this.store.put("capability", `${c.id}:${v}`, c);
    this.store.event(task.id, "capability_candidate", {
      id: c.id,
      version: v,
      hash,
    });
    let passed = 0;
    const tests = [...c.tests, ...c.acceptance];
    try {
      const inputCheck = ajv.compile(c.inputSchema),
        outputCheck = ajv.compile(c.outputSchema);
      for (const t of tests) {
        if (!inputCheck(t.input)) throw new Error("测试输入不符合 schema");
        const out = await this.sandbox.execute(c.source, t.input, signal);
        if (!outputCheck(out) || !isDeepStrictEqual(out, t.expected))
          throw new Error(`第 ${passed + 1} 个测试未通过`);
        passed++;
      }
      c.report = {
        passed,
        total: tests.length,
        independent: c.acceptance.length > 0,
      };
      c.state = c.acceptance.length ? "active" : "tested";
      if (c.state === "active")
        for (const old of this.versions(c.id).filter(
          (x) => x.state === "active",
        )) {
          old.state = "tested";
          this.store.put("capability", `${old.id}:${old.version}`, old);
        }
    } catch (e) {
      c.state = "quarantined";
      c.report = {
        passed,
        total: tests.length,
        error: errorText(e),
        independent: c.acceptance.length > 0,
      };
    }
    this.store.put("capability", `${c.id}:${v}`, c);
    this.store.event(task.id, "capability_tested", {
      id: c.id,
      version: v,
      state: c.state,
      report: c.report,
    });
    return c;
  }
  async invoke(c: Capability, input: unknown, signal?: AbortSignal) {
    if (!["active", "tested"].includes(c.state))
      throw new Error("该工具未通过测试");
    if (!ajv.validate(c.inputSchema, input))
      throw new Error("工具输入校验失败");
    const value = await this.sandbox.execute(c.source, input, signal);
    if (!ajv.validate(c.outputSchema, value))
      throw new Error("工具输出校验失败");
    return value;
  }
  async promote(id: string, version: number, cases: TestCase[]) {
    if (!cases.length) throw new Error("请提供独立验收用例后启用");
    const c = this.find(id, version);
    if (!c) throw new Error("工具不存在");
    const task: Task = {
      id: randomUUID(),
      goal: "用户验收 " + id,
      kind: "develop",
      status: "running",
      createdAt: now(),
      updatedAt: now(),
      attempts: 0,
      acceptance: cases,
    };
    return this.propose(task, { ...c, tests: c.tests });
  }
  rollback(id: string, version: number) {
    const c = this.find(id, version);
    if (!c || !c.report?.independent || c.report.passed !== c.report.total)
      throw new Error("只能回退到独立验收通过的版本");
    for (const old of this.versions(id).filter((x) => x.state === "active")) {
      old.state = "tested";
      this.store.put("capability", `${id}:${old.version}`, old);
    }
    c.state = "active";
    this.store.put("capability", `${id}:${version}`, c);
    return c;
  }
}
