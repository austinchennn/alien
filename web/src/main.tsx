import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
type Obj = Record<string, any>;
const labels: Record<string, string> = {
  queued: "排队中",
  running: "执行中",
  waiting_model: "等待本地模型",
  waiting_review: "等待独立验收",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
  candidate: "候选",
  tested: "自测通过",
  active: "已启用",
  quarantined: "已隔离",
  verified: "验收通过",
  published: "发布请求已提交",
};
const time = (v: string) =>
  new Date(v).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
function AlienIcon() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M8 15C8 6 32 6 32 15c0 10-8 20-12 20S8 25 8 15Z"
        fill="currentColor"
      />
      <path
        d="M12 17c1 6 4 8 7 6-1-5-4-7-7-6Zm16 0c-3-1-6 1-7 6 3 2 6 0 7-6Z"
        fill="#151b24"
      />
    </svg>
  );
}
function App() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const [token, setToken] = useState(
    () => hash.get("token") ?? sessionStorage.getItem("alien-token") ?? "",
  );
  const [state, setState] = useState<Obj>();
  const [page, setPage] = useState("总览");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [events, setEvents] = useState<Obj[]>([]);
  const [model, setModel] = useState<Obj>();
  const [sandbox, setSandbox] = useState<Obj>();
  const [goal, setGoal] = useState("");
  const [kind, setKind] = useState("task");
  const [acceptance, setAcceptance] = useState("");
  const [memory, setMemory] = useState("");
  const [config, setConfig] = useState<Obj>();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const api = useCallback(
    async (path: string, method = "GET", body?: unknown) => {
      const r = await fetch("/api/" + path, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "请求失败");
      return data;
    },
    [token],
  );
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api("state");
      setState(data);
      setConfig((old) => old ?? data.config);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, [api, token]);
  useEffect(() => {
    if (token) {
      sessionStorage.setItem("alien-token", token);
      if (location.hash) history.replaceState(null, "", location.pathname);
    }
    void refresh();
    const id = setInterval(() => void refresh(), 2000);
    return () => clearInterval(id);
  }, [token, refresh]);
  useEffect(() => {
    if (!token) return;
    const check = () => {
      void api("model/status")
        .then(setModel)
        .catch(() => {});
      void api("sandbox/status")
        .then(setSandbox)
        .catch(() => {});
    };
    check();
    const id = setInterval(check, 20000);
    return () => clearInterval(id);
  }, [api, token]);
  useEffect(() => {
    if (!selected) return;
    const check = () =>
      void api(`tasks/${selected}/events`)
        .then(setEvents)
        .catch((e) => setError(String(e)));
    check();
    const id = setInterval(check, 1200);
    return () => clearInterval(id);
  }, [selected, api]);
  async function action(fn: () => Promise<unknown>, message = "已保存") {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      setNotice(message);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function download(path: string) {
    await action(async () => {
      const r = await fetch("/api/files?path=" + encodeURIComponent(path), {
        headers: { Authorization: "Bearer " + token },
      });
      if (!r.ok) throw new Error("文件下载失败");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = path.split("/").at(-1) ?? "output";
      a.click();
      URL.revokeObjectURL(url);
    }, "文件已下载");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await action(async () => {
      const task = await api("tasks", "POST", {
        goal,
        kind,
        acceptance: acceptance.trim() ? JSON.parse(acceptance) : [],
      });
      setSelected(task.id);
      setGoal("");
      setPage("任务");
    }, "任务已入队");
  }
  const tasks: Obj[] = state?.tasks ?? [];
  const capabilities: Obj[] = state?.capabilities ?? [];
  const current = tasks.find((t) => t.id === selected);
  const nav = [
    "总览",
    "任务",
    "能力仓库",
    "记忆与 Skill",
    "自我修复",
    "系统设置",
  ];
  if (!state)
    return (
      <main className="login">
        <div className="login-card">
          <div className="logo big">
            <AlienIcon />
            <span>alien</span>
          </div>
          <h1>你的本地工作伙伴</h1>
          <p>
            输入启动窗口提供的本机访问密钥。使用「启动 Alien」时通常会自动填入。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("token");
              setToken(String(value));
            }}
          >
            <label>
              本机访问密钥
              <input name="token" type="password" required autoComplete="off" />
            </label>
            <button>进入控制台 →</button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  return (
    <div className="app">
      <aside>
        <div className="logo">
          <AlienIcon />
          <span>alien</span>
          <small>LOCAL</small>
        </div>
        <div className="space-label">个人工作空间</div>
        <nav>
          {nav.map((name, i) => (
            <button
              key={name}
              className={page === name ? "nav active" : "nav"}
              onClick={() => setPage(name)}
            >
              <span className="nav-icon">
                {["◈", "▤", "⌘", "▥", "⟳", "⚙"][i]}
              </span>
              {name}
              {name === "任务" &&
                tasks.filter((t) => t.status === "running").length > 0 && (
                  <b>1</b>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className={"dot " + (model?.ok ? "green" : "amber")} />
          <strong>{model?.ok ? "本地模型已连接" : "本地模型待连接"}</strong>
          <p>仅本地推理 · 无付费接口</p>
          <div className="version">
            ALIEN / 0.1.0 <span>↗</span>
          </div>
        </div>
      </aside>
      <div className="content">
        <header>
          <div>
            <span className="breadcrumb">工作空间</span>
            <span className="slash">/</span>
            {page}
          </div>
          <span className="privacy">◉ 数据保存在这台电脑</span>
        </header>
        <main>
          {error && (
            <div role="alert" className="banner error">
              {error}
              <button onClick={() => setError("")}>关闭</button>
            </div>
          )}
          {notice && (
            <div role="status" className="banner success">
              {notice}
              <button onClick={() => setNotice("")}>关闭</button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR LOCAL AGENT</div>
              <h1>
                {page === "总览" ? "让每一次任务，积累成下一次能力。" : page}
              </h1>
              <p>
                {page === "总览"
                  ? "任务、经验与自主改进，全部在你的电脑上运行。"
                  : page === "任务"
                    ? "查看真实执行步骤、工具结果和验证证据。"
                    : page === "能力仓库"
                      ? "每一项能力都有版本、测试记录与可回退的历史。"
                      : page === "自我修复"
                        ? "候选修改经过独立检查，通过后才可以发布。"
                        : "掌握 Alien 使用的资料与运行边界。"}
              </p>
            </div>
            <span className="outline-badge">● 本地运行</span>
          </div>
          {(page === "总览" || page === "任务") && (
            <>
              {page === "总览" && (
                <div className="stats">
                  <Stat
                    label="进行中的任务"
                    value={tasks.filter((t) => t.status === "running").length}
                    foot={`${tasks.filter((t) => t.status === "queued" || t.status === "waiting_model").length} 项等待执行`}
                    icon="↗"
                  />
                  <Stat
                    label="已完成任务"
                    value={tasks.filter((t) => t.status === "succeeded").length}
                    foot="有结果记录可追溯"
                    icon="✓"
                  />
                  <Stat
                    label="已启用能力"
                    value={
                      capabilities.filter((c) => c.state === "active").length
                    }
                    foot={`${capabilities.filter((c) => c.state === "tested").length} 项等待独立验收`}
                    icon="⌘"
                  />
                  <Stat
                    label="积累的 Skill"
                    value={new Set(state.skills.map((s: Obj) => s.id)).size}
                    foot={`${state.memories.length} 条有来源的记忆`}
                    icon="✦"
                  />
                </div>
              )}
              <div className="task-grid">
                <section className="card composer">
                  <div className="section-title">
                    <h2>交给 Alien 一项任务</h2>
                    <span>01 / 开始</span>
                  </div>
                  <form onSubmit={submit}>
                    <label className="sr-only" htmlFor="goal">
                      任务目标
                    </label>
                    <textarea
                      id="goal"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="例如：读取工作区内的课程资料，整理本周待办，并保存到 output/。"
                      required
                      maxLength={12000}
                    />
                    <div className="composer-controls">
                      <label>
                        任务类型
                        <select
                          value={kind}
                          onChange={(e) => setKind(e.target.value)}
                        >
                          <option value="task">日常任务</option>
                          <option value="develop">自主开发工具</option>
                          <option value="repair">修复能力</option>
                        </select>
                      </label>
                      <button disabled={busy}>
                        提交任务 <span>↗</span>
                      </button>
                    </div>
                    {kind !== "task" && (
                      <details>
                        <summary>独立验收用例（建议提供）</summary>
                        <p>
                          在开始开发前提供输入和期望输出。没有独立用例时，新工具只会进入「自测通过」，不会自动启用。
                        </p>
                        <textarea
                          className="code-input"
                          aria-label="独立验收用例"
                          value={acceptance}
                          onChange={(e) => setAcceptance(e.target.value)}
                          placeholder={
                            '[{"input":{"values":[2,3]},"expected":{"total":5}}]'
                          }
                        />
                      </details>
                    )}
                  </form>
                  <div className="quiet-note">
                    <span>◈</span>{" "}
                    执行前记录，完成后核验；模型尚未就绪时任务会保留。
                  </div>
                </section>
                <section className="card health">
                  <div className="section-title">
                    <h2>运行环境</h2>
                    <span>本机</span>
                  </div>
                  <Health
                    name="推理服务"
                    good={model?.ok}
                    text={
                      model?.ok
                        ? state.config.model.id || "已连接，待选择模型"
                        : "等待启动本地模型"
                    }
                  />
                  <Health
                    name="隔离执行环境"
                    good={sandbox?.ok}
                    text={
                      sandbox?.ok
                        ? "工具容器已就绪"
                        : "请在外星人运行环境准备脚本"
                    }
                  />
                  <Health
                    name="独立恢复进程"
                    good={!!state.recovery}
                    text={
                      state.recovery
                        ? "运行状态已记录"
                        : "开发运行 / 未由守护进程启动"
                    }
                  />
                  <button
                    className="text-button"
                    onClick={() => setPage("系统设置")}
                  >
                    配置运行环境 →
                  </button>
                </section>
              </div>
              <section className="card task-list">
                <div className="section-title">
                  <h2>{page === "总览" ? "最近的任务" : "任务记录"}</h2>
                  <span>{tasks.length} 项</span>
                </div>
                {!tasks.length ? (
                  <div className="empty">
                    <div>▤</div>
                    <h3>第一个任务，从这里开始</h3>
                    <p>提交目标后，这里会显示真实执行进度。</p>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>任务目标</th>
                          <th>状态</th>
                          <th>创建时间</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.slice(0, page === "总览" ? 8 : 100).map((t) => (
                          <tr
                            key={t.id}
                            onClick={() => {
                              setSelected(t.id);
                              setPage("任务");
                            }}
                            className={selected === t.id ? "selected" : ""}
                          >
                            <td>
                              <strong>{t.goal}</strong>
                              <small>
                                {t.kind === "task"
                                  ? "日常任务"
                                  : t.kind === "develop"
                                    ? "能力开发"
                                    : "自主修复"}
                              </small>
                            </td>
                            <td>
                              <Badge status={t.status} />
                            </td>
                            <td className="muted">{time(t.createdAt)}</td>
                            <td>↗</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              {page === "任务" && current && (
                <section className="card detail">
                  <div className="section-title">
                    <h2>执行记录</h2>
                    <div className="buttons">
                      {current.status === "running" ? (
                        <button
                          className="secondary"
                          onClick={() =>
                            action(
                              () => api(`tasks/${current.id}/cancel`, "POST"),
                              "已取消",
                            )
                          }
                        >
                          取消任务
                        </button>
                      ) : (
                        <button
                          className="secondary"
                          onClick={() =>
                            action(
                              () => api(`tasks/${current.id}/retry`, "POST"),
                              "已重新排队",
                            )
                          }
                        >
                          继续 / 重试
                        </button>
                      )}
                    </div>
                  </div>
                  <h3>{current.goal}</h3>
                  {current.result && (
                    <div className="result">{current.result}</div>
                  )}
                  {current.error && <p className="error">{current.error}</p>}
                  <div className="timeline">
                    {events.map((e) => (
                      <div key={e.seq} className="event">
                        <div className="event-dot" />
                        <div>
                          <div className="event-heading">
                            <strong>
                              {(
                                {
                                  queued: "任务已入队",
                                  running: "开始执行",
                                  waiting_model: "等待本地模型",
                                  turn: "模型处理",
                                  tool_start: "调用工具",
                                  tool_end: "工具返回",
                                  verified_tool: "执行证据已保存",
                                  assistant: "模型回复",
                                  verification: "最终核验",
                                  failed: "任务失败",
                                  recovered: "恢复任务",
                                  capability_candidate: "创建能力候选",
                                  capability_tested: "能力测试",
                                  core_candidate: "核心修复候选",
                                } as Obj
                              )[e.type] ?? e.type}
                            </strong>
                            <time>{time(e.createdAt)}</time>
                          </div>
                          <details>
                            <summary>
                              {String(
                                e.data?.tool ??
                                  e.data?.reason ??
                                  e.data?.error ??
                                  "查看记录",
                              )}
                            </summary>
                            <pre>{JSON.stringify(e.data, null, 2)}</pre>
                          </details>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {(page === "总览" || page === "任务") &&
            state.outputs?.length > 0 && (
              <section className="card">
                <div className="section-title">
                  <h2>任务产物</h2>
                  <span>output/</span>
                </div>
                {state.outputs.map((p: string) => (
                  <button
                    className="text-button"
                    key={p}
                    onClick={() => void download(p)}
                  >
                    {p} ↓
                  </button>
                ))}
              </section>
            )}
          {page === "能力仓库" && (
            <section className="card">
              <div className="section-title">
                <h2>自主开发的工具版本</h2>
                <span>{capabilities.length} 个版本</span>
              </div>
              <p className="muted">
                已复用 Pi 官方文件工具、会话与压缩；可在系统设置启用 Playwright
                MCP。下方显示 Alien 自己开发的能力。
              </p>
              {!capabilities.length ? (
                <Empty
                  text="还没有生成的工具"
                  detail="在任务中选择「自主开发工具」，Alien 会编写、隔离测试并保存候选版本。"
                />
              ) : (
                <div className="capabilities">
                  {capabilities.map((c) => (
                    <article
                      key={c.id + ":" + c.version}
                      className="capability"
                    >
                      <div>
                        <span className="tool-icon">⌘</span>
                        <Badge status={c.state} />
                      </div>
                      <h3>
                        {c.name}
                        <small>v{c.version}</small>
                      </h3>
                      <code>{c.id}</code>
                      <p>{c.description}</p>
                      <div className="test-score">
                        {c.report
                          ? `${c.report.passed}/${c.report.total} 用例通过`
                          : "等待测试"}{" "}
                        · {c.report?.independent ? "含独立验收" : "仅模型自测"}
                      </div>
                      {c.report?.error && (
                        <p className="error">{c.report.error}</p>
                      )}
                      <details>
                        <summary>代码与测试</summary>
                        <pre>{c.source}</pre>
                        <pre>{JSON.stringify(c.tests, null, 2)}</pre>
                      </details>
                      {c.state === "tested" && (
                        <button
                          className="secondary"
                          onClick={() => {
                            const value = prompt("输入独立验收用例 JSON 数组");
                            if (value)
                              void action(
                                () =>
                                  api("capabilities/promote", "POST", {
                                    id: c.id,
                                    version: c.version,
                                    cases: JSON.parse(value),
                                  }),
                                "验收已执行",
                              );
                          }}
                        >
                          独立验收并启用
                        </button>
                      )}
                      {c.report?.independent && c.state !== "active" && (
                        <button
                          className="text-button"
                          onClick={() =>
                            action(
                              () =>
                                api("capabilities/rollback", "POST", {
                                  id: c.id,
                                  version: c.version,
                                }),
                              "版本已恢复",
                            )
                          }
                        >
                          恢复此版本
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {page === "记忆与 Skill" && (
            <div className="two-columns">
              <section className="card">
                <div className="section-title">
                  <h2>有来源的记忆</h2>
                  <span>{state.memories.length} 条</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      await api("memories", "POST", { text: memory });
                      setMemory("");
                    });
                  }}
                >
                  <label>
                    添加明确偏好
                    <textarea
                      value={memory}
                      onChange={(e) => setMemory(e.target.value)}
                      required
                      placeholder="例如：我的工作区资料只读，输出统一保存在 output/。"
                    />
                  </label>
                  <button className="secondary" disabled={busy}>
                    保存偏好
                  </button>
                </form>
                {state.memories.map((m: Obj) => (
                  <article className="memory" key={m.id}>
                    <span className="tiny-label">
                      {m.source === "user" ? "用户明确设定" : "Agent 候选经验"}
                    </span>
                    <p>{m.text}</p>
                    <div>
                      <small>{time(m.createdAt)}</small>
                      <button
                        className="text-button danger"
                        onClick={() =>
                          action(
                            () => api("memories/" + m.id, "DELETE"),
                            "记忆已删除",
                          )
                        }
                      >
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </section>
              <section className="card">
                <div className="section-title">
                  <h2>可复用 Skill</h2>
                  <span>{state.skills.length} 个版本</span>
                </div>
                {!state.skills.length ? (
                  <Empty
                    text="经验会逐步积累"
                    detail="任务中可保存有适用条件与验证方法的 Skill，后续按需加载。"
                  />
                ) : (
                  state.skills.map((s: Obj) => (
                    <article className="memory" key={s.id + ":" + s.version}>
                      <h3>
                        {s.name}{" "}
                        <small>
                          {s.version === "pinned"
                            ? "内置开源 Skill"
                            : "v" + s.version}
                        </small>
                      </h3>
                      <details><summary>查看技能说明</summary><pre className="pre-wrap">{s.instructions}</pre></details>
                    </article>
                  ))
                )}
              </section>
            </div>
          )}
          {page === "自我修复" && (
            <>
              <div className="notice-card">
                <span>⟳</span>
                <div>
                  <h2>每次修改，都有恢复路径。</h2>
                  <p>
                    工具在容器中测试，应用候选由独立镜像运行固定验收。恢复、权限和费用根不在可自动改写范围内。
                  </p>
                </div>
              </div>
              <section className="card">
                <div className="section-title">
                  <h2>应用修复候选</h2>
                  <span>{state.changes.length} 项</span>
                </div>
                {!state.changes.length ? (
                  <Empty
                    text="暂无应用修复候选"
                    detail="工具与应用故障会留下可复现记录；修复任务可以提出候选并运行验收。"
                  />
                ) : (
                  state.changes.map((c: Obj) => (
                    <article className="memory" key={c.id}>
                      <Badge status={c.state} />
                      <p>{c.patches.map((p: Obj) => p.path).join("、")}</p>
                      <details>
                        <summary>查看验收报告与补丁</summary>
                        <pre>{c.report}</pre>
                        <pre>{JSON.stringify(c.patches, null, 2)}</pre>
                      </details>
                      {c.state === "verified" && (
                        <button
                          onClick={() =>
                            action(
                              () => api("changes/" + c.id + "/publish", "POST"),
                              "已请求守护进程发布",
                            )
                          }
                        >
                          发布通过验收的版本
                        </button>
                      )}
                    </article>
                  ))
                )}
              </section>
            </>
          )}
          {page === "系统设置" && config && (
            <div className="settings-grid">
              <section className="card">
                <div className="section-title">
                  <h2>本地模型</h2>
                  <span>零云端兜底</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(
                      () => api("config", "PUT", config),
                      "运行设置已保存",
                    );
                  }}
                >
                  <label>
                    本机服务地址
                    <input
                      value={config.model.baseUrl}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          model: { ...config.model, baseUrl: e.target.value },
                        })
                      }
                      placeholder="http://127.0.0.1:8000/v1"
                    />
                  </label>
                  <label>
                    模型 ID
                    <input
                      value={config.model.id}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          model: { ...config.model, id: e.target.value },
                        })
                      }
                      placeholder="填入本地服务 /v1/models 返回的 ID"
                      list="models"
                    />
                    <datalist id="models">
                      {model?.models?.map((m: string) => (
                        <option value={m} key={m} />
                      ))}
                    </datalist>
                  </label>
                  <div className="two-fields">
                    <label>
                      上下文预算
                      <input
                        type="number"
                        min={2048}
                        max={65536}
                        value={config.model.contextWindow}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            model: {
                              ...config.model,
                              contextWindow: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      输出预算
                      <input
                        type="number"
                        min={256}
                        value={config.model.maxOutputTokens}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            model: {
                              ...config.model,
                              maxOutputTokens: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={config.model.thinking}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          model: {
                            ...config.model,
                            thinking: e.target.checked,
                          },
                        })
                      }
                    />
                    启用模型思考（模型支持时）
                  </label>
                  <label>
                    允许读取的网站域名
                    <input
                      value={config.webDomains.join(", ")}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          webDomains: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="example.edu, docs.example.com"
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!config.browserEnabled}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          browserEnabled: e.target.checked,
                        })
                      }
                    />
                    启用现成 Playwright MCP（只读浏览器；需安装 Chromium）
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={config.autoRepair}
                      onChange={(e) =>
                        setConfig({ ...config, autoRepair: e.target.checked })
                      }
                    />
                    工具执行失败后自动创建修复任务
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={config.autoPublishCore}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          autoPublishCore: e.target.checked,
                        })
                      }
                    />
                    独立验收通过后自动发布应用候选
                  </label>
                  <button disabled={busy}>保存运行设置</button>
                </form>
              </section>
              <div>
                <section className="card">
                  <div className="section-title">
                    <h2>Apple Calendar</h2>
                    <span>
                      {state.calendarConfigured ? "已配置" : "只读连接"}
                    </span>
                  </div>
                  <p className="muted">
                    iCloud 日历可使用 Apple
                    账户与应用专用密码。凭据保存在本机加密文件中，不会提供给工具开发沙箱。
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        await api("calendar", "POST", { username, password });
                        setPassword("");
                      }, "日历凭据已保存在本机");
                    }}
                  >
                    <label>
                      Apple 账户
                      <input
                        type="email"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        autoComplete="username"
                      />
                    </label>
                    <label>
                      应用专用密码
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="off"
                      />
                    </label>
                    <button className="secondary" disabled={busy}>
                      保存日历连接
                    </button>
                  </form>
                </section>
                <section className="card">
                  <div className="section-title">
                    <h2>本机与恢复</h2>
                    <span>{state.system.platform}</span>
                  </div>
                  <p>
                    系统内存 {(state.system.ram / 1024 ** 3).toFixed(1)} GB ·
                    当前可用 {(state.system.freeRam / 1024 ** 3).toFixed(1)} GB
                  </p>
                  <p className="muted">
                    模型权重不随项目下载。请将模型文件准备好后，通过仓库的本地模型启动脚本启动服务。
                  </p>
                  <button
                    className="secondary"
                    onClick={() =>
                      action(
                        () => api("backup", "POST"),
                        "数据库一致性备份已保存到本机 backups 目录",
                      )
                    }
                  >
                    创建数据库备份
                  </button>
                </section>
              </div>
            </div>
          )}
          <footer>
            <span>ALIEN · OWN YOUR CAPABILITIES</span>
            <span>本地模型 / 本地数据 / 可验证的改进</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Stat({
  label,
  value,
  foot,
  icon,
}: {
  label: string;
  value: number;
  foot: string;
  icon: string;
}) {
  return (
    <section className="card stat">
      <div>
        {label}
        <span>{icon}</span>
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <p>{foot}</p>
    </section>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + status}>
      <span className="dot" />
      {labels[status] ?? status}
    </span>
  );
}
function Health({
  name,
  good,
  text,
}: {
  name: string;
  good?: boolean;
  text: string;
}) {
  return (
    <div className="health-row">
      <span className={"dot " + (good ? "green" : "amber")} />
      <div>
        <strong>{name}</strong>
        <small>{text}</small>
      </div>
      <span>{good ? "✓" : "—"}</span>
    </div>
  );
}
function Empty({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="empty">
      <div>◈</div>
      <h3>{text}</h3>
      <p>{detail}</p>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
