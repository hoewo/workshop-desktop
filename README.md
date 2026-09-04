# Workshop Desktop

Workshop Desktop 是一个面向个人当前工作的轻量桌面工作台：在本地组织项目与记录，按需连接 Workshop 任务源，并把任务或记录发送给 Codex 执行。

[下载最新版](https://github.com/hoewo/workshop-desktop/releases/latest) · [注册 Workshop 账号](https://workshop.feitianchengzi.com/register) · [查看全部版本](https://github.com/hoewo/workshop-desktop/releases)

无需登录即可使用本地项目和记录；使用 Workshop 待办需要先在官网注册账号，再在桌面端登录并关联远端任务源。仓库名称是 Workshop Desktop，安装后的应用名称是 **Workshop Todo**。

## 下载与安装

当前正式发布支持：

| 平台 | 发布包 | 说明 |
| --- | --- | --- |
| macOS | Universal zip | 同时支持 Apple Silicon 和 Intel；正式包已签名、公证并支持应用内更新 |
| Windows | x64 Installer / Portable | 可选择安装版或免安装版 |

从 [GitHub Releases](https://github.com/hoewo/workshop-desktop/releases/latest) 下载对应平台的最新文件：

- macOS：解压 universal zip，将 **Workshop Todo** 移入“应用程序”后启动。
- Windows：运行 Installer，或直接启动 Portable 版本。

## 使用 Workshop 待办

本地项目和记录不要求 Workshop 账号。如果需要同步和处理 Workshop 待办：

1. 前往 [Workshop 官网注册账号](https://workshop.feitianchengzi.com/register)。
2. 在 Workshop Desktop 设置页使用同一邮箱或手机号获取验证码并登录。
3. 回到工作台，为本地项目关联对应的 Workshop 任务源。

也可以先访问 [Workshop 官网](https://workshop.feitianchengzi.com/) 管理远端项目和任务。

## 核心能力

- 从本地目录创建项目，并把项目作为记录和 Codex 执行的工作上下文。
- 在统一项目工作区查看、搜索和折叠待办与记录。
- 创建个人、项目和任务记录，并通过桌面便签保持当前工作内容可见。
- 登录后为本地项目关联 Workshop 远端任务源，查看和轻量处理个人待办。
- 把记录推进为任务，或把任务和记录发送给 Codex 执行。
- 由用户确认 AI 提出的任务创建、记录归档/恢复和其他高风险写入。

Workshop Desktop 聚焦个人捕捉、当前注意力和执行转化，不是完整知识库或团队项目管理系统。

## 快速开始

1. 启动应用，从一个本地目录创建项目。
2. 在项目工作区或桌面便签中记录想法、问题和结论。
3. 如需远端待办，先在 Workshop 官网注册，再在设置中登录并为本地项目关联任务源。
4. 打开任务或记录，绑定正确的项目目录后发送给 Codex。
5. 在 Workshop 确认 AI 提出的状态变更或任务创建操作。

使用 Codex 执行能力前，需要本机已安装并登录 Codex。

## 数据与安全

- 本地项目、记录、目录绑定和应用设置保存在当前设备。
- Workshop 项目和任务由远端服务提供；不登录时不会影响本地记录能力。
- `workshop` CLI 只连接正在运行的 Desktop 本地服务，不直接修改内部数据文件。
- AI 可以新增短记录；修改已有内容、创建任务或批量改变状态时，由 Desktop 展示确认页面并在用户确认后执行。

## Workshop CLI

发布版在非 Windows 平台会安装 `workshop` 命令，`workshop-desktop` 是同一入口的别名。CLI 需要 Workshop Desktop 正在运行。

```bash
workshop --json doctor
workshop record list --json
workshop context current --json
```

Windows 发布包当前不会自动安装 CLI，可以先使用应用内功能。

## 本地开发

项目使用 Electron、React、TypeScript 和 pnpm。CI 当前使用 Node.js 24 与 pnpm 11.5.2。

```bash
npx --yes pnpm install
npx --yes pnpm dev
```

提交前运行：

```bash
bash scripts/pre-commit-check.sh
```

本地目录包使用 `./scripts/package.sh dir`；完整打包和发布流程见 [docs/release.md](docs/release.md)。

## Workshop Todo 生态

| 仓库 | 职责 |
| --- | --- |
| [workshop-todo](https://github.com/hoewo/workshop-todo) | 远端项目、成员和任务的后端服务 |
| [workshop-todo-website](https://github.com/hoewo/workshop-todo-website) | 团队协作和完整任务管理网页端 |
| [workshop-todo-cli](https://github.com/hoewo/workshop-todo-cli) | 直接访问远端任务系统的独立 `todo` CLI |
| [workshop-desktop](https://github.com/hoewo/workshop-desktop) | 本地项目、记录、当前注意力和 Codex 执行入口 |

四个仓库共享后端业务契约，但保持独立的产品边界和发布节奏。独立 `todo` CLI 与本项目随应用分发的 `workshop` CLI 用途不同。

## 开发文档

- [AGENTS.md](AGENTS.md)：开发团队与 AI 协作规则
- [docs/architecture.md](docs/architecture.md)：架构和跨仓库边界
- [docs/domain.md](docs/domain.md)：产品领域术语
- [docs/testing.md](docs/testing.md)：测试与验证方式
- [docs/release.md](docs/release.md)：打包、发布和自动更新
- [docs/decisions.md](docs/decisions.md)：已接受决策和开放问题

## License

当前仓库尚未声明开源许可证。如需复用或分发代码，请先联系维护者。
