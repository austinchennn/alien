# 👽 Alien

在自己的电脑上运行的个人 Agent：本地模型、中文控制台、任务进度、记忆、标准 Skill、现成 MCP，以及有测试和回滚的工具自扩展。运行模型不使用收费 API。

**底座直接复用 Pi Coding Agent SDK。** 已复用 Pi 会话、恢复、上下文压缩、Skill 加载、MCP 集成与文件工具；内置精选 Superpowers Skill 和本机 Playwright MCP。选型与其他现成项目对比见 [复用调研](docs/reuse.md)。

## Windows：下载并安装

### 1. 双击安装器

[**下载 Install-Alien.cmd**](https://github.com/austinchennn/alien/releases/latest/download/Install-Alien.cmd) · [完整安装包](https://github.com/austinchennn/alien/releases/latest/download/Alien-Windows.zip)

双击安装器，会校验并下载应用、免费 Node.js 运行环境，安装依赖，构建界面，保存独立救援副本，并准备 WSL / Podman / vLLM。默认位置：`%LOCALAPPDATA%\Alien`。首次需联网下载软件，**不下载任何模型权重**。

如果 Windows 尚未启用 WSL，系统可能要求管理员许可和重启。完成后打开 Ubuntu 一次，按提示建立 Linux 用户，再双击应用文件夹中的 **Prepare-Runtime.cmd** 完成准备。这部分 Windows 首次配置无法由普通应用无提示跳过。准备过程可能要求输入刚创建的 Ubuntu 用户密码。

源码下载用户也可以双击 `setup.cmd`。首次安装完成后，桌面会出现 Alien 快捷方式。

### 2. 选择你已下载的模型

打开 `%LOCALAPPDATA%\Alien\app`，双击 **Configure-Model.cmd**，选择包含 `config.json`、分词器和 `.safetensors` 的完整本地模型目录。**GGUF 不适用于这个 vLLM 启动脚本**。

重新启动 Alien，它会在 WSL 中启动 vLLM，然后打开控制台。默认服务是 `http://127.0.0.1:8000/v1`，模型名 `alien-local`，上下文 8192。已设置 Hugging Face / Transformers 离线模式；文件不完整会报错，不会替你下载。

当前启动配置针对 Qwen3.5 系列，使用官方建议的 `qwen3_coder` / `qwen3` 解析器；使用其他模型时需要相应调整解析器。脚本启用文本模式，不加载视觉编码器。

### 3. 可选配置

- **浏览器**：双击 `Install-Browser.cmd` 安装 Chromium，在设置填写允许的网站域名并启用 Playwright MCP。本版开放导航、快照、截图等只读工具，没有开放点击提交、上传和任意 JS 执行。
- **Apple Calendar**：设置页填写 iCloud Apple 账户及应用专用密码，当前仅提供读取；也可在工作区放入 ICS 文件。不会通过 Google Calendar 间接同步。
- **登录后自启**：运行 `scripts\enable-autostart.ps1`。这是当前 Windows 用户登录后启动，尚不是登录前系统服务。保持电脑登录且不要休眠，才能持续工作。
- **自主发布**：设置中可开启“独立验收通过后自动发布应用候选”。默认关闭；工具若有用户提供的独立验收用例，通过后会自动启用。

## 模型与硬件

先用 `nvidia-smi` 核对实际显存；机型标签不能证明当前 GPU / 内存配置。模型不随项目分发，下面是待实机验证的起点，不是跑分承诺：

| 实际显存 | 起点 |
| --- | --- |
| 6 GB | 支持 vLLM 的 Qwen3.5-4B 4-bit 量化，先尝试 4K 上下文 |
| 8 GB | 支持 vLLM 的 Qwen3.5-9B 4-bit 量化，必要时回退 4B 或缩短上下文 |
| 16 GB | 优先验证 Qwen3.5-9B 的更高精度或更大上下文 |

RTX 30 系列应选择支持 Ampere 的 AWQ / GPTQ 等量化方案，不能直接采用仅面向更新硬件的 FP4/FP8 配置。显存还要容纳 KV cache、框架与运行缓冲；能否装下以实际启动为准。9B 的全精度权重不适合 8GB 显存。量化仓库的许可证和 vLLM 兼容性需与原模型分别核对。

[vLLM Windows / WSL 官方说明](https://docs.vllm.ai/en/latest/getting_started/installation/gpu/index.html) · [Qwen3.5 配置说明](https://docs.vllm.ai/projects/recipes/en/latest/Qwen/Qwen3.5.html)

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

模型端点仅允许数字回环地址，未配置云端回退。默认集成没有 OpenAI / Claude / 付费搜索 API，也不需要购买软件许可证。Pi 的包可能包含多供应商 SDK 作为依赖，Alien 的运行路径只注册并调用 `alien-local`。关闭 Pi 安装遥测、提示缓存保温和网络模型目录刷新。

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
