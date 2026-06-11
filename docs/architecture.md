# 架构

Workshop Desktop 是一个 Electron + React 桌面客户端，用于快速查看和处理 Workshop 里的个人待办。Workshop 后端仍然是项目、任务、用户和认证的事实源；桌面端负责本地桌面体验、本地配置和本地个人记录。

## 运行模块

- `src/main/main.ts`：Electron 主进程。负责 Dock、托盘、菜单入口、全局快捷键、窗口生命周期、本地配置存储、NebulaAuth token 刷新、API 代理、本地个人记录文件、任务预览窗口和跨窗口刷新通知。
- `src/main/codexAppServer.ts`：codex app-server JSON-RPC 客户端（JSONL over stdio）。负责 thread/turn 生命周期、通知分发、崩溃恢复和审批兜底拒绝。
- `src/main/preload.ts`：通过 `contextBridge` 暴露类型化的 `workshopDesktop` 桥接接口。
- `src/renderer/App.tsx`：React UI。负责登录、设置、项目/任务聚合、当前用户任务过滤、任务状态操作、便签窗口、任务预览和个人记录窗口。
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

- `GET /projects`
- `GET /tasks`
- `POST /tasks`
- `PUT /tasks/{id}`

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
- 执行默认走桌面端自启的 `codex app-server`（线程出现在 Codex app 对应项目下，状态进运行表）；`backend: "exec"` 时退回静默 `codex exec`（D-009）。客户端不直接打开 Terminal，也不直接拼接本机命令。prompt 中附带回写说明，被执行 agent 可用受限 token 把结论沉淀为记录。

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
- 列表页面用于定位对象；详情页面用于处理一个对象。
- 打开项目工作区时，可以同时打开项目任务面和相关项目记录面。

## 边界

- 本应用不是 Workshop 后端，不应复制后端对项目、任务分配、任务状态或用户身份的归属。
- 本应用不是完整团队项目管理客户端。当前任务可见性是个人范围：只展示当前用户创建或执行的任务。
- 本应用不是 repo 知识库。本地个人记录可以捕捉想法，但 repo 文档只存长期项目事实。
- 本应用不是 AI 治理流程本身。它可以帮助捕捉想法并推进到任务；流程解释由 skill 和 repo 文档负责。
- 本地 AI bridge 是应用能力入口，不是后门文件写入；所有写入必须经过桌面端服务层并触发 UI 同步。
