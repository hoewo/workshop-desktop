# 架构

Workshop Desktop 是一个 Electron + React 桌面客户端，用于快速查看和处理 Workshop 里的个人待办。Workshop 后端仍然是项目、任务、用户和认证的事实源；桌面端负责本地桌面体验、本地配置和本地个人记录。

## 运行模块

- `src/main/main.ts`：Electron 主进程。负责 Dock、托盘、菜单入口、全局快捷键、窗口生命周期、本地配置存储、任务预览窗口、跨窗口刷新通知和 IPC 编排。
- `src/main/codexAppServer.ts`：codex app-server JSON-RPC 客户端（JSONL over stdio）。负责 thread/turn 生命周期、通知分发、崩溃恢复和审批兜底拒绝。
- `src/main/workshopApiService.ts`：Workshop/NebulaAuth API 服务层。负责登录验证码、登录、登出、token 刷新，以及主进程明确支持的 Workshop 用户、组织、项目和任务请求。
- `src/main/recordStore.ts`：本地个人记录 store。负责记录 index/body 文件读写、记录规范化、写入串行化和原子文件替换。
- `src/main/updateService.ts`：应用更新服务。负责驱动 `electron-updater` 从公开 GitHub Release 检查/下载更新，并向 renderer 广播更新状态。
- `src/main/preload.ts`：通过 `contextBridge` 暴露类型化的 `workshopDesktop` 桥接接口。
- `src/main/taskPreviewPreload.ts`：任务预览窗口专用桥接，只暴露保持预览、隐藏预览和打开任务便签能力。
- `src/renderer/App.tsx`：React UI 编排层。负责登录、设置、项目/任务聚合、当前用户任务过滤、任务状态操作、便签窗口、任务预览和个人记录窗口的状态与流程；Workshop 业务数据通过主进程显式服务方法获取，不直接传任意 API path。
- `src/renderer/components/`：renderer 纯展示组件。当前包含认证字段、Markdown 预览、任务行/详情/项目菜单行、窗口标题和 Workshop 标识；`components/surfaces/` 按 tray、sticky、record、login 拆分窗口级渲染分支。
- `src/renderer/hooks/`：renderer UI 状态 hooks。当前封装焦点脉冲和完成反馈定时器，避免 `App.tsx` 直接管理这些 timer/ref。
- `src/renderer/lib/`：renderer 纯工具和视图模型。当前包含 URL 初始状态解析、配置规范化、记录/任务列表模型、窗口尺寸测量工具。
- `src/renderer/styles/tokens.css`：renderer 基础设计 token，覆盖颜色、间距和圆角。
- `src/renderer/styles.css`：renderer 全局样式和业务样式组合层。具体业务样式仍保留在同一文件中渐进整理。
- `src/shared/types.ts`：配置、API envelope、项目、任务、个人记录、IPC bridge 和窗口事件的共享类型。
- `scripts/workshop-desktop-cli.mjs`：本地 CLI 客户端。通过 app server 驱动正在运行的桌面端，不直接写内部数据文件。
- `resources/`：打包应用使用的 app、托盘和 template 图标。
- `scripts/package.sh`：构建、目录包和 release 包的包装脚本。

## 数据归属

- Workshop 项目和任务存在远端 Workshop API 中。
- NebulaAuth token 和桌面端设置当前存储在 Electron `userData/config.json`。
- 项目本地目录绑定也存储在 Electron `userData/config.json`，按 Workshop 项目 ID 记录本机路径。
- 个人记录是本地桌面数据，存储在 Electron `userData/personal-records/`。
- app server 连接信息存储在 Electron `userData/app-server.json`，包含本机端口和本次启动生成的 token。
- Codex 运行状态表存储在 Electron `userData/codex-runs/index.json`；exec 后端的输出文件也在该目录。Codex 线程本体归 codex 所有，落盘在 `~/.codex/sessions`。
- release、build、截图和依赖输出都是生成物，不进入 Git。

## API 边界

默认网关是 `https://api.feitianchengzi.com`。

Workshop 业务调用使用：

```text
/{serviceName}/v1/user
```

默认 `serviceName` 是 `workshop`。当前应用使用：

- `GET /users`
- `GET /organizations`
- `GET /projects`
- `GET /tasks`
- `POST /tasks`
- `PUT /tasks/{id}`

Renderer 不暴露通用 `api.request`。`preload` 只暴露主进程明确支持的 Workshop 业务方法：获取当前用户、列组织、列项目、列任务、创建任务和更新任务状态；主进程通过 `workshopApiService` 执行对应的 allowlist 请求。

NebulaAuth 调用使用：

- `POST /auth-server/v1/public/send_verification`
- `POST /auth-server/v1/public/login`
- `POST /auth-server/v1/public/refresh_token`

## 本地 AI Bridge

桌面端启动后会开启一个仅绑定 `127.0.0.1` 的 app server。token 分两级：完整 token 写入 `userData/app-server.json`，供本机 CLI 和用户侧 AI 使用；受限 token 在派发 Codex 执行时通过环境变量 `WORKSHOP_DESKTOP_SERVER_PORT` / `WORKSHOP_DESKTOP_SERVER_TOKEN` 注入被执行进程，只允许 `record.create`（见 D-008）。

当前最小能力：

- `record.create`：新增一条个人记录、项目记录或任务记录。通过 bridge 创建的记录带 `origin: agent`。
- `record.create` 支持 `open: true`，由桌面端创建记录后打开对应记录窗口。
- `codex.send`：把一个 Workshop 任务或记录交给本地 Codex 执行。执行目录来自该 Workshop 项目的本机目录绑定。
- 执行默认走桌面端自启的 `codex app-server`（线程出现在 Codex app 对应项目下，状态进运行表）；`backend: "exec"` 时退回静默 `codex exec`（D-009）。客户端不直接打开 Terminal，也不直接拼接本机命令。
- 派发不包装：turn 输入只有用户内容，不附带任何说明或来源标注。回写通道、token 限制、文档纪律和项目 ID 全部由目标项目的 `AGENTS.md` 声明——只有声明了 Workshop 派发段落的项目才有回写。运行与任务/记录的关联由运行状态表持有，不进 prompt。

当前不支持：

- 外部进程直接写 `userData/personal-records/` 作为正式能力。
- 远端网络访问 app server。
- 受限 token 调用 `record.create` 以外的方法（包括 `codex.send`）。
- AI 自动创建远端 Workshop 任务。
- AI 绕过用户确认把个人记录当成已接受 repo 事实。

## 交互模型

- 托盘/Dock 面板是项目分组和个人任务的紧凑入口。
- 便签窗口是轻量任务工作面。项目便签窗口展示任务列表；任务便签窗口聚焦单个任务。
- 个人记录窗口处理个人、项目和任务三类记录。
- 项目任务列表和项目记录列表在标题下方显示本地目录绑定入口；未绑定时提示绑定，已绑定时显示路径并点击打开文件夹。
- 单个任务详情可以发送到 Codex 执行。发送前会保存任务备注，Codex 的工作目录使用该任务所属项目的本地目录绑定。
- 项目或任务记录详情可以发送到 Codex 执行。没有项目上下文的个人记录不作为 Codex 执行入口。
- 主面板在项目列表下方显示最近 Codex 运行（运行中/已完成/失败/已中断），悬停查看最后消息。
- 设置面板显示应用更新状态。发现新版本后自动下载；下载完成后由用户点击“重启更新”触发安装。
- 列表页面用于定位对象；详情页面用于处理一个对象。
- 打开项目工作区时，可以同时打开项目任务面和相关项目记录面。

## 边界

- 本应用不是 Workshop 后端，不应复制后端对项目、任务分配、任务状态或用户身份的归属。
- 本应用不是完整团队项目管理客户端。当前任务可见性是个人范围：只展示当前用户创建或执行的任务。
- 本应用不是 repo 知识库。本地个人记录可以捕捉想法，但 repo 文档只存长期项目事实。
- 本应用不是 AI 治理流程本身。它可以帮助捕捉想法并推进到任务；流程解释由 skill 和 repo 文档负责。
- 本地 AI bridge 是应用能力入口，不是后门文件写入；所有写入必须经过桌面端服务层并触发 UI 同步。
