# 👽 Alien

在自己的电脑上运行的个人 Agent：本地模型、中文对话工作区、项目归档与消息分叉、任务进度、记忆、标准 Skill、现成 MCP，以及有测试和回滚的工具自扩展。侧栏实时显示活动 Agent 数、CPU/RAM 和 GPU/显存负载。运行模型不使用收费 API。

**底座直接复用 Pi Coding Agent SDK。** 已复用 Pi 会话、恢复、上下文压缩、Skill 加载、MCP 集成与文件工具；内置精选 Superpowers Skill 和本机 Playwright MCP。选型与其他现成项目对比见 [复用调研](docs/reuse.md)。

## Windows：下载并安装

### 1. 双击安装器

[**下载 Install-Alien.cmd**](https://github.com/austinchennn/alien/releases/latest/download/Install-Alien.cmd) · [完整安装包](https://github.com/austinchennn/alien/releases/latest/download/Alien-Windows.zip)

双击安装器，会校验并下载应用、免费 Node.js 运行环境，安装依赖、构建界面并保存独立救援副本。默认位置：`%LOCALAPPDATA%\Alien`。首次需联网下载软件，**不下载任何模型权重**。

源码下载用户也可以双击 `setup.cmd`。首次安装完成后，桌面会出现 Alien 快捷方式。

### 2. 安装 Ollama 并选择模型

安装 [Ollama for Windows](https://ollama.com/download/windows)。Ollama 以当前 Windows 用户运行，在后台提供本机服务，不需要管理员权限或 WSL。然后在终端下载模型，例如：

```powershell
ollama pull qwen3.5:4b
```

双击应用文件夹中的 **Configure-Model.cmd**，输入已下载的 Ollama 模型名和上下文长度。脚本会创建名为 `alien-local:latest` 的本地模型别名，不会下载模型。重启 Alien 后，它使用 `http://127.0.0.1:11434/v1` 上的 OpenAI 兼容接口。模型服务由 Ollama 管理，Alien 不会启动或停止 Ollama。

8 GB 显存建议先从 Qwen3.5 4B 开始，并把上下文设为 4096。若想尝试 9B，权重、KV cache 和桌面显示都要共用显存；能否运行取决于量化版本和实际剩余显存。

### 3. 可选的隔离沙箱

Ollama 推理不使用 WSL。需要运行自主生成工具的容器自测或应用候选验收时，才需准备 WSL / Ubuntu / Podman；这一步可能要求管理员许可和重启。安装并初始化 Ubuntu 后，双击 **Prepare-Sandbox.cmd**。不准备沙箱时，普通 Agent 会话仍可使用，但容器隔离的自扩展和候选验收功能不可用。

### 4. 可选配置

- **浏览器**：双击 `Install-Browser.cmd` 安装 Chromium，在设置填写允许的网站域名并启用 Playwright MCP。本版开放导航、快照、截图等只读工具，没有开放点击提交、上传和任意 JS 执行。
- **Apple Calendar**：设置页填写 iCloud Apple 账户及应用专用密码，当前仅提供读取；也可在工作区放入 ICS 文件。不会通过 Google Calendar 间接同步。
- **登录后自启**：运行 `scripts\enable-autostart.ps1`。这是当前 Windows 用户登录后启动，尚不是登录前系统服务。保持电脑登录且不要休眠，Ollama 才能在后台持续提供本机模型。
- **自主发布**：设置中可开启“独立验收通过后自动发布应用候选”。默认关闭；工具若有用户提供的独立验收用例，通过后会自动启用。

## 模型与硬件

先用 `nvidia-smi` 核对实际显存；机型标签不能证明当前 GPU / 内存配置。模型不随项目分发，下面是待实机验证的起点，不是跑分承诺：

| 实际显存 | 起点 |
| --- | --- |
| 6 GB | 试用 Qwen3.5 2B 或 4B 量化版，先用 4K 上下文 |
| 8 GB | 先用 Qwen3.5 4B；9B 量化版可能因显存余量不足而卸载到系统内存或无法启动 |
| 16 GB | 可尝试 Qwen3.5 9B 量化版或更长上下文 |

Ollama 会管理模型和运行时；模型权重、KV cache、运行缓冲和 Windows 桌面共用显存。模型能否完整放入显存，以实际加载结果为准。每个模型与量化版本的许可证应单独核对。

[Ollama Windows 安装说明](https://docs.ollama.com/windows) · [Ollama 工具调用](https://docs.ollama.com/capabilities/tool-calling) · [Ollama OpenAI 兼容接口](https://docs.ollama.com/api/openai-compatibility)

## 现在具备什么

- 中文控制台：提交任务、真实事件与工具结果、取消 / 重试、任务产物下载。
- Pi 官方 SDK：持久化 JSONL 会话、恢复、按本地上下文预算设置的自动压缩；默认按需加载工具。
- 工作区文件操作：Pi 官方 read / write / edit，写入限于 `workspace/output/`；记录并核验结果。
- 记忆：用户偏好和 Agent 经验分源，带时间与过期字段。
- 标准 Skill：内置调试、完成前验收、测试驱动开发、编写 Skill；Agent 可保存自己的版本化 Skill，下个任务按需加载。
- MCP：复用 Pi 内建 MCP 与工具搜索，接入固定版本的本机 Playwright。其他已调研服务器暂未全部集成，见复用清单。
- 自扩展：编写同步 JavaScript JSON 工具 → 无网络容器自测 → 独立验收 → 启用 → 执行失败自动创建修复任务 → 保留旧版和回退。
- 应用候选：对 `src/runtime/*.ts` 和 `web/src/*.{ts,tsx,css}` 的修改交给独立镜像执行类型检查、固定回归与构建。可复用 Pi edit 提交小片段修改。
- 独立守护进程：任务空闲时切换候选，启动 / 健康失败后回到旧版或救援副本；回滚后可创建修复任务。
- 本地 CalDAV 凭据加密保存、SQLite 一致性备份、本机访问密钥。

## 自我进化的实际边界

本版是**可积累 Skill、记忆和可测试工具，并尝试修复获准模块**的系统。不会自行训练模型，不保证以后永远不需要人工修复。

生成工具当前只支持同步 JSON 输入 / 输出函数，不支持自行安装依赖、自由访问宿主文件、网络或凭据。需要外部动作时复用已有受控连接器；扩展新的权限要修改可信底座。本版也没有远程 Mac 控制台、Discord 入口、无人登录前运行服务或自动开发完整任意 MCP 服务器。

恢复、权限、模型端点和验收代码不在候选文件修改名单内。这个名单和回归检查属于工程发布约束，**不是对恶意应用补丁的安全证明**：被发布的 Node 代码仍以本机用户权限运行。只有生成工具有独立容器边界；Node VM 本身不是安全沙箱。默认应用候选等待用户发布，允许自动发布时仍会执行固定检查和健康回滚。

本机浏览器进程也不等同于网络安全沙箱。Playwright 的域名设置不能作为阻挡重定向的完整安全边界；只浏览可信公开站点，不接入个人已登录浏览器。严格阻挡私网与重定向的纯文本读取通过 `web_read` 提供。

访问密钥限制本地网页调用，不隔离同一 Windows 用户的其他程序；加密文件的密钥也在该用户的数据目录。只监听回环地址，不把控制台端口暴露到公网。

## 费用

模型端点仅允许数字回环地址，未配置云端回退。默认集成没有 OpenAI / Claude / 付费搜索 API，也不需要购买软件许可证。Pi 的包可能包含多供应商 SDK 作为依赖，Alien 的运行路径只注册并调用本机 Ollama 的 `alien-local:latest` 模型。关闭 Pi 安装遥测、提示缓存保温和网络模型目录刷新。

自行安装的外部 MCP / Skill 是否收费需要另行核对，所以本版没有“任意市场插件一键信任执行”。公开 GitHub 仓库使用标准免费检查任务；不启用付费托管服务。

## 开发与验证

Node.js 22.19+（推荐 24 LTS）。

```sh
npm ci --ignore-scripts
npm run release:check
npm start
```

首次通过启动进程打开浏览器时会自动带入本机密钥。需要手动登录时，查看 `data/access-token`；不要把它提交到 GitHub。

```sh
# 可选：UI 回归（安装浏览器二进制，不下载模型）
npx playwright install chromium
npm run test:e2e
# 可选：真实容器边界检查，需已启动 Docker 或 Podman
ALIEN_CONTAINER_TEST=1 ALIEN_CONTAINER_ENGINE=docker npm test
```

CI 检查 Windows / Linux 的构建、API 与守护进程；Linux 的真实容器、独立候选镜像；浏览器 UI。测试中的模型服务是本机协议测试桩，并非真实模型能力评测。没有 GPU 的测试通过不能证明模型显存足够，也不能证明自主任务成功率。

目录与边界说明见 [architecture.md](docs/architecture.md)，组件来源和许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。MIT 许可证仅覆盖 Alien 原创部分，依赖保留各自许可证。
