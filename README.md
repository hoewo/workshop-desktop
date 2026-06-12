# Workshop Desktop

Workshop Desktop 是一个轻量跨平台桌面端，用于快速查看和处理 Workshop 后端里的个人待办。内测阶段默认保留 Dock 图标，同时支持系统托盘/菜单栏入口和全局快捷键，避免菜单栏图标过多时找不到应用入口。

## 项目背景

Workshop Desktop 来源于一个 AI 开发流程判断：个人思考、任务执行、项目事实和通用方法不应该混在同一个默认上下文里。

本项目承载其中的“个人捕捉与执行转化”部分：帮助用户在桌面端快速记录个人想法、查看个人任务、打开任务工作面，并在想法成熟后推进为 Workshop 任务。repo 文档只保存会约束代码和 AI 执行的长期事实，不收录全部个人思考材料。

## 当前能力

- 启动时若没有有效登录配置，会自动打开登录面板
- 点击托盘图标打开待办面板，失焦自动隐藏
- macOS 默认显示 Dock 图标，可在设置中切回纯托盘模式
- 支持通过 `Command+Option+W` 全局快捷键打开待办面板，通过 `Command+Option+N` 新建个人记录
- macOS Dock 菜单支持显示面板、任务便签、新建个人记录、个人记录和退出
- 支持 NebulaAuth 邮箱/手机号验证码登录、手工 Bearer Token 和本地调试 Header 三种连接方式
- 登录后自动保存 `access_token` / `refresh_token`，并在 token 临近过期或接口返回 `401` 时刷新
- 自动拉取当前用户参与的项目，再聚合项目下未归档任务；任务完成后仍保留在列表中
- 默认只展示和当前用户相关的任务：创建者或执行者是自己
- 支持快速新增个人任务
- 支持轻量状态操作：开始、完成、阻塞、退回待办；任务归档入口先占位提示暂未实现
- 支持按项目、状态和关键词过滤
- 支持每日固定时间刷新，例如每天 `09:00`
- 支持打开桌面便签窗口，并可切换置顶
- 个人记录分为个人、项目、任务三类；项目记录可多条，任务记录按任务唯一；记录完成后仍显示，归档后从列表隐藏
- 项目列表和任务列表会提示是否已有个人记录
- 任务列表采用紧凑展示，长任务标题在列表中截断，详情中查看完整内容
- 启动后提供仅本机可访问的 app server，允许本地 CLI/AI 通过正式接口新增个人记录，并读取记录、项目和项目任务
- macOS 发布版支持从公开 GitHub Release 检查更新、自动下载，并可从设置面板或顶部应用菜单打开独立更新窗口确认重启安装

## 后端契约

默认连接网关：

```text
https://api.feitianchengzi.com
```

Workshop 业务接口路径：

```text
/workshop/v1/user
```

用到的业务接口：

- `GET /projects?page_size=200`
- `GET /tasks?project_id={id}&state=pending&state=in_progress&state=pending_review&state=completed&state=accepted&state=cancelled&state=blocked&page_size=200`
- `POST /tasks`
- `PUT /tasks/{id}`

## NebulaAuth 登录

桌面端使用 `workshop-todo` 项目已有的登录系统。

发送验证码：

```text
POST /auth-server/v1/public/send_verification
```

邮箱验证码请求体：

```json
{
  "code_type": "email",
  "target": "your-email@example.com",
  "purpose": "login"
}
```

手机号验证码请求体：

```json
{
  "code_type": "sms",
  "target": "13800138000",
  "purpose": "login"
}
```

验证码登录：

```text
POST /auth-server/v1/public/login
```

邮箱登录请求体：

```json
{
  "email": "your-email@example.com",
  "code": "123456",
  "code_type": "email",
  "purpose": "login"
}
```

手机号登录请求体：

```json
{
  "phone": "13800138000",
  "code": "123456",
  "code_type": "sms",
  "purpose": "login"
}
```

刷新 token：

```text
POST /auth-server/v1/public/refresh_token
```

刷新请求体：

```json
{
  "refresh_token": "<refresh_token>"
}
```

后续访问 Workshop API 时使用：

```text
Authorization: Bearer <access_token>
```

当前实现会把登录配置写入 Electron 的 `userData/config.json`。后续如果要提高本机凭据保护，可以再换成系统钥匙串/凭据管理器。

## 开发运行

当前机器没有全局 `npm`，可以用 `npx` 临时调用 pnpm：

```bash
npx --yes pnpm install
npx --yes pnpm dev
```

构建验证：

```bash
./scripts/package.sh build
```

提交前检查：

```bash
git config core.hooksPath .githooks
bash scripts/pre-commit-check.sh
```

启用后，每次 `git commit` 前都会执行主进程类型检查、渲染层类型检查和前端生产构建；任一检查失败都会阻止提交。

本地 AI/CLI 能力验证：

```bash
npx --yes pnpm dev
npx --yes pnpm app:record:create -- --title "AI 记录验证" --body "由 CLI 写入。" --open
npx --yes pnpm app:record:list -- --project-id 98
npx --yes pnpm app:task:list -- --project-id 98
```

这些命令要求 Workshop Desktop 正在运行；CLI 会通过本机 app server 请求桌面端新增或读取数据，不直接写内部数据文件。

打包本平台目录包：

```bash
./scripts/package.sh dir
```

生成安装包：

```bash
./scripts/package.sh dist
```

本机默认生成当前平台安装包。macOS 云端发布生成签名、公证后的 zip；本地无签名 secrets 时仍可只构建 zip 做本机验证。

```text
release/Workshop.Todo-<version>-arm64-mac.zip
```

云端发布通过 GitHub Actions 生成：

- macOS arm64 zip、zip blockmap、`latest-mac.yml`
- Windows x64 NSIS installer
- Windows x64 portable exe

macOS 自动更新使用 `electron-updater` 访问公开 GitHub Release。客户端直接读取 Release 里的 `latest-mac.yml`、zip 和 blockmap，不再内置 GitHub token。

脚本默认设置：

- `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
- `CSC_IDENTITY_AUTO_DISCOVERY=false`

如果你要走自己的签名/下载源，可在命令前覆盖环境变量。

macOS 云端发布需要以下 GitHub Actions secrets：

- `CSC_LINK`：Developer ID Application 证书 `.p12` 的 base64 或 electron-builder 支持的证书链接。
- `CSC_KEY_PASSWORD`：证书导出密码。
- `APPLE_API_KEY_BASE64`：App Store Connect API key `.p8` 文件内容的 base64。
- `APPLE_API_KEY_ID`：App Store Connect API key ID。
- `APPLE_API_ISSUER`：App Store Connect issuer ID。

## 项目文档

本 repo 采用最小 AI 开发上下文，不默认维护完整治理文档树。

- [AGENTS.md](AGENTS.md)：AI 协作和提交前文档审查规则
- [docs/architecture.md](docs/architecture.md)：架构边界和运行模块
- [docs/domain.md](docs/domain.md)：项目、任务、个人记录等领域概念
- [docs/testing.md](docs/testing.md)：开发、构建、打包和验证方式
- [docs/decisions.md](docs/decisions.md)：已接受决策和仍需确认的问题
