# 架构

Workshop Desktop 是一个 Electron + React 桌面客户端，用于快速查看和处理 Workshop 里的个人待办、本地记录和 AI 执行入口。它是人的当前注意力工作台，不是完整知识库、完整项目管理系统或后端事实源。

代码是当前运行时事实。本文只记录稳定架构边界和设计约束；文件清单、接口名、RPC method、CLI 参数和具体 UI 流程由代码、类型和测试统一维护。

## 架构原则

- 主进程拥有本地状态、文件写入、窗口生命周期、app server、Codex 派发、更新和安装类能力。
- Renderer 只通过 preload 暴露的类型化桥接调用能力，不直接访问后端、app server token 或本地数据文件。
- Workshop API / NebulaAuth 访问集中在主进程服务层，renderer 不暴露任意 API path。
- CLI 是 app server 的命令门面，不是业务层或数据层。
- Skill 是用户 AI 环境读取的协作说明，不在桌面端进程内执行。
- 文档解释为什么这样分层；代码维护实际入口和接口细节。

## 关联系统与仓库边界

Workshop Todo 是一个由四个仓库组成、共享后端业务契约但独立发布的产品系统：

| 仓库 | 产品职责 | 自有事实 |
| --- | --- | --- |
| [`workshop-todo`](https://github.com/hoewo/workshop-todo) | Go 后端服务；向各客户端提供项目、成员、任务、标签、附件/评论、反馈和实时事件能力 | 远端业务模型、权限、状态迁移、API 行为和持久化 |
| [`workshop-todo-website`](https://github.com/hoewo/workshop-todo-website) | 团队协作网页端；提供完整项目和任务管理界面 | Web 交互、路由、浏览器会话和展示状态 |
| [`workshop-todo-cli`](https://github.com/hoewo/workshop-todo-cli) | 独立 `todo` 命令行客户端；直接操作远端项目和任务 | CLI 配置、目录到远端组织/项目的本机绑定和命令行交互 |
| [`workshop-desktop`](https://github.com/hoewo/workshop-desktop) | 本 repo；个人当前注意力工作台、本地记录和 Codex 执行入口 | 本地项目、记录、目录绑定、确认请求和 Codex 运行状态 |

稳定调用方向是：

```text
workshop-todo-website ─┐
workshop-todo-cli ─────┼─> Gateway / NebulaAuth ─> workshop-todo ─> PostgreSQL / OSS
workshop-desktop ──────┘

Codex / 本地 AI ─> workshop / workshop-desktop CLI ─> Desktop app server ─> 本地记录与执行能力
```

- 网页端、独立 `todo` CLI 和 Desktop 都是后端契约的消费者，客户端之间不互相调用。
- Gateway / NebulaAuth 负责远端认证和身份转发；`workshop-todo` 负责授权后的业务规则与数据事实。
- 本 repo 的 `workshop` / `workshop-desktop` CLI 是 Desktop 本地 app server 的门面；`workshop-todo-cli` 的 `todo` 是远端任务系统客户端，两者不共享命令职责。
- 当前各客户端分别维护请求与类型映射。引入可生成的机器可读契约前，跨仓库升级必须以后端实际路由、模型和响应代码为运行时事实，并逐一验证三个客户端。
- 后端契约应优先保持向后兼容；需要破坏性变更时，先提供兼容窗口并升级三个消费者，最后再移除旧契约。

## 数据与事实归属

- Workshop 后端是远端任务源、用户、组织和认证的事实源。
- 桌面端拥有本地项目、本机设置、本地记录、项目本地目录绑定、app server 连接、确认请求状态、Codex 运行状态和使用手册已读状态。
- Repo 中的代码和最小文档保存已审查的长期项目事实。
- Workshop 记录是人的思考材料，不自动成为任务、决策、迭代或 repo fact。
- Codex 线程本体归 Codex 所有；桌面端只保存发送关系和运行状态。
- build、release、截图、下载包和依赖输出是生成物，不进入 Git。
- Electron `userData` 是应用内部数据；AI 和 CLI 不直接读写它作为正式能力。

## 服务边界

- 后端业务访问、token 刷新、记录读写、确认请求、更新、skill 安装、CLI shim 安装和 Codex 派发都应通过主进程服务能力完成。
- 本地记录读写集中在记录 store，状态和正文变更必须触发桌面端服务层与 UI 同步。
- 本地项目和项目本地目录绑定是设备级配置，不是 Workshop 后端事实，也不是 repo fact。
- 远端认证和 token 刷新属于主进程服务能力；普通用户的 Workshop 账号登录/退出归设置页，工作台只呈现远端任务源同步状态；设置页不承载高级认证配置。
- 使用手册随应用发版更新，不承担远程文档中心职责。
- 运行状态表是执行遥测，不是知识对象。

## 本地 AI Bridge 与 CLI

- app server 只绑定 `127.0.0.1`。
- token 分完整 token 和受限 token：完整 token 面向本机用户能力；受限 token 只开放记录回写/检索、活跃 Codex 运行关联项目内的记录归档/恢复提议，以及同项目任务只读和创建提议能力。
- CLI 只调用 app server，负责发现、参数、文件输入、JSON 输出和友好命令封装；它不保存业务事实。
- 新增记录是低风险 append-only 写入；编辑已有对象、改变状态、创建任务、批量整理和执行派发等高风险动作应通过确认页或用户手势完成。记录归档/恢复使用专用项目范围请求、确认时版本校验和 store 原子批量写入。
- Desktop 直接创建、记录转待办和 AI/CLI 创建提议共用同一任务创建服务；任务必须明确内容和项目成员负责人，项目标签可选，初始状态为 `pending`。
- 被派发 agent 可以读取活跃运行关联项目中的任务、成员和标签，但只能通过专用任务创建提议请求打开由 Desktop 生成的可信确认页，不能提交任意确认 HTML 或直接写任务。
- `codex.send` 属于 Workshop UI / service layer 的执行动作，不是被派发 agent 可递归触发的能力。
- CLI 能力补齐不是逐个补命令，而是验证主进程服务层是否提供清晰、可组合、可确认的能力面。
- 具体 RPC method、CLI 子命令、confirmation action 和权限 allowlist 由代码和测试维护，不在本文枚举。

## 交互边界

- Workshop Desktop 负责聚焦当前项目、任务、记录和确认动作。
- 工作台主页面是正常应用窗口；托盘面板是从菜单栏或系统托盘触发的轻量快速入口，两者不共用窗口语义。
- 工作台主页面和托盘面板可以同时承载本地项目和用户主动拉取的远端任务源项目；两类项目在 UI 中应保持相近的行结构，但事实归属仍按本地项目和远端任务源分离。
- 项目行进入 Renderer 内的统一项目工作区；工作区可以同页聚合远端待办和本地记录，但继续使用既有任务查询/状态更新与记录 CRUD，不能建立新的跨模型持久化关系。
- 便签窗口排列按当前工作上下文分组：本地项目 ID 是项目窗口组的首选身份，关联的 Workshop 项目 ID 只用于任务映射和旧目标兼容；个人记录、其他项目和当前组不能被默认混排。
- 窗口位置/尺寸与列表折叠、搜索、编辑等内容状态分离。排列约束持续到用户手动移动、缩放或进入受保护编辑状态；创建面、未保存草稿和弹出选择面不能在整理中被强制移动或压缩。
- 未登录 Workshop 账号时，工作台主页面和托盘面板仍可使用本地项目和本地记录；账号入口归设置页，工作台只提供任务源状态提示。
- Codex / 用户 AI 负责理解材料、检索记录池、生成候选整理、执行代码任务并提出写入动作。
- 任务或记录发送到 Codex 时，工作目录应来自本地项目的本机目录绑定；迁移期可兼容旧 Workshop 项目目录绑定。
- 个人记录、项目记录和任务记录都面向人类阅读与编辑；AI 创建记录时默认保持短记录。
- 稳定事实进入 repo 时必须经过最小文档边界检查。
- 设置页和首次启动提示可以帮助用户安装或更新内置 skill，但客户端只负责分发和安装，不负责执行 skill。

## 非目标

- 不复制 Workshop 后端的项目、任务、用户或认证事实。
- 不成为完整团队项目管理客户端。
- 不把本地记录池升级成固定类型系统。
- 不把 repo 文档变成个人笔记、会议原文、AI 运行日志或临时计划归档。
- 不把 app server 设计成远程网络 API。
- 不把 CLI 设计成绕过服务层或用户确认的数据后门。
