# 决策

本文件记录会影响后续实现的已接受项目决策和开放问题。

## 已接受

### D-001 最小 repo 文档是默认 AI 上下文

Status: accepted

Decision: repo 使用 `README.md`、`AGENTS.md`、`docs/architecture.md`、`docs/domain.md`、`docs/testing.md`、`docs/release.md` 和 `docs/decisions.md` 作为最小文档集；其中 `docs/domain.md` 和 `docs/release.md` 按任务相关性读取。

Rationale: 当前项目足够小，一组高信噪比文档可以给 AI agent 足够上下文，不需要每个任务都进入重治理流程。

Consequences:

- `docs/project/` 不再是默认 repo 结构的一部分。
- 普通代码任务应从最小上下文和相邻代码开始。
- 发布、打包、签名、公证、自动更新和发布资产任务应读取 `docs/release.md`，不把发布流程散落到临时记录或多个说明文件。
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

### D-004 macOS 本地打包可使用 zip

Status: accepted

Decision: macOS 本地无签名 secrets 的验证包可以只使用 zip；正式 macOS release 当前也使用签名、公证后的 zip。

Rationale: 当前 Electron Builder 配置目标是 zip，本机生成 DMG 存在已知 vendor 下载阻碍。

Consequences:

- `./scripts/package.sh dist` 在本机无签名 secrets 时仍可作为 zip 验证路径。
- 正式 macOS release 的签名、公证和自动更新由 D-010 约束。

### D-005 提供本地 app server 作为 AI bridge

Status: accepted

Decision: Workshop Desktop 启动后提供仅本机可访问的 app server，本地 CLI/AI 通过它请求桌面端执行应用动作。初始验证从新增个人记录开始；当前 bridge 已扩展到记录读写入口、项目/任务只读查询、当前上下文、确认页和 Codex 派发相关能力，具体入口和权限边界以代码、类型和测试为准。

Rationale: Codex 等本地 AI 完成任务后，需要把不适合留在 repo 的信息沉淀为用户可见的项目记录或个人记录。正式能力必须由桌面端拥有状态、写入数据并刷新 UI，不能依赖外部进程直接改内部数据文件。

Consequences:

- app server 只绑定 `127.0.0.1`。
- 每次启动生成 token，并写入 Electron `userData/app-server.json` 供本机 CLI 发现。
- CLI 使用 app server 新增记录，并提供记录、项目、项目任务、当前上下文和确认页相关能力；高风险写入必须遵循 D-008、D-011 和 repo `AGENTS.md` 的确认规则。
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

### D-010 macOS 发布使用公开 GitHub 自动更新

Status: accepted

Decision: macOS 发布版使用签名、公证后的 zip，通过公开 GitHub Release 提供 `latest-mac.yml`、zip 和 blockmap；客户端用 `electron-updater` 检查和下载更新，下载完成后由用户确认重启安装。

Rationale: 仓库和 Release 已公开，公开 GitHub Release 可以最快提供 Mac 用户本机更新体验，并避免在客户端内置可被提取的 GitHub token。electron-builder 26.8.1 当前生成 DMG 会触发 DMG vendor 错误；自动更新不依赖 DMG，因此正式 release 先使用 zip。服务器/CDN 下载源尚未配置好，后续可再迁移到 generic HTTPS 更新源。

Consequences:

- 客户端不内置 GitHub token，也不要求 `WORKSHOP_DESKTOP_UPDATE_TOKEN`。
- macOS release 必须配置 Developer ID Application 签名和 notarization。
- 后续服务器/CDN 可用后，可把更新源切换到 generic HTTPS。

### D-011 Workshop 提供当前上下文和异步确认执行

Status: accepted

Decision: 本地 CLI/AI 可以通过 `context.current` 读取 Workshop Desktop 最近聚焦的对象上下文，并通过 `confirmation.request` 提交异步确认页面和受限动作。用户在 Workshop 确认后，记录正文更新、记录创建、记录标注、任务创建或任务状态更新由 Workshop 主进程执行；调用方通过 `confirmation.status` 查询结果。

Rationale: Codex 与 Workshop 深度协作时，用户常用“这条记录”“当前任务”指代当前窗口对象；同时，批量整理和高风险写入不应让 Codex 同步等待确认，也不应把确认后的业务执行留给外部进程。

Consequences:

- 当前上下文是运行时指针，不是记录、任务或 repo fact；长时间未切换焦点时可标记为 stale。
- 临时确认页面只负责展示和收集确认；确认后的业务动作由 Workshop 服务层执行并刷新 UI。
- 异步确认请求状态写入 `userData/confirmation-requests/index.json`，上限 100 条。
- 受限 Codex token 仍只允许 `record.create`，不能读取上下文或发起确认请求。
- 删除、合并和重组多条记录暂不作为默认自动动作，需要后续单独评审。

### D-012 开发模式和发布包共用本地记录数据

Status: accepted

Decision: Workshop Desktop 默认把 Electron `userData` 固定到稳定目录 `workshop-desktop`，不随 dev 模式的 Electron 默认应用名或发布包 `productName` 改变。`WORKSHOP_DESKTOP_USER_DATA` 只作为显式隔离测试数据的覆盖入口。

Rationale: 本项目自身的设计、发布和执行记录也通过 Workshop Desktop 记录；用户在发布包和 `pnpm dev` 热更新之间切换时，不应看到不同的个人记录、项目记录、设置或 app server 连接状态。

Consequences:

- 个人记录、设置、项目本地目录绑定和 app server 连接文件默认在 dev/release 间共享。
- 启动时会从旧开发目录 `Electron` 合并个人记录到稳定目录；同 ID 记录不覆盖，旧目录不删除。
- CLI 优先读取稳定目录的 `app-server.json`，并兼容旧开发目录，便于迁移期间继续连接当前运行实例。
- 需要空数据或隔离实验时，必须显式设置 `WORKSHOP_DESKTOP_USER_DATA`。

### D-013 客户端分发 Workshop Codex skill

Status: accepted

Decision: Workshop Desktop 发布包内置 `workshop-codex-collaboration` skill，并在首次启动提供轻提示；设置页提供 AI 协作区块，允许用户检查、安装或更新该 skill 到本机 Codex skill 目录。

Rationale: 只安装客户端只能得到本地 CLI bridge，用户的 AI 仍缺少项目 ID 解析、repo 最小文档结构、记录/任务边界和确认页规则。把 skill 作为客户端携带的协作说明包，可以让普通用户在不 clone repo、不运行 pnpm 的情况下获得完整协作体验。

Consequences:

- 默认安装目标是 `~/.codex/skills/workshop-codex-collaboration`，可用 `WORKSHOP_DESKTOP_CODEX_SKILLS_DIR` 在开发验证时覆盖。
- 如果目标目录已有不同内容，安装前必须备份旧目录，不静默覆盖用户改过的 skill。
- 客户端只负责分发和安装 skill；skill 的读取和执行归用户 AI 环境，不在桌面端进程内执行。
- AI 协作区块和首次提示不能扩大 app server token 权限，也不能绕过 D-008 的执行/回写分离。

### D-014 Workshop 是当前注意力工作台，Codex 是记录池理解与执行入口

Status: accepted

Decision: Workshop Desktop 的稳定定位是人的当前注意力工作台；Codex / 用户 AI 是记录池的理解、检索、整理和执行入口。Workshop Desktop 提供当前上下文、记录/任务入口、确认页和安全写入通道；CLI 是交互方式，`workshop-codex-collaboration` skill 是跨项目协作规范。

Rationale: 记录数量增长后，若把 Workshop 扩展成完整知识库、流程本体或复杂类型系统，会污染当前执行入口并增加产品负担。更稳的边界是：Workshop 负责让用户聚焦和确认，Codex 负责理解材料、生成候选整理和执行代码任务，repo 文档负责保存已审查的长期事实。

Consequences:

- 记录仍是人的思考材料，不升级成任务、决策、迭代或 repo fact 的类型系统。
- 记录池整理优先增强检索、标注、关联和确认流程，不默认新增复杂固定类型。
- 新增短记录可以由 AI 直接创建；改写已有记录、创建任务、改变任务状态、批量整理、删除、合并或重组记录需要用户确认。
- 稳定事实进入 repo 时必须经过最小文档边界检查；不要把 Workshop 记录原文整段搬入 repo。

### D-015 CLI 能力由主进程服务面驱动

Status: accepted

Decision: CLI 能力补齐不按“缺一个命令补一个命令”推进；先确认主进程服务层、app server 权限面和 confirmation action 是否清晰、可组合、可测试。CLI 只做统一命令门面，具体接口名、method 和参数由代码与测试维护。

Rationale: 如果 CLI 需要绕过服务层、直接读写 `userData`，或在文档里手工维护接口清单，说明架构边界还不够稳。合理架构下，命令补齐应主要暴露已有服务能力，而不是新建第二套业务逻辑。

Consequences:

- 架构文档只记录服务边界和原则，不枚举 RPC method、CLI 子命令或接口路径。
- 新 CLI 能力优先补主进程服务能力、权限 allowlist、confirmation action 和测试，再补命令封装。
- 记录归档、记录状态、批量整理、任务状态等写入能力必须明确低风险直写或确认页路径。
- CLI 不保存业务事实，也不把直接修改本地数据文件作为正式实现。

### D-016 记录正文是唯一叙事源，标注是标准化索引

Status: accepted

Decision: 记录整理采用“正文 + 标注”双层模型。记录正文是唯一面向人的叙事源；AI 需要补充摘要、执行结果、结论、风险或后续建议时，应追加或改写正文。记录标注只保存标准化短字段，例如 `intent`、`retention`、`resolution`、`tags`、`relatedRecordIds` 和 `relatedTaskId`。

Rationale: 如果 metadata 承载长摘要，会产生“正文一套、AI 看另一套”的分裂。把可读内容放回正文，把 metadata 收敛成可重算的索引字段，可以支持 AI 检索和归类，同时保持记录仍是人的思考材料。

Consequences:

- `record.annotate` 只用于低风险结构化标注，不写长篇正文内容。
- `record.appendBody` / `record.updateBody` 仍是补充可读整理内容的正式路径，并需要用户确认。
- 标注分类不是记录本体的强类型；后续调整分类时优先重跑标注，而不是迁移记录正文或扩展记录状态机。
- UI 可以选择展示少量标注 badge，但正文仍是记录详情的主内容。

## 开放问题

- NebulaAuth token 是否继续保存在 Electron `userData/config.json`，还是在更广泛使用前迁移到系统钥匙串？
- 任务可见性是否继续限定为当前用户创建或执行的任务？
- 后续版本是否需要增加更强的分发检查，或迁移到自有 HTTPS 更新源？
- app server 的 token 和连接文件是否需要进一步绑定当前用户会话、系统钥匙串或操作确认？
- 异步确认动作集合是否需要扩展到删除、合并、重组记录，还是继续保持窄集合？
- Codex 运行除主面板状态行外，是否需要完整日志视图和系统级完成通知？
- 发送到 Codex 前是否需要让用户预览最终组装的 prompt？
- 是否需要为记录归档或记录状态变更提供正式 CLI / confirmation action，而不是只能通过 UI 操作？
- 是否改接 `codex app-server daemon` 共享实例，以换取 Codex app 的实时可见？当前为列表可见；实测（CLI/app 0.133.0）turn 进行中在 Codex app 打开该线程，页面可能挂住，需重启 Codex app 才恢复，执行本身不受影响。
- 派发执行是否需要工作区隔离（per-run worktree 或要求干净工作区）？实测派发 agent 与本地未提交修改在同一 checkout 并发写作。
