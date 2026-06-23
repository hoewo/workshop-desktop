# 测试与验证

本项目当前有开发模式手工验证、构建检查、主进程架构 smoke tests 和打包检查。

## 验证入口选择

日常功能测试和交互检查默认走开发模式：

```bash
npx --yes pnpm dev
```

适用范围包括登录、API 调用、窗口、菜单、快捷键、桌面便签窗口、个人记录和本地 AI Bridge 等需要真实桌面端运行状态的验证。

提交前或涉及共享代码边界时，运行提交前检查：

```bash
bash scripts/pre-commit-check.sh
```

需要单独确认 production build 时，再运行构建脚本：

```bash
./scripts/package.sh build
```

打包、安装包形态检查和正式发布不走开发模式，统一使用 `scripts/package.sh` 和 `scripts/release.sh` 这两个脚本入口。真实自动更新验证必须使用 GitHub Release 里的签名、公证包，不能用 `pnpm dev`、本地 `.app` 或目录包代替。

## 安装

使用 pnpm：

```bash
npx --yes pnpm install
```

## 开发运行

以开发模式运行桌面端：

```bash
npx --yes pnpm dev
```

开发脚本会先构建 Electron 主进程，再在 `127.0.0.1` 启动 Vite，等待 renderer 就绪后启动 Electron。
开发模式和发布包默认使用同一个 `userData` 目录，因此个人记录、设置和 app server 连接文件保持一致。需要隔离测试数据时显式设置：

```bash
WORKSHOP_DESKTOP_USER_DATA=/tmp/workshop-desktop-dev npx --yes pnpm dev
```

## 构建验证

默认构建检查使用包装脚本：

```bash
./scripts/package.sh build
```

等价 pnpm 脚本：

```bash
npx --yes pnpm run build
```

构建验证会执行主进程 TypeScript 构建、renderer TypeScript 类型检查和 renderer Vite production build，避免 Vite 在未做语义检查时把漏 import 等运行时错误打进包。

提交前完整门禁使用：

```bash
bash scripts/pre-commit-check.sh
```

它会运行主进程类型检查、主进程 smoke tests、renderer 类型检查和 renderer production build。

## 自动化测试

主进程关键架构边界有最小 smoke tests：

```bash
npx --yes pnpm run test:main
```

当前覆盖：

- 本地个人记录 store 的并发写入串行化、任务记录去重和删除。
- Workshop API 服务层的 allowlist 请求构造、token 刷新和创建任务输入校验。

提交前检查会自动运行这些 smoke tests。

## 本地 AI Bridge 验证

先启动桌面端：

```bash
npx --yes pnpm dev
```

再在另一个终端新增一条记录：

```bash
bash scripts/install-workshop-cli.sh
workshop --json doctor
workshop record create --title "AI 记录验证" --body "由 CLI 通过 app server 写入。" --open
```

预期结果：

- CLI 输出新记录 ID 和标题。
- Workshop Desktop 打开新建的个人记录窗口。
- 记录出现在个人记录列表中。

读取记录和任务：

```bash
workshop record list --project-id 98 --json
workshop record get --id <record-id> --json
workshop record open --id <record-id>
workshop record annotate --annotations-file ./annotations.json --json
workshop project list
workshop task list --project-id 98
workshop context current --json
```

预期结果：

- 读取命令通过 app server 返回记录、项目或任务，不直接读取 `userData` 文件。
- `workshop record list` 默认只返回记录元数据，不包含 `bodyMarkdown`；需要正文时使用 `workshop record get --id <record-id> --json`，只有小结果集批量读正文时才使用 `--include-body`。
- 打开记录命令通过 app server 请求桌面端打开已有记录窗口。
- 标注命令通过 app server 更新记录 metadata，不改写记录正文。
- 当前上下文命令返回最近聚焦的 Workshop 窗口对象；如果长时间未切换焦点，结果可标记为 `stale`。
- 任务读取要求桌面端已有有效登录配置。

临时确认窗口验证：

```bash
workshop confirmation open --title "确认测试" --html "<h1>确认测试</h1><p>这是一段由 AI/CLI 提供的临时页面。</p>" --json
```

预期结果：

- Workshop Desktop 打开独立确认窗口并渲染传入 HTML。
- 点击确认后 CLI 返回 `confirmed: true`；点击取消或关闭窗口返回未确认结果。
- 传入 HTML 只作为静态内容渲染，确认/取消按钮由 Workshop 外壳提供。

异步确认请求验证：

```bash
workshop confirmation request --title "异步确认测试" --html "<h1>确认</h1><p>确认后由 Workshop 执行动作。</p>" --action-json '{"type":"record.appendBody","recordId":"<record-id>","markdown":"## 整理\n\n- 已确认追加。"}' --json
workshop confirmation status --id <request-id> --json
```

预期结果：

- `confirmation.request` 立即返回 `requestId`，不会等待用户点击确认。
- 用户确认后，Workshop 执行声明的记录或任务动作，并可通过 `confirmation.status` 查询为 `confirmed` 或 `failed`。
- 用户取消或关闭窗口时，不执行动作，状态为 `cancelled` 或 `closed`。

如果桌面端未运行，CLI 应提示找不到 app server，而不是直接写内部数据文件。
非 Windows 发布版启动时会自动安装用户级 `workshop` 和 `workshop-desktop` 命令；开发环境可用 `bash scripts/install-workshop-cli.sh` 安装同名入口。Windows 发布包当前尚未自动安装 CLI shim。
`workshop-desktop` 是同一个 CLI 的别名；旧的 `npx --yes pnpm app:*` scripts 仅保留兼容，不作为推荐验证入口。

## AI 协作 Skill 验证

设置页的 AI 协作区块应能检查并安装内置 `workshop-codex-collaboration` skill。

开发模式可用临时目录验证，不要覆盖真实 `~/.codex/skills`：

```bash
WORKSHOP_DESKTOP_CODEX_SKILLS_DIR=/tmp/workshop-codex-skills npx --yes pnpm dev
```

预期结果：

- 打开设置页时，AI 协作区块显示未安装或可更新。
- 点击“安装 Skill”或“更新 Skill”后，目录 `/tmp/workshop-codex-skills/workshop-codex-collaboration` 存在。
- 再次打开设置页时显示“Skill 已安装”。
- 如果目标目录已有不同内容，安装前会在同级生成 `workshop-codex-collaboration.backup-*` 备份目录。

设置页的账号区应承载普通登录/退出：

- 未登录时显示 Workshop 账号未登录，并提供邮箱/手机号验证码登录。
- 登录后工作台只显示远端任务源可同步状态，不再弹出工作台内登录表单。
- 已登录时设置页显示当前账号并提供退出登录。
- 退出登录只清远端身份和远端任务数据，本地项目、本地目录绑定和本地记录仍保留。

源码资源检查应确认：

- `resources/skills/workshop-codex-collaboration/SKILL.md`
- `resources/skills/workshop-codex-collaboration/agents/openai.yaml`

目录包或 release 包检查应确认产物携带：

- `Contents/Resources/cli/workshop-desktop-cli.mjs`
- `Contents/Resources/skills/workshop-codex-collaboration/SKILL.md`

## 打包

构建未打包 app 目录：

```bash
./scripts/package.sh dir
```

构建 release 包：

```bash
./scripts/package.sh dist
```

macOS 本地无签名 secrets 时可只生成 zip 做本机验证。正式云端 release 会生成签名、公证后的 universal zip，并上传 `latest-mac.yml` 供自动更新使用。

## 发布

正式发布使用 release 脚本，完整流程见 [release.md](release.md)：

```bash
npx --yes pnpm release
```

## macOS 更新验证

macOS 更新链路依赖公开 GitHub Release 和签名包。验证时需要：

- GitHub Actions 已配置 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_API_KEY_BASE64`、`APPLE_API_KEY_ID` 和 `APPLE_API_ISSUER`。
- 先安装一个旧版本，例如 `v0.1.10`。
- 发布一个更高版本 tag，且 tag 版本和 `package.json` version 一致。
- 打开旧版应用，进入设置，确认“应用更新”能检查到新版本并自动下载。
- 在 macOS 顶部应用菜单点击“检查更新...”，确认会打开独立更新窗口并显示同一更新状态。
- 下载完成后点击“重启更新”，确认应用重启后版本变为新版本。

开发模式下更新状态会显示未启用；不能用 `pnpm dev` 验证真实自动更新。

## 手工验证

涉及登录、API 调用、任务状态变更或当前用户过滤的改动，默认用 `npx --yes pnpm dev` 启动桌面端，并在真实 Workshop/NebulaAuth 环境验证。

涉及窗口、菜单、快捷键、桌面便签窗口或个人记录的改动，默认在 dev 模式运行中的 Electron 应用里直接检查相关界面：

- 应用正常启动后默认显示工作台主页面。
- 顶部应用菜单
- Dock/托盘菜单入口
- 全局快捷键
- 任务面板
- 桌面便签窗口
- 个人记录列表或详情窗口
- 任务到记录、记录到任务的流转

涉及项目本地目录绑定的改动，需要手工检查：

- 工作台项目区默认不裸露创建表单；点击“添加项目”后直接唤起系统文件夹选择器。
- 选择目录后创建本地项目，项目名默认使用文件夹名。
- 重复选择已经绑定到其他本地项目的目录会被拒绝。
- 工作台和托盘面板本地项目行右键显示“重命名”，弹窗保存后两处项目名同步更新。
- 工作台和托盘面板本地项目行右键可以关联、更换或解除远端任务源；关联后显示“本地+远端”，本地项目名称不被远端项目名覆盖。
- 同一个远端任务源不能同时关联到两个本地项目；已被其他本地项目占用的远端项目在关联弹窗中不可选，主进程也会拒绝重复关联。
- 项目任务列表未绑定时显示“未绑定目录，点击绑定”。
- 项目记录列表未绑定时显示“未绑定目录，点击绑定”。
- 工作台和托盘面板项目行点击打开项目记录；只有目录文字点击触发绑定或打开目录。
- 点击提示后可以选择本地文件夹。
- 绑定后两个列表都显示同一项目的本地路径。
- 再次点击路径会打开对应文件夹。

涉及发送到 Codex 的改动，需要手工检查：

- 本机已安装 Codex CLI。
- 发送前项目已经绑定本地目录。
- 在任务详情点击发送到 Codex，会先保存任务备注，再由桌面端后台启动 Codex。
- 在项目记录或任务记录详情点击发送到 Codex，会先保存记录，再由桌面端后台启动 Codex。
- 未绑定本地目录时，界面应提示先绑定目录。
- 没有项目上下文的个人记录不能直接发送。
