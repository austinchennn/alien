# Alien：现成组件调研与复用清单

调研日期：2026-10-29。核对项目官方仓库、官方文档和已发布 npm 包；以下“可用”表示功能与许可符合选型方向，不代表已在用户的外星人电脑上实测。

## 结论

Pi 有现成实现，应使用完整的 `pi-coding-agent` SDK，而不只接入底层 Agent loop。Alien 应是围绕 Pi 的本地控制台和运行管理层。通用编码工具、会话、上下文压缩、Skill 加载和 MCP 客户端直接复用。只为用户特有的任务验收、自扩展发布、故障恢复、安装与中文 GUI 编写连接代码。

首选组合：本地模型 → Ollama → Pi Coding Agent SDK → 按需加载的开源 Skill / 本地 MCP → Alien GUI、任务记录和版本管理。

## 优先采用

| 组件 | 能复用的能力 | 免费与许可条件 | Alien 的用法 |
| --- | --- | --- | --- |
| [Pi 官方项目](https://github.com/earendil-works/pi) | read / write / edit / bash / grep / find / ls；AgentSession；SessionManager；压缩；扩展；Skill | MIT；框架免费，模型由我们单独指定本机服务 | 主要运行底座。禁用云端回退、安装遥测与外部模型目录刷新 |
| [Pi MCP 集成](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/14-codemode-mcp.ts) | 标准 MCP 连接、工具搜索、按需暴露、资源读取 | Pi 的 MIT 许可；服务器是否收费需逐个检查 | 复用 createMcpExtension / createToolSearchExtension；避免另写协议客户端 |
| [Superpowers](https://github.com/obra/superpowers) | systematic-debugging、verification-before-completion、writing-skills 等现成流程 | MIT；这些 Markdown 流程本身不需要付费 API；可通过 Pi package 安装 | 挑选调试、验收相关 Skill，按需读入；不整包强制加载全部流程 |
| [Playwright CLI](https://github.com/microsoft/playwright-cli) | 浏览器导航、页面检查、截图、测试及现成 Skill | Apache-2.0；本机浏览器执行不收 API 费 | 有命令执行沙箱时优先选 CLI + Skill，降低工具声明占用 |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | 可访问性快照、浏览器工具与持续浏览器会话 | Apache-2.0；本机运行免费 | 需要结构化交互时使用；不再自写浏览器自动化引擎 |
| [MCP reference servers](https://github.com/modelcontextprotocol/servers) | filesystem、git、fetch、memory、time | 仓库现行说明为新贡献 Apache-2.0、已有代码 MIT；以所安装版本的 LICENSE 为准 | 当 Pi 内置能力不足或需供其他客户端使用时接入。已有 read/edit 不再叠加重复 filesystem MCP |
| [vdirsyncer](https://github.com/pimutils/vdirsyncer) | CalDAV / CardDAV 同步到本地文件 | BSD-3-Clause；iCloud 使用已有 Apple 账号和应用专用密码 | Apple Calendar 的现成同步方案；Windows 可放在 WSL。简单只读接入可继续复用现成 CalDAV 库 |
| [QMD](https://github.com/tobi/qmd) | 本地 BM25、向量检索、重排、MCP | MIT；语义能力使用本地 GGUF 模型，首次运行可能自动下载 | 可选知识库插件。首版轻量记忆不强制引入，不自动下载这些模型 |

Pi CLI 默认装载内建扩展，与 SDK 有区别：SDK 要显式加入 MCP、tool_search 等扩展并调用 `session.bindExtensions()`。Pi 的默认压缩保留量面向大上下文，需要为本地 8K / 16K 配置缩小的 reserveTokens / keepRecentTokens，不能照搬默认值。

## 已有完整系统：不是只有从零实现一条路

### Hermes Agent

[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)，MIT。官方已提供记忆、历史检索、经验生成 Skill、MCP、定时任务、消息入口和桌面界面，并允许自己的模型端点。

如果唯一目标是“尽快得到一个会记忆、写 Skill 的个人 Agent”，它是优先验证的整套候选。官方宣传的 self-improving 主要是经验和 Skill 学习，不能据此推断它能可靠地改写自身核心、验证所有修改、修复所有崩溃。其 Portal、托管浏览器等外部服务不进入 Alien 的免费配置。

### OpenClaw

[openclaw/openclaw](https://github.com/openclaw/openclaw)，MIT。已有网关、控制台、渠道、Skill、会话与本地模型配置。[官方本地模型文档](https://docs.openclaw.ai/gateway/local-models)支持 Ollama 等本地兼容端点。

适合希望复用完整个人助手产品的路线。对于当前明确希望围绕 Pi、尽量控制资源占用并定制自修复边界的 Alien，先选 Pi SDK；不把 OpenClaw、Hermes、Pi 三套循环同时塞进一个进程。这里是架构选择，不是已经测出某框架更快的性能结论。

## Skill 来源与筛选

1. [badlogic/pi-skills](https://github.com/badlogic/pi-skills)：MIT，已经有 browser-tools、YouTube transcript、日历 / Drive / Gmail CLI 等。Google Calendar CLI 不等于 Apple Calendar。Brave Search 与 Groq 转录依赖外部 API，不进入零付费默认集。
2. [obra/superpowers](https://github.com/obra/superpowers)：官方 README 已列出 `pi install git:github.com/obra/superpowers`。挑选需要的 Skill 即可，避免小模型每次承担整套长流程。
3. [anthropics/skills](https://github.com/anthropics/skills)：许多示例是 Apache-2.0，但官方明确标注 docx、pdf、pptx、xlsx 为 source-available、并非开源。不能把整个仓库当作统一开源许可整包搬运。
4. [Agent Skills 标准](https://agentskills.io/specification)：用 SKILL.md + scripts / references 目录。Alien 自己生成的 Skill 应遵循这个格式，方便 Pi 和其他工具复用。

Skill 只有操作说明，不会凭空增加小模型的推理能力；工具提供可执行能力，MCP 负责接入，模型负责选择和规划。自进化还需要实际执行、测试与反馈。

## MCP 从哪里找

- [官方 MCP Registry](https://registry.modelcontextprotocol.io/)：先发现服务器，再回到作者仓库核对维护状态、许可证、依赖、联网与费用。
- [官方 reference servers](https://github.com/modelcontextprotocol/servers)：优先看 git、fetch、time、memory，避免重复的工具集合。
- [mcporter](https://github.com/openclaw/mcporter)：MIT，可以把 MCP 映射到 TypeScript 或 CLI。Pi 已有 MCP 集成时无需同时引入；用于 CLI 工作流才考虑。

官方 reference servers 自己注明它们是协议参考实现，不应把“官方示例”直接等同于已完成生产部署验证。

## 不重写与仍需自己写的部分

| 直接复用 | Alien 自己负责 |
| --- | --- |
| Pi AgentSession、工具调度、SessionManager、压缩 | 中文任务界面、进度展示、安装流程 |
| Pi 编码工具的实现 | 把工具执行限制在工作区 / 容器，保存执行证据 |
| Pi Skill 标准加载、选定的开源 Skill | 用户偏好与 Agent 经验分源，生成版本与记录反馈 |
| Pi MCP 客户端、本地开源 MCP server | 选型、固定版本、启用配置、故障状态 |
| Playwright、CalDAV 库、本地检索库 | 工具候选的独立验收、试运行、版本切换、回滚 |

“自己写工具 / Skill / 记忆”可以实现为运行能力；“以后永远不需要人修”不能保证。尤其模型服务、GPU 驱动、系统权限和恢复底座损坏时，Agent 未必仍能运行。Alien 应保留独立恢复入口，清楚展示哪些能力已经过测试。

## 落地顺序

1. 将底座升级为完整 Pi Coding Agent SDK，复用会话、压缩和工具，不继续扩写重复基础功能。
2. 固定一组免费、本地可执行的工具与 Skill，保留来源、版本和许可证。
3. MCP 工具按需搜索与加载，默认不引入收费搜索、托管浏览器或云端模型。
4. 验证“提出工具 → 自测 → 独立验收 → 运行 → 故障 → 修复 / 回滚”的闭环，再对外宣称支持。
5. 模型权重由用户另行准备；安装 Alien 不顺带下载模型。
