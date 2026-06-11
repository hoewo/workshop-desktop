# 决策

本文件记录会影响后续实现的已接受项目决策和开放问题。

## 已接受

### D-001 最小 repo 文档是默认 AI 上下文

Status: accepted

Decision: repo 使用 `README.md`、`AGENTS.md`、`docs/architecture.md`、`docs/domain.md`、`docs/testing.md` 和 `docs/decisions.md` 作为默认文档集。

Rationale: 当前项目足够小，一组高信噪比文档可以给 AI agent 足够上下文，不需要每个任务都进入重治理流程。

Consequences:

- `docs/project/` 不再是默认 repo 结构的一部分。
- 普通代码任务应从最小上下文和相邻代码开始。
- 长期事实只有经过审查后，才晋升到最小文档集。

### D-002 文档审查发生在提交前

Status: accepted

Decision: agent 不应在每次对话开始时运行完整规划流程；应在代码变更收尾前检查新增或修改的 repo 文档。

Rationale: 开局流程过重会拖慢普通实现任务。文档风险最高的时刻是新项目事实即将进入 repo，因此提交前审查是更合适的控制点。

Consequences:

- 个人思考、原始记录和未确认想法默认留在 repo 文档外。
- 新文档在被当作项目事实前，需要独立边界检查。
- 不确定事项必须保持 open 或 proposed，不能写成 accepted。

### D-003 Workshop Desktop 是个人执行客户端

Status: accepted

Decision: Workshop Desktop 定位为轻量桌面入口，用于处理个人 Workshop 任务和本地个人记录。

Rationale: 应用应帮助用户捕捉想法、查看个人任务、打开任务工作面，并把成熟记录推进为任务；它不应变成完整知识库或团队项目管理客户端。

Consequences:

- Workshop 后端仍然是项目、任务、用户和任务状态的事实源。
- 本地个人记录默认不是已接受 repo 事实。
- 除非后续明确接受，否则团队级任务可见性和完整项目治理不属于当前产品边界。

### D-004 macOS 打包默认使用 zip

Status: accepted

Decision: macOS 当前默认打包输出使用 zip。

Rationale: 当前 Electron Builder 配置目标是 zip，本机生成 DMG 存在已知 vendor 下载阻碍。

Consequences:

- `./scripts/package.sh dist` 预期在本机生成 macOS zip 输出。
- DMG、签名、安装器加固和自动更新可以作为后续打包决策处理。

### D-005 提供本地 app server 作为 AI bridge

Status: accepted

Decision: Workshop Desktop 启动后提供仅本机可访问的 app server，本地 CLI/AI 通过它请求桌面端执行应用动作。第一版只验证新增个人记录。

Rationale: Codex 等本地 AI 完成任务后，需要把不适合留在 repo 的信息沉淀为用户可见的项目记录或个人记录。正式能力必须由桌面端拥有状态、写入数据并刷新 UI，不能依赖外部进程直接改内部数据文件。

Consequences:

- app server 只绑定 `127.0.0.1`。
- 每次启动生成 token，并写入 Electron `userData/app-server.json` 供本机 CLI 发现。
- 最小 CLI 使用 `record.create` 新增记录；后续可扩展更新记录、打开便签草稿、创建任务候选等能力。
- 直接写 `userData/personal-records/` 只允许作为开发调试手段，不是正式集成方式。

### D-006 项目本地目录是设备级绑定

Status: accepted

Decision: Workshop 项目到本地工作目录的映射存储在桌面端本地配置中，由任务列表和项目记录列表提供绑定与打开入口。

Rationale: Codex 执行需要明确 `cwd`，但同一个 Workshop 项目在不同设备上的本地路径可能不同，不能把它当作后端项目事实或 repo 文档事实。

Consequences:

- 本地目录绑定按项目 ID 存在 Electron `userData/config.json`。
- 未绑定时，项目任务列表和项目记录列表提示用户绑定本地目录。
- 绑定后显示本机完整路径，点击打开对应文件夹。
- 后续发送任务或记录到 Codex 时，应优先使用该绑定路径作为工作目录。

### D-007 发送到 Codex 由服务层执行

Status: accepted

Decision: 从 Workshop Desktop 客户端发送任务或记录到 Codex 时，客户端只调用桌面端 bridge；真正的 Codex CLI 启动由 Electron 主进程和本地 app server 负责。

Rationale: 直接打开 Terminal 会把执行细节暴露给用户，也绕开了桌面端已有的本地服务边界。发送动作应由 Workshop Desktop 统一校验项目目录、组装执行上下文并启动 Codex。

Consequences:

- 任务详情和记录详情可以作为发送入口。
- 发送前必须能解析到项目本地目录绑定。
- 主进程使用绑定目录作为 Codex 工作目录。
- 后续如切换到 Codex app-server 或更稳定的会话 API，应替换服务层执行器，不要求 UI 改成命令行驱动。

### D-008 Codex 执行能力与记录回写能力分离

Status: accepted

Decision: `codex.send` 只能由用户手势（桌面端 UI 的发送入口）或持有完整 token 的本机调用方触发。桌面端派发 Codex 执行时，注入给被执行 agent 的是受限 token，只允许 `record.create`。

Rationale: 任务和记录正文会被原样嵌入 Codex prompt，而任务正文来自远端 Workshop API，存在提示注入风险。执行能力必须停留在用户一侧；被派发的 agent 只应获得 append-only 的记录回写能力，避免 agent 用注入内容递归派发新的执行。

Consequences:

- app server 维护两级 token：完整 token 写入 `userData/app-server.json`；受限 token 仅通过环境变量 `WORKSHOP_DESKTOP_SERVER_PORT` / `WORKSHOP_DESKTOP_SERVER_TOKEN` 注入被派发的 Codex 进程。
- 受限 token 调用 `record.create` 以外的方法会被拒绝。
- 通过 bridge 创建的记录带 `origin: agent`，与人工记录区分；origin 跟随创建者，编辑不改变来源。
- 后续若实现"任务自动派发"，必须先重新评审本决策，不得默认绕过用户手势。

### D-009 Codex 执行默认走 app-server 后端并记录运行状态

Status: accepted

Decision: 发送到 Codex 默认使用桌面端自启的 `codex app-server` 实例（JSON-RPC：`initialize → thread/start → turn/start`），`codex exec` 保留为静默后端可选项（`backend: "exec"`）。每次发送在 `userData/codex-runs/index.json` 记录运行条目（runId、backend、threadId/turnId、关联任务/记录、cwd、status、lastMessage、startedAt/completedAt），主面板显示最近运行状态。

Rationale: 经实测（CLI 0.133.0），app-server 创建的线程落盘 `~/.codex/sessions` 并出现在 Codex app 对应项目的会话列表中；而 `codex exec` 的会话被默认来源过滤器排除，对 Codex app 不可见。线程在 Codex app 中的项目归属由 cwd 决定，因此 cwd 必须使用项目本地目录绑定（D-006），不能用临时目录。

Consequences:

- `thread/start` 固定 cwd=绑定目录、`approvalPolicy: never`、`sandbox: workspace-write`、`threadSource: user`；意外的审批请求由客户端兜底拒绝，防止 turn 永久挂起。
- 运行表是执行遥测，不是知识对象；不参与记录/任务晋升，条目上限 100，应用启动时把遗留 running 条目标为 interrupted。
- 协议类型来自 `codex app-server generate-ts`，按 CLI 版本验证；升级 CLI 时需复验线程来源分类（当前 app-server 线程被记录为 vscode 来源）。
- 接入方式采用自启实例 + 自建运行表；连接 `codex app-server daemon` 共享实例（可能带来 Codex app 实时可见）留作后续探索。

## 开放问题

- NebulaAuth token 是否继续保存在 Electron `userData/config.json`，还是在更广泛使用前迁移到系统钥匙串？
- 任务可见性是否继续限定为当前用户创建或执行的任务？
- 后续版本是否需要增加 DMG、签名、自动更新或更强的分发检查？
- app server 的 token 和连接文件是否需要进一步绑定当前用户会话、系统钥匙串或操作确认？
- AI 自动创建远端 Workshop 任务前是否必须先生成任务候选并由用户确认？
- Codex 运行除主面板状态行外，是否需要完整日志视图和系统级完成通知？
- 发送到 Codex 前是否需要让用户预览最终组装的 prompt？
- 是否改接 `codex app-server daemon` 共享实例，以换取 Codex app 的实时可见（当前为列表可见）？
