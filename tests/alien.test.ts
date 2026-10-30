import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  mkdir,
  readFile,
  writeFile,
  symlink,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { Script, createContext } from "node:vm";
import { once } from "node:events";
import { Store } from "../src/store.js";
import { defaults, now, type Task, type Config, type Conversation } from "../src/domain.js";
import {
  localEndpoint,
  workspacePath,
  validatePatches,
  validateConfig,
} from "../src/policy.js";
import { Registry } from "../src/registry.js";
import { Vault } from "../src/vault.js";
import { CalendarConnector, expandICS } from "../src/calendar.js";
import { Changes } from "../src/changes.js";
import { createApp } from "../src/app.js";
import { taskTools } from "../src/tools.js";
import { ModelGateway } from "../src/model.js";
import { createPiSession } from "../src/pi.js";
import { selectContext } from "../src/runtime/context.js";

const root = resolve(".");
const temp = () => mkdtemp(join(tmpdir(), "alien-test-"));
const task = (cases: Task["acceptance"] = []): Task => ({
  id: crypto.randomUUID(),
  goal: "test",
  kind: "develop",
  status: "running",
  acceptance: cases,
  attempts: 0,
  createdAt: now(),
  updatedAt: now(),
});
// Deliberately a test double: production isolation is verified separately in container.test.ts.
const fakeSandbox = {
  async execute(source: string, input: unknown) {
    return JSON.parse(
      JSON.stringify(
        new Script("(" + source + ")(input)").runInContext(
          createContext({ input }),
          { timeout: 200 },
        ),
      ),
    );
  },
  async health() {
    return { ok: true, detail: "test double" };
  },
};
const sum = {
  id: "sum_values",
  name: "Sum",
  description: "Sums integer values",
  source: "x=>({total:x.values.reduce((a,b)=>a+b,0)})",
  inputSchema: {
    type: "object",
    required: ["values"],
    properties: { values: { type: "array", items: { type: "number" } } },
  },
  outputSchema: {
    type: "object",
    required: ["total"],
    properties: { total: { type: "number" } },
  },
  tests: [
    { input: { values: [] }, expected: { total: 0 } },
    { input: { values: [1, 2] }, expected: { total: 3 } },
    { input: { values: [-2, 3] }, expected: { total: 1 } },
  ],
};

test("local-only model policy rejects cloud, credentials and endpoint smuggling", () => {
  assert.equal(localEndpoint("http://127.0.0.1:11434/v1").port, "11434");
  for (const url of [
    "https://api.openai.com/v1",
    "http://localhost:11434/v1",
    "http://127.0.0.1.evil.test/v1",
    "http://user:pass@127.0.0.1/v1",
    "http://127.0.0.1/v1?q=x",
    "file:///v1",
  ])
    assert.throws(() => localEndpoint(url));
  const cfg = structuredClone(defaults);
  cfg.model.maxOutputTokens = cfg.model.contextWindow;
  assert.throws(() => validateConfig(cfg));
  assert.throws(() =>
    validatePatches([{ path: "src/policy.ts", content: "bypass" }]),
  );
  assert.throws(() =>
    validatePatches([
      { path: "src/runtime/../../policy.ts", content: "bypass" },
    ]),
  );
});

test("workspace blocks traversal, absolute paths and symlink escapes", async () => {
  const dir = await temp();
  try {
    await mkdir(join(dir, "output"));
    await writeFile(join(dir, "input.txt"), "hello");
    assert.equal(
      await workspacePath(dir, "input.txt"),
      join(await realpath(dir), "input.txt"),
    );
    await assert.rejects(workspacePath(dir, "../secret"));
    await assert.rejects(workspacePath(dir, "C:\\secret"));
    if (process.platform !== "win32") {
      await symlink(tmpdir(), join(dir, "link"));
      await assert.rejects(workspacePath(dir, "link/secret", true));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("durable event cursor and record transaction survive reopen", async () => {
  const dir = await temp();
  let store = new Store(dir);
  try {
    store.put("memory", "a", { text: "remember" });
    const first = store.event("task", "start", {});
    store.event("task", "done", { ok: true });
    assert.throws(() =>
      store.transaction(() => {
        store.put("memory", "b", {});
        throw Error("rollback");
      }),
    );
    assert.equal(store.get("memory", "b"), undefined);
    store.close();
    store = new Store(dir);
    assert.deepEqual(store.get("memory", "a"), { text: "remember" });
    assert.deepEqual(
      store.events("task", first.seq).map((e) => e.type),
      ["done"],
    );
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("self-extension needs independent acceptance; failed replacement keeps working version; rollback restores it", async () => {
  const dir = await temp(),
    store = new Store(dir),
    registry = new Registry(store, fakeSandbox);
  try {
    const candidate = await registry.propose(task(), sum);
    assert.equal(candidate.state, "tested");
    assert.equal(registry.active().length, 0);
    const accepted = await registry.promote(sum.id, 1, [
      { input: { values: [100, -40, 2] }, expected: { total: 62 } },
    ]);
    assert.equal(accepted.state, "active");
    const broken = await registry.propose(
      task([{ input: { values: [9] }, expected: { total: 9 } }]),
      { ...sum, source: "x=>({total:0})" },
    );
    assert.equal(broken.state, "quarantined");
    assert.deepEqual(
      await registry.invoke(registry.find(sum.id)!, { values: [2, 8] }),
      { total: 10 },
    );
    const next = await registry.propose(
      task([{ input: { values: [1.5, 2] }, expected: { total: 3.5 } }]),
      sum,
    );
    assert.equal(next.state, "active");
    assert.equal(
      registry.rollback(sum.id, accepted.version).version,
      accepted.version,
    );
    assert.equal(registry.active().length, 1);
    await assert.rejects(registry.invoke(accepted, { values: "bad" }));
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Pi write/edit perform real bounded I/O, preserve evidence, and hide independent test values", async () => {
  const dir = await temp(),
    store = new Store(dir);
  await mkdir(join(dir, "workspace", "output"), { recursive: true });
  try {
    const t = task([{ input: { values: [7] }, expected: { total: 7 } }]);
    const registry = new Registry(store, fakeSandbox);
    const tools = taskTools({
      store,
      task: t,
      root,
      config: () => defaults,
      registry,
      changes: new Changes(
        store,
        { evaluate: async () => "" },
        () => defaults,
        root,
      ),
      calendar: new CalendarConnector(new Vault(dir)),
    });
    const run = async (name: string, args: unknown, id = crypto.randomUUID()) =>
      tools.find((t) => t.name === name)!.execute(id, args);
    await run(
      "write",
      { path: "output/note.txt", content: "before" },
      "write_1",
    );
    await run("edit", {
      path: "output/note.txt",
      edits: [{ oldText: "before", newText: "after" }],
    });
    assert.equal(
      await readFile(join(dir, "workspace", "output", "note.txt"), "utf8"),
      "after",
    );
    await assert.rejects(run("write", { path: "../secret", content: "bad" }));
    await assert.rejects(
      run("task_finish", {
        summary: "invented",
        kind: "action",
        evidence: ["made_up"],
      }),
    );
    await run("task_finish", {
      summary: "saved",
      kind: "action",
      evidence: ["write_1"],
    });
    const result = await run("tools_develop", sum);
    assert(!JSON.stringify(result).includes('"acceptance"'));
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("calendar expands recurrence with cancellation and validates timezone and range", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:r1",
    "DTSTART:20261001T120000Z",
    "DTEND:20261001T130000Z",
    "RRULE:FREQ=DAILY;COUNT=3",
    "SUMMARY:Meeting",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:r1",
    "RECURRENCE-ID:20261002T120000Z",
    "DTSTART:20261002T120000Z",
    "DTEND:20261002T130000Z",
    "STATUS:CANCELLED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const events = expandICS(ics, "2026-10-01T00:00:00Z", "2026-10-05T00:00:00Z");
  assert.equal(events.length, 2);
  assert(events[1]!.start.startsWith("2026-10-03"));
  assert.throws(() => expandICS(ics, "bad", "2026-10-01"));
  assert.throws(() =>
    expandICS(ics, "2026-01-01T00:00:00Z", "2026-12-01T00:00:00Z"),
  );
});

test("credential vault stores authenticated ciphertext; tampering is detected", async () => {
  const dir = await temp();
  try {
    const vault = new Vault(dir);
    vault.put("calendar", { password: "test-secret" });
    const file = join(dir, "secret-calendar.bin");
    const data = await readFile(file);
    assert(!data.includes(Buffer.from("test-secret")));
    assert.deepEqual(new Vault(dir).get("calendar"), {
      password: "test-secret",
    });
    data[data.length - 1] ^= 1;
    await writeFile(file, data);
    assert.throws(() => vault.get("calendar"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("user memory outranks matching agent memories and expired entries are omitted", () => {
  const m = (
    id: string,
    text: string,
    source: "user" | "agent",
    expiresAt?: string,
  ) => ({ id, text, source, createdAt: now(), expiresAt });
  const result = selectContext(
    "test",
    [
      m("a", "test test", "agent"),
      m("u", "user preference", "user"),
      m("e", "expired", "user", "2000-01-01"),
    ],
    [],
    5000,
  );
  assert(result.indexOf("user preference") < result.indexOf("test test"));
  assert(!result.includes("expired"));
});

test("core candidate artifacts reject post-verification tampering", async () => {
  const dir = await temp(),
    store = new Store(dir);
  let out = "";
  const changes = new Changes(
    store,
    {
      evaluate: async (_input, output) => {
        out = output;
        await mkdir(join(output, "server"));
        await writeFile(join(output, "server", "main.js"), "// checked");
        return "checks passed";
      },
    },
    () => defaults,
    root,
  );
  try {
    const c = await changes.propose("task", [
      { path: "src/runtime/context.ts", content: "export{};" },
    ]);
    assert.equal(c.state, "verified");
    await writeFile(join(out, "server", "main.js"), "tampered");
    await assert.rejects(changes.publish(c.id));
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("HTTP API requires local token, validates tasks, and waits honestly when model is absent", async () => {
  const dir = await temp(),
    instance = await createApp({
      dir,
      root,
      token: "test-token",
      sandbox: fakeSandbox,
      startEngine: false,
    });
  try {
    assert.equal((await instance.app.inject("/api/state")).statusCode, 401);
    assert.equal(
      (
        await instance.app.inject({
          url: "/api/state",
          headers: { authorization: "Bearer test-token", host: "evil.test" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await instance.app.inject({
          url: "/api/state",
          headers: {
            authorization: "Bearer test-token",
            origin: "https://evil.test",
          },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await instance.app.inject({
          url: "/api/tasks",
          method: "POST",
          headers: { authorization: "Bearer test-token" },
          payload: { goal: "" },
        })
      ).statusCode,
      400,
    );
    instance.config().model.baseUrl = "http://127.0.0.1:1/v1";
    const response = await instance.app.inject({
      url: "/api/tasks",
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      payload: { goal: "test queue" },
    });
    assert.equal(response.statusCode, 200);
    const id = response.json().id;
    await eventually(
      () => instance.store.get<Task>("task", id)?.status === "waiting_model",
    );
    const backup = await instance.app.inject({
      url: "/api/backup",
      method: "POST",
      headers: { authorization: "Bearer test-token" },
    });
    assert.equal(backup.statusCode, 200);
  } finally {
    await instance.app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("projects group persistent conversations and forks preserve their message prefix", async () => {
  const dir = await temp();
  const instance = await createApp({
    dir,
    root,
    token: "test-token",
    sandbox: fakeSandbox,
    startEngine: false,
  });
  const headers = { authorization: "Bearer test-token" };
  try {
    instance.config().model.baseUrl = "http://127.0.0.1:1/v1";
    const projectResponse = await instance.app.inject({
      url: "/api/projects",
      method: "POST",
      headers,
      payload: { name: "Local project" },
    });
    assert.equal(projectResponse.statusCode, 200);
    const project = projectResponse.json();
    const chatResponse = await instance.app.inject({
      url: "/api/conversations",
      method: "POST",
      headers,
      payload: { projectId: project.id },
    });
    assert.equal(chatResponse.statusCode, 200);
    const chat = chatResponse.json();
    const messageResponse = await instance.app.inject({
      url: `/api/conversations/${chat.id}/messages`,
      method: "POST",
      headers,
      payload: { content: "First turn" },
    });
    assert.equal(messageResponse.statusCode, 200);
    const message = messageResponse.json().message;
    await eventually(
      () => instance.store.get<Task>("task", messageResponse.json().task.id)?.status === "waiting_model",
    );
    const forkResponse = await instance.app.inject({
      url: `/api/conversations/${chat.id}/fork`,
      method: "POST",
      headers,
      payload: { messageId: message.id },
    });
    assert.equal(forkResponse.statusCode, 200);
    const fork = forkResponse.json();
    assert.equal(fork.forkedFrom, chat.id);
    assert.equal(fork.projectId, project.id);
    assert.equal(fork.messages.length, 1);
    assert.equal(fork.messages[0].content, "First turn");
    const loaded = await instance.app.inject({
      url: `/api/conversations/${fork.id}`,
      headers,
    });
    assert.equal(loaded.json().messages[0].id, message.id);
    const metrics = await instance.app.inject({ url: "/api/metrics", headers });
    assert.equal(metrics.statusCode, 200);
    assert.equal(metrics.json().maxConcurrentAgents, 1);
    assert.equal(typeof metrics.json().cpuPercent, "number");
  } finally {
    await instance.app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function eventually(predicate: () => boolean, ms = 10000) {
  const end = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > end) throw Error("Timed out waiting for task");
    await new Promise((r) => setTimeout(r, 20));
  }
}
async function fakeModel() {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    if (req.url === "/v1/models") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "test-local" }] }));
      return;
    }
    if (req.url !== "/v1/chat/completions") {
      res.statusCode = 404;
      res.end();
      return;
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push(body);
    if (JSON.stringify(body.messages).includes("plain chat reply test")) {
      res.setHeader("content-type", "text/event-stream");
      res.write("data: " + JSON.stringify({
        id: "chat-test", object: "chat.completion.chunk", created: 1,
        model: "test-local", choices: [{ index: 0, delta: { role: "assistant", content: "CHAT_ANSWER_OK" }, finish_reason: null }],
      }) + "\n\n");
      res.write("data: " + JSON.stringify({
        id: "chat-test", object: "chat.completion.chunk", created: 1,
        model: "test-local", choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      }) + "\n\n");
      res.end("data: [DONE]\n\n");
      return;
    }
    const previous = body.messages.filter((m: any) => m.role === "tool");
    const calls = [
      { name: "tools_load", args: { groups: ["workspace"] } },
      {
        name: "write",
        args: {
          path: "output/integration.txt",
          content: "created by real Pi tools",
        },
      },
      {
        name: "task_finish",
        args: {
          summary: "文件已写入并核验",
          kind: "action",
          evidence: ["call_1"],
        },
      },
    ];
    const call = calls[previous.length] ?? calls[2]!;
    res.setHeader("content-type", "text/event-stream");
    const send = (delta: unknown, finish_reason: unknown) =>
      res.write(
        "data: " +
          JSON.stringify({
            id: "test",
            object: "chat.completion.chunk",
            created: 1,
            model: "test-local",
            choices: [{ index: 0, delta, finish_reason }],
          }) +
          "\n\n",
      );
    send(
      {
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "call_" + previous.length,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          },
        ],
      },
      null,
    );
    send({}, "tool_calls");
    res.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

test("full Pi SDK executes a real tool task through a local OpenAI-compatible endpoint and restores session", async () => {
  const dir = await temp(),
    model = await fakeModel(),
    instance = await createApp({
      dir,
      root,
      token: "test",
      sandbox: fakeSandbox,
      startEngine: false,
    });
  try {
    const cfg: Config = {
      ...structuredClone(defaults),
      model: { ...defaults.model, baseUrl: model.baseUrl, id: "test-local" },
    };
    const response = await instance.app.inject({
      url: "/api/config",
      method: "PUT",
      headers: { authorization: "Bearer test" },
      payload: cfg,
    });
    assert.equal(response.statusCode, 200);
    const t = instance.engine.create("创建一个测试文件");
    await eventually(() =>
      ["succeeded", "failed"].includes(
        instance.store.get<Task>("task", t.id)?.status ?? "",
      ),
    );
    const final = instance.store.get<Task>("task", t.id)!;
    assert.equal(final.status, "succeeded", final.error);
    assert.equal(
      await readFile(
        join(dir, "workspace", "output", "integration.txt"),
        "utf8",
      ),
      "created by real Pi tools",
    );
    const chat: Conversation = {
      id: "plain-chat-test", title: "Plain chat", createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), messages: [],
    };
    instance.store.put("conversation", chat.id, chat);
    const chatTask = instance.engine.create("plain chat reply test", "task", [], undefined, 0, chat.id);
    chat.messages.push({
      id: "plain-chat-message", role: "user", content: "plain chat reply test",
      createdAt: new Date().toISOString(), taskId: chatTask.id,
    });
    instance.store.put("conversation", chat.id, chat);
    await eventually(() => instance.store.get<Task>("task", chatTask.id)?.status === "succeeded");
    assert.equal(instance.store.get<Task>("task", chatTask.id)?.result, "CHAT_ANSWER_OK");
    assert.equal(instance.store.get<Conversation>("conversation", chat.id)?.messages.at(-1)?.content, "CHAT_ANSWER_OK");
    assert(model.requests.length >= 3);
    assert(model.requests.every((r) => r.model === "test-local"));
    const saved = instance.store.get<{ path: string }>("pi_session", t.id)!;
    assert((await readFile(saved.path, "utf8")).includes("integration.txt"));
    const session = await createPiSession({
      root,
      store: instance.store,
      task: t,
      config: cfg,
      gateway: new ModelGateway(() => cfg),
      system: "test",
      tools: [],
      skills: [],
    });
    assert(session.messages.some((m) => m.role === "toolResult"));
    session.dispose();
  } finally {
    await instance.app.close();
    await model.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("native Pi MCP discovers the installed Playwright server without downloading or launching a browser", async () => {
  const dir = await temp(),
    store = new Store(dir);
  await mkdir(join(dir, "workspace"), { recursive: true });
  const cfg = {
    ...structuredClone(defaults),
    browserEnabled: true,
    webDomains: ["example.com"],
    model: { ...defaults.model, id: "test-local" },
  };
  const session = await createPiSession({
    root,
    store,
    task: task(),
    config: cfg,
    gateway: new ModelGateway(() => cfg),
    system: "test",
    tools: [],
    skills: [],
  });
  try {
    const search = session.agent.state.tools.find(
      (t) => t.name === "tool_search",
    );
    assert(search, "tool_search should be registered");
    await session.extensionRunner.emitToolCall({
      type: "tool_call",
      toolCallId: "discover",
      toolName: "tool_search",
      input: { query: "browser navigate", limit: 2 },
    });
    const result = await search.execute("discover", {
      query: "browser navigate",
      limit: 2,
    });
    assert(
      JSON.stringify(result).includes("mcp__browser__browser_navigate"),
      JSON.stringify(result),
    );
    assert(
      !session.getToolDefinition("mcp__browser__browser_evaluate"),
      "arbitrary browser JS is not exposed",
    );
  } finally {
    await session.extensionRunner.emit({
      type: "session_shutdown",
      reason: "quit",
    });
    session.dispose();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('Ollama model selection keeps the harness context within the selected server budget',async()=>{
  const dir=await temp();await writeFile(join(dir,'model.json'),'\uFEFF'+JSON.stringify({Context:4096,Model:'alien-local:latest'}));
  const instance=await createApp({dir,root,token:'test',sandbox:fakeSandbox,startEngine:false});
  try{assert.equal(instance.config().model.contextWindow,4096);assert(instance.config().model.maxOutputTokens<=2048);}
  finally{await instance.app.close();await rm(dir,{recursive:true,force:true});}
});
