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

Decision: 项目到本地工作目录的映射存储在桌面端本地配置中。D-018 之后，目标模型是本地项目绑定本地目录；旧版 Workshop 项目目录绑定继续作为兼容数据，并迁移为本地项目候选。

Rationale: Codex 执行需要明确 `cwd`，但同一个项目在不同设备上的本地路径可能不同，不能把它当作后端项目事实或 repo 文档事实。

Consequences:

- 本地目录绑定存在 Electron `userData/config.json`。
- 未绑定时，项目任务列表和项目记录列表提示用户绑定本地目录。
- 绑定后显示本机完整路径，点击打开对应文件夹。
- 后续发送任务或记录到 Codex 时，应优先使用本地项目绑定路径作为工作目录；旧的远端项目绑定路径只作为迁移期兼容。

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

Decision: `codex.send` 只能由用户手势（桌面端 UI 的发送入口）或持有完整 token 的本机调用方触发。桌面端派发 Codex 执行时，注入给被执行 agent 的是受限 token；它允许 `record.create`、`record.search`，以及活跃运行关联项目内的任务只读和任务创建提议，但不允许直接写任务、调用通用确认页或递归触发 `codex.send`。

Rationale: AI 需要结合当前项目待办判断重复工作、责任人和执行上下文，也需要把明确结论提出为待办；但任务和记录正文来自外部输入，存在提示注入风险。读取必须限定到用户主动派发的活跃项目，写入必须停留在用户确认一侧。

Consequences:

- app server 维护两级 token：完整 token 写入 `userData/app-server.json`；受限 token 仅通过环境变量 `WORKSHOP_DESKTOP_SERVER_PORT` / `WORKSHOP_DESKTOP_SERVER_TOKEN` 注入被派发的 Codex 进程。
- 受限 token 的任务访问仅在对应项目存在活跃 Codex 运行期间有效；其他项目会被拒绝。
- 受限 token 可以读取项目任务、成员和标签，并提交标准化任务创建提议；提议由 Desktop 生成可信确认页，确认后才执行。
- 受限 token 不能直接创建、修改或删除任务，不能调用通用 `confirmation.request`，也不能调用 `context.current` 或 `codex.send`。
- 通过 bridge 创建的记录带 `origin: agent`，与人工记录区分；origin 跟随创建者，编辑不改变来源。
- 后续若实现"任务自动派发"，必须先重新评审本决策，不得默认绕过用户手势。

### D-009 Codex 执行默认走 app-server 后端并记录运行状态

Status: accepted

Decision: 发送到 Codex 默认使用桌面端自启的 `codex app-server` 实例（JSON-RPC：`initialize → thread/start → turn/start`），`codex exec` 保留为静默后端可选项（`backend: "exec"`）。每次发送在 `userData/codex-runs/index.json` 记录运行条目（runId、backend、threadId/turnId、关联任务/记录、cwd、status、lastMessage、startedAt/completedAt），工作台和托盘面板显示最近运行状态。

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
- 受限 Codex token 不能读取全局当前上下文或发起通用确认请求；它只能在活跃运行项目内通过专用任务创建提议入口发起可信确认。
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

### D-017 工作台主页面与托盘面板分离

Status: accepted

Decision: Workshop Desktop 保留从菜单栏或系统托盘触发的轻量托盘面板，同时提供独立的工作台主页面。Dock、应用菜单、全局快捷键和首次登录流程打开工作台主页面；托盘点击继续打开快速面板。

Rationale: 当前面板的窗口行为是小型、置顶、贴近托盘、失焦隐藏，更适合作为快速入口，不适合作为用户从 Dock 打开的稳定应用主页面。分离两者可以补齐应用存在感，同时保持托盘快速操作体验。

Consequences:

- 工作台主页面是正常应用窗口，可调整大小，不置顶，不随失焦自动关闭。
- 应用正常启动、Dock 激活、第二实例打开和全局快捷键都应默认显示工作台主页面；托盘点击才打开轻量托盘面板。
- 工作台主页面的项目列表应与托盘面板项目列表保持相近的行结构和交互语言，减少用户在两种入口之间切换时的认知差异。
- 托盘面板继续保持轻量入口，只承载快速打开项目、记录、桌面便签和最近运行状态。
- 新增主页面不改变 D-003 和 D-014 的边界：Workshop Desktop 仍是个人当前注意力工作台，不扩展为完整知识库或团队项目管理系统。
- 后续入口文案应区分“工作台”和“托盘面板”，避免把两种窗口都称为主面板。

### D-018 Desktop 本地项目独立于 Workshop 后端项目

Status: accepted

Decision: Workshop Desktop 的项目概念优先表示本机本地工作区，不依赖 Workshop 后端项目存在。记录、本地目录绑定和 Codex 执行上下文应归属 Desktop 本地项目；Workshop 后端项目只作为可选任务源绑定。

Rationale: 任务和记录是两套系统。记录系统需要在未登录或无远端项目时仍可使用；任务可以来自 Workshop 后端，但不应反向决定 Desktop 的项目身份和记录归属。

Consequences:

- Desktop 本地项目拥有独立 ID、名称、本地目录和可选 Workshop 项目绑定。
- Desktop 本地项目名称可通过工作台或托盘面板项目行右键菜单重命名；绑定远端任务源后，项目行显示名仍使用本地项目名，Workshop 远端项目名称不在桌面端本地改名。
- Desktop 本地项目可通过工作台或托盘面板项目行右键菜单关联、更换或解除远端任务源；同一设备上一个远端任务源只能关联到一个本地项目。
- 添加本地项目先选择本地目录，项目名默认使用文件夹名；历史或迁移产生的未绑定项目仍可作为项目记录容器使用，目录绑定在需要打开文件夹或发送到 Codex 前完成。
- 登录不应阻塞本地项目和本地记录的基础使用；登录只影响远端任务源连接，工作台和托盘面板都应免登录显示本地项目。
- 工作台和托盘面板项目列表可以同时展示 Desktop 本地项目和用户主动拉取到的 Workshop 远端项目；远端项目仍只作为任务源上下文。
- 工作台和托盘面板项目行点击都进入项目工作区；桌面便签作为独立浮动工作面入口存在。
- 本地项目和远端项目都应在项目行内展示本地目录文字；未绑定时显示“未绑定目录，点击绑定”，点击该文字提供绑定或打开入口，不再额外展示“已绑定/未绑定”状态标签。
- 同一设备上不允许两个独立本地项目绑定同一个本地目录；旧远端目录绑定如果与本地项目目录相同，应归并为本地项目的远端任务源关联。
- 旧的 `projectLocalDirectories` 仍保留兼容和 fallback；升级迁移必须幂等，优先合并到已有本地项目，只有找不到可合并对象时才创建 `legacy-workshop-*` 本地项目候选。
- 记录可以挂靠本地项目；远端任务可以引用或关联记录，但不能拥有记录系统。
- 后续实现应逐步把 UI、记录 scope 和 Codex `cwd` 从远端 `projectId` 迁移到本地项目上下文。

### D-019 账号状态归设置，工作台只呈现远端任务源状态

Status: accepted

Decision: Workshop 账号登录/退出由设置页承载。工作台主页面不再直接展示验证码登录表单或“连接远端”主按钮，只呈现远端任务源是否可同步，并提示用户到设置页处理账号；设置页仍不展示 baseUrl、Bearer Token 或本地 Header 等高级认证配置。

Rationale: “连接远端”容易被理解成本地项目或 Git 仓库连接，而当前实际功能只是 Workshop 账号登录/退出和远端任务同步。把账号状态放进设置页更符合系统设置心智；工作台继续强调本地项目和本地记录可离线使用，只在需要远端任务源时提示账号状态。

Consequences:

- 设置页显示 Workshop 账号状态；未登录时提供邮箱/手机号验证码登录，已登录时提供退出登录。
- 工作台主页面显示远端任务源状态，并提供手动刷新；不再直接执行登录或退出登录。
- 项目列表标题区保留给添加项目；本地项目通过右键菜单关联、更换或解除远端任务源。
- 高级认证模式可以保留为内部兼容能力，但不作为普通设置项暴露。
- 退出登录只清远端身份和远端任务数据，不删除本地项目、本地目录绑定或本地记录。

### D-020 Workshop Todo 按四仓库产品系统整体规划

Status: accepted

Decision: `workshop-todo`、`workshop-todo-website`、`workshop-todo-cli` 和 `workshop-desktop` 作为同一个 Workshop Todo 产品系统整体分析和规划，但继续保持清晰的职责边界与独立发布。后端拥有远端业务契约；网页端、独立 `todo` CLI 和 Desktop 是三个面向不同使用场景的消费者。

Rationale: 四个仓库共享项目、任务、成员、认证和任务状态语义。单仓库升级如果不检查其他消费者，会造成状态集合、响应结构、分页或认证行为漂移；同时，把客户端合并或让客户端互相依赖又会破坏现有产品边界和发布灵活性。

Consequences:

- 共享业务契约变更必须同时评估四个仓库，并记录兼容窗口和消费者迁移顺序。
- Desktop 开发任务启动时对主要依赖 `workshop-todo` 执行只读 `fetch` 和 ahead/behind 比较；发现新提交时先分析影响，不自动更新后端工作树。
- `workshop-todo` 的实际路由、模型和响应实现是当前运行时事实；文档或客户端映射与其冲突时，先验证后端行为并修正漂移。
- 后端优先通过向后兼容变更上线，三个客户端可按自身节奏升级；破坏性旧契约只能在消费者迁移完成后移除。
- `workshop-todo-cli` 的 `todo` 与 Desktop 的 `workshop` / `workshop-desktop` CLI 保持独立，前者操作远端任务，后者操作本地 Desktop bridge。
- Desktop 继续拥有本地项目和记录，不能因为整体规划而把这些事实迁入远端后端；网页端继续承担完整团队协作界面，Desktop 不扩展为其桌面复制品。

### D-021 统一任务创建契约与受限 AI 提议

Status: accepted

Decision: Desktop 直接创建任务、记录转任务和 `workshop` CLI/AI 创建提议共用同一业务契约：必须提供项目、任务内容和负责人，项目标签可选，初始状态显式为 `pending`。Desktop 内用户提交创建面板即完成确认；CLI 与被派发 AI 只能调用专用任务创建提议，由 Desktop 生成可信确认页，用户确认后才创建任务。

Rationale: “记录转任务”和“直接创建任务”只是任务内容来源不同，不应形成两套校验或状态语义。负责人保证任务有明确承接人，项目标签用于表达 Bug、技术方案评审、需求、想法等场景；场景分类与任务生命周期是两个维度，不能借 `pending_review` 等状态代替标签。AI 需要读取任务上下文并协助提出任务，但不应通过通用 HTML/动作或直接 API 绕过用户确认。

Consequences:

- 任务创建面板统一负责成员、已选项目标签、内容和初始状态校验；记录转任务成功后才更新记录关联，避免任务失败却提前标记已转化。
- 标签保持项目级扁平结构并允许多选；客户端不在创建任务时隐式创建标签。
- `workshop task create` 接受负责人和可选标签，返回异步确认请求而不是已创建任务；独立 `todo` CLI 仍是直接访问远端系统的客户端，不改变其职责。
- 被派发 agent 在 Codex 运行期间只能读取当前关联项目的任务、成员和标签，并可提交专用创建提议；项目作用域随运行结束撤销。
- 受限 agent 不能调用 `context.current`、通用 `confirmation.request`、`codex.send`，也不能直接修改任务状态或删除任务。
- 共享远端任务契约保持向后兼容；本次能力使用后端既有负责人、标签和状态字段，网页端与独立 Todo CLI 无需同步改码，但必须纳入回归验证。

### D-022 项目工作区同页聚合待办与记录

Status: accepted

Decision: 项目行统一进入项目工作区，在同一滚动区域中展示可独立折叠的“待办”和“记录”分区。两类条目均使用单行列表，新增入口分别放在分区标题旁；顶部搜索同时作用于待办内容、状态、标签和记录标题、状态、来源。任务与记录只在 Renderer 视图层聚合，继续保持各自的数据归属、状态语义、详情窗口和写入链路。

Rationale: 原有项目任务列表和项目记录列表分散了同一项目的当前上下文，双行条目也增加了窗口体积。统一工作面可以减少进入和新增步骤，但不能因为展示合并就模糊远端任务与本地记录的模型边界。

Consequences:

- 项目列表目标复用记录窗口承载项目工作区；个人记录列表、记录详情、任务详情和独立记录编辑窗口继续保持原行为。
- “待办 +”锁定当前已关联远端项目并创建 `pending` 任务；未登录、未关联、加载中或同步异常时禁用，并显示对应引导。
- “记录 +”一步打开独立完整记录编辑窗口；空项目不再自动创建空白记录。
- 两个分区默认展开，折叠状态只在当前窗口内保存；排列压缩时必须同时保留两个分区标题。
- 待办同步失败时保留当前缓存并暂停新增，记录始终可用；完成任务和完成记录继续显示，任务归档不在本决策中实现。
- 统一搜索不读取记录正文，也不增加分页、后端接口、preload/RPC、记录格式或共享任务契约。

### D-023 窗口按工作上下文整理且布局状态独立

Status: accepted

Decision: 便签窗口默认只整理触发窗口所属的当前工作组。项目工作组以 Desktop 本地项目 ID 为首选身份，项目工作区是排列锚点，相关任务详情、项目记录详情和草稿作为同组工作窗口；个人记录和全局任务分别保持独立。窗口排列只管理位置、尺寸和临时紧凑呈现，不改写列表折叠、搜索或编辑状态。

Rationale: 项目工作区已经聚合待办和记录，继续沿用“任务、项目记录、个人记录”固定分列会把同一项目上下文拆开，并可能在未关联远端任务源时误整理全部窗口。窗口整理需要可预测、可恢复，不能让打开详情、输入草稿或内容自动适配造成桌面跳动和覆盖。

Consequences:

- 项目分组优先使用 `localProjectId`；任务窗口通过本地项目的远端任务源关联映射到同组，旧远端项目目标可以用 `projectId` 兼容。
- 当前屏幕与当前 macOS Space 的过滤继续保留；默认整理不带入个人记录、其他项目或其他任务组。
- 打开任务或记录详情时只在来源窗口旁就近放置，不自动重排整个工作组；完整重排必须由用户点击明确的布局按钮触发。
- 项目工作区作为锚点，任务与记录详情不再按模型拆列，而按最近使用顺序在相邻列中排列；空间不足时允许保留标题可见的级联，不能完全重叠。
- 排列高度约束持续到用户手动移动、缩放或进入受保护编辑状态。待办创建面、未保存记录草稿、未保存任务备注和弹出选择面会暂停同组整理。
- 临时紧凑态保留原有折叠状态；用户点击分区或搜索时退出紧凑态。搜索期间临时展开分区，关闭后恢复搜索前状态。
- 整理入口使用布局语义图标和范围文案，并仅在触发窗口显示结果反馈；置顶入口必须明确其作用于所有便签窗口。
- 本决策只增加 Desktop 内部窗口状态与 IPC，不修改后端、任务/记录数据格式或跨仓库共享契约。

## 开放问题

### MVP 边界审查（2026-07-08）

基于真实代码审查的 MVP 边界结论。

**已实现且边界清晰（MVP 可用）：**

- 记录 CRUD + scope(project/none/task) 筛选：完整
- 注入路径（push）：`buildCodexUserInput` 刻意精简，只塞 body/title，不查历史。是设计意图，不是缺陷
- 取用路径（pull）：`record.search` 搜 title + body 正文，agent token 可调用，写取用日志
- Codex 运行遥测：codex-runs 记每次 turn，Tray/Home 展示
- 异步确认页：confirmation.request/status 完整
- 便签窗口：独立 BrowserWindow，多实例浮动
- token 权限隔离：full/agent 两级。该历史快照当时仅开放 record.create + record.search；任务读取与创建提议能力已由 D-021 在活跃项目作用域内补充。

**已实现但边界不完整（需补齐才构成 MVP 闭环）：**

1. origin 的 UI 展示仍不完整：数据层完整（agent 创建即标 agent，不可被人类编辑覆盖），项目工作区的记录单行已经展示“人工/AI”，但个人记录列表和记录详情仍未展示来源。MVP 要求用户在所有记录入口都能识别哪些是 AI 写的，这仍是缺口。
2. 取用日志无 UI 入口：`record-searches/index.json` 忠实写入，但没有任何地方读取展示。codex-runs 有 UI，record-searches 没有。MVP 要求用户能看到 agent 查了什么，这是缺口。

**注入断环（MVP 前提）：**

`buildCodexUserInput` 当前零注入——只塞当前记录的 body/title，不收 localProjectId，不查历史相关记录。注入路径的能力存在但没接好，这是闭环的断点。补注入逻辑是 MVP 范围内的工作，不是后续阶段。

**MCP 适配（非 MVP）：**

取用路径通过 app server RPC 已实现。MCP 协议适配外部 Agent（Claude Code 等）是后续扩展，不阻塞 MVP 闭环。

---

- NebulaAuth token 是否继续保存在 Electron `userData/config.json`，还是在更广泛使用前迁移到系统钥匙串？
- 任务可见性是否继续限定为当前用户创建或执行的任务？
- 后续版本是否需要增加更强的分发检查，或迁移到自有 HTTPS 更新源？
- app server 的 token 和连接文件是否需要进一步绑定当前用户会话、系统钥匙串或操作确认？
- 异步确认动作集合是否需要扩展到删除、合并、重组记录，还是继续保持窄集合？
- Codex 运行除工作台和托盘面板状态行外，是否需要完整日志视图和系统级完成通知？
- 发送到 Codex 前是否需要让用户预览最终组装的 prompt？
- 是否需要为记录归档或记录状态变更提供正式 CLI / confirmation action，而不是只能通过 UI 操作？
- 是否改接 `codex app-server daemon` 共享实例，以换取 Codex app 的实时可见？当前为列表可见；实测（CLI/app 0.133.0）turn 进行中在 Codex app 打开该线程，页面可能挂住，需重启 Codex app 才恢复，执行本身不受影响。
- 派发执行是否需要工作区隔离（per-run worktree 或要求干净工作区）？实测派发 agent 与本地未提交修改在同一 checkout 并发写作。
