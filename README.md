# Workshop Desktop

Workshop Desktop 是一个轻量跨平台桌面端，用于快速查看和处理 Workshop 后端里的个人待办、本地记录和 AI 执行入口。它不是完整知识库或项目管理系统；repo 文档只保存会约束代码和 AI 执行的长期事实。

## 项目定位

本项目承载“个人捕捉与执行转化”部分：

- 捕捉个人、项目和任务记录。
- 管理本机本地项目，并可选查看当前用户相关的 Workshop 任务源。
- 把成熟记录推进为 Workshop 任务。
- 为本地 AI 提供可确认、可回写的 Workshop bridge。

## 当前能力

- 工作台主页面提供远端连接入口，使用 NebulaAuth 邮箱/手机号验证码登录。
- 工作台主页面、托盘/菜单栏快速面板、Dock 菜单、全局快捷键、设置、使用手册和独立更新窗口。
- 工作台和托盘项目列表支持本地项目和手动拉取的远端 Workshop 项目；本地项目可先创建为记录容器，再在项目行内绑定或打开目录。
- 个人任务查看、过滤、新增和轻量状态操作。
- 项目、任务、个人三类本地记录；项目记录可多条，任务记录按任务唯一。
- 项目本地目录绑定，用于打开工作区和发送任务/记录到 Codex。
- 本地 app server 与 `workshop` CLI，支持记录、项目、任务、当前上下文、确认页和 Codex 派发相关能力。
- 内置 `workshop-codex-collaboration` skill；首次启动轻提示安装，设置页可检查、安装或更新。
- macOS 发布版支持从公开 GitHub Release 检查更新、自动下载，并由用户确认重启安装。

## 开发运行

当前机器没有全局 `npm` 时，可以用 `npx` 临时调用 pnpm：

```bash
npx --yes pnpm install
npx --yes pnpm dev
```

常用验证入口：

```bash
bash scripts/pre-commit-check.sh
./scripts/package.sh build
```

日常交互验证走 `npx --yes pnpm dev`；打包、安装包形态检查和正式发布统一走 `scripts/package.sh` / `scripts/release.sh`。完整验证规则见 [docs/testing.md](docs/testing.md)。

## Workshop CLI

正式入口是自定义命令 `workshop`，`workshop-desktop` 是同一 CLI 的别名。它通过正在运行的 Workshop Desktop app server 工作，不直接写内部数据文件。

开发 repo 内安装：

```bash
bash scripts/install-workshop-cli.sh
workshop --json doctor
```

常用命令：

```bash
workshop record create --title "记录标题" --body "记录内容" --scope project --project-id 98 --project-name workshop-desktop --open
workshop record list --project-id 98 --json
workshop record get --id <record-id> --json
workshop task list --project-id 98 --json
workshop context current --json
workshop confirmation request --title "确认标题" --html-file ./confirm.html --action-file ./action.json
```

发布版在非 Windows 平台启动时会自动安装用户级 `workshop` 和 `workshop-desktop` shim 到 `~/.local/bin`。Windows 发布包当前尚未自动安装 CLI shim；Windows 用户先使用应用内能力，CLI 自动安装另行实现。

## 打包与发布

本地目录包：

```bash
./scripts/package.sh dir
```

本地 release 包：

```bash
./scripts/package.sh dist
```

正式发布：

```bash
npx --yes pnpm release
```

完整发布流程、发布资产、签名公证和自动更新验证见 [docs/release.md](docs/release.md)。

## 项目文档

本 repo 采用最小 AI 开发上下文，不默认维护完整治理文档树。

- [AGENTS.md](AGENTS.md)：AI 协作和提交前文档审查规则。
- [docs/architecture.md](docs/architecture.md)：架构边界、数据归属、服务边界和非目标。
- [docs/domain.md](docs/domain.md)：项目、任务、个人记录等领域概念。
- [docs/testing.md](docs/testing.md)：开发、构建、打包和验证方式。
- [docs/release.md](docs/release.md)：发布流程、发布资产、签名公证和自动更新验证。
- [docs/decisions.md](docs/decisions.md)：已接受决策和开放问题。
