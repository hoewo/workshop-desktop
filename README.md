# Workshop Desktop

Workshop Desktop 是一个轻量跨平台托盘端，用于快速查看和处理 Workshop 后端里的个人待办。它不是完整桌面应用：常驻入口只有系统托盘/菜单栏图标，点击后打开一个小面板。

## 当前能力

- 启动时若没有有效登录配置，会自动打开登录面板
- 点击托盘图标打开待办面板，失焦自动隐藏
- 支持 NebulaAuth 邮箱/手机号验证码登录、手工 Bearer Token 和本地调试 Header 三种连接方式
- 登录后自动保存 `access_token` / `refresh_token`，并在 token 临近过期或接口返回 `401` 时刷新
- 自动拉取当前用户参与的项目，再聚合项目下未完成任务
- 默认只展示和当前用户相关的任务：创建者或执行者是自己
- 支持快速新增个人任务
- 支持轻量状态操作：开始、完成、阻塞、退回待办
- 支持按项目、状态和关键词过滤
- 支持每日固定时间刷新，例如每天 `09:00`
- 支持打开桌面便签窗口，并可切换置顶
- 个人记录分为个人、项目、任务三类；项目记录可多条，任务记录按任务唯一
- 项目列表和任务列表会提示是否已有个人记录
- 任务列表采用紧凑展示，长任务标题在列表中截断，详情中查看完整内容

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
- `GET /tasks?project_id={id}&state=pending&state=in_progress&state=pending_review&state=blocked&page_size=200`
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

打包本平台目录包：

```bash
./scripts/package.sh dir
```

生成安装包：

```bash
./scripts/package.sh dist
```

本机默认生成当前平台安装包。macOS 当前默认生成：

```text
release/Workshop Todo-<version>-arm64-mac.zip
```

云端发布通过 GitHub Actions 生成：

- macOS arm64 zip
- Windows x64 NSIS installer
- Windows x64 portable exe

没有把 DMG 作为默认目标。当前 Electron Builder 26.8.1 在本机生成 DMG 时会触发 DMG vendor 下载错误，zip 和目录包可正常生成。

脚本默认设置：

- `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
- `CSC_IDENTITY_AUTO_DISCOVERY=false`

如果你要走自己的签名/下载源，可在命令前覆盖环境变量。

## 项目规划

当前治理和交付规划入口见 [docs/project-plan.md](docs/project-plan.md)。README 继续保留产品能力、接口契约和开发运行说明；Goal、Iteration、Task、Decision、Roadmap 等执行状态放在 `docs/project/` 下维护。
