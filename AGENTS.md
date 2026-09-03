# AI 协作规则

本 repo 使用最小文档结构支持 AI 开发。普通代码任务开始时不要默认启动完整治理流程。

## 默认上下文

任务开始时，只读取最小必要上下文：

- `README.md`
- `AGENTS.md`
- `docs/architecture.md`
- `docs/testing.md`
- `docs/decisions.md`
- 当任务涉及产品术语、记录、项目、任务或任务状态时，读取 `docs/domain.md`
- 当任务涉及应用资产、打包、发布、GitHub Release、签名、公证或自动更新时，读取 `docs/release.md`
- 当任务涉及 Workshop 后端 API、网页端、独立 Todo CLI 或跨客户端升级时，读取 `docs/architecture.md` 的关联系统边界，并检查同级 `../workshop-todo`、`../workshop-todo-website`、`../workshop-todo-cli` 仓库（存在时）的当前代码和各自 `AGENTS.md`

然后再检查本次请求相关的代码路径。代码是当前运行时事实；文档负责解释意图和约束。如果代码和文档冲突，先核实现有运行行为，并指出可能过期的文档。

完成最小上下文读取后，每次开发任务都检查主要依赖 `../workshop-todo` 的远端新提交：仓库存在且工作树可访问时，执行 `git -C ../workshop-todo fetch --prune origin`，再比较 `HEAD...origin/main`。这一步只更新远端引用，不自动 pull、merge、rebase 或修改后端工作树；发现落后时先报告提交范围和对本任务的影响。网络不可用或仓库不存在时说明证据缺口，但不阻塞纯本地任务。

## 执行规则

- 修改范围保持在用户请求和相邻代码内。
- 保持当前产品边界：Workshop Desktop 是轻量个人执行客户端，不是完整知识库或项目管理系统。
- 个人笔记、脑暴、会议原文和未确认想法默认不进入 repo。
- 只有当变更影响运行行为、架构边界、领域术语、启动方式、测试方式、打包方式、应用资产、发布文档或已接受决策时，才新增或更新 repo 文档。
- 发布文档使用 `docs/release.md` 独立维护。应用资产如果影响安装包、Release 展示、签名/公证、自动更新或分发说明，也应同步更新 `docs/release.md`。
- 短期执行记录优先放在任务系统或当前对话中；只有成为长期项目事实后，才进入 repo 文档。
- 需要把任务沉淀写入应用时，应优先调用本地 app server/CLI；不要把直接修改 `userData` 文件当作正式能力。
- 修改 Workshop 共享任务、项目、认证、响应或分页契约时，必须同时评估后端、网页端、Desktop 和独立 Todo CLI；保持后端向后兼容并按 `docs/testing.md` 做跨仓库验证。
- 不要混淆两个 CLI：`workshop-todo-cli` 发布的 `todo` 直接访问远端任务系统，本 repo 发布的 `workshop` / `workshop-desktop` 只访问正在运行的 Desktop 本地 app server。

## AI 记录边界

记录是人类使用的思考载体，不是任务、决策、迭代或 repo fact 的类型系统。

- AI 可以在任务完成、讨论形成稳定结论、或用户要求记录时新增一条记录。
- AI 默认不编辑、删除或改写用户已有记录。
- AI 默认不创建 Workshop 任务；用户可以在 Workshop Desktop 中阅读、编辑记录，并按需要使用现有“转为任务”能力。
- 用户在 Workshop 临时确认页确认后，Workshop 可以执行已声明的记录正文更新、记录创建、记录标注、任务创建或任务状态更新；删除、合并和重组多条记录不属于默认动作。
- 记录里可以写迭代草稿、任务草稿、决策草稿或 repo fact 候选，但这些内容仍然只是记录内容。
- 只有用户把记录转为任务后，它才进入任务体系。
- 只有 agent 修改 repo 文件并经过本 repo 文档边界检查后，内容才成为 repo fact。

## AI 记录密度

AI 创建记录时默认使用短记录。记录面向人类后续阅读和编辑，不面向 AI 自我复盘。

- 默认正文优先控制在 3-6 行。
- 优先保留结论、影响和下一步。
- 不默认保留完整对话、完整推理过程、测试日志或代码细节。
- 不把记录写成正式需求文档、架构文档或任务说明书。
- 只有当用户明确要求完整记录，或内容涉及重要决策、多方案取舍、复杂边界时，才写更长记录。
- 长记录也必须结论在前、补充在后；前几行应足够让用户判断这条记录是否值得继续阅读。

## AI 记录方式

正式记录必须通过正在运行的 Workshop Desktop app server/CLI 创建。优先使用自定义 CLI `workshop`（`workshop-desktop` 是同一入口的别名），不要依赖 `npx --yes pnpm app:*` 参数转发作为正式入口。新增记录可直接使用 `record.create`；编辑记录正文或通用高风险动作使用 `confirmation.request`。创建任务优先使用 `workshop task create` 提交包含项目、负责人和可选标签的标准提议，由 Workshop 打开可信确认页并在用户确认后执行。把任务或记录发送给 Codex 执行时，应通过 Workshop Desktop 的 `codex.send` 服务层能力，不要让客户端直接打开 Terminal。

本 repo 的 Workshop 项目 ID 是 `98`，项目名是 `workshop-desktop`。创建项目记录时使用：

```bash
workshop record create --title "记录标题" --body "记录内容" --scope project --project-id 98 --project-name workshop-desktop --open
```

也可以从文件读取记录正文：

```bash
workshop record create --title "记录标题" --body-file ./path/to/note.md --scope project --project-id 98 --project-name workshop-desktop --open
```

检查是否已有记录时，先用轻量列表，不要默认拉取正文：

```bash
workshop record list --project-id 98 --json
```

`record list` 默认只返回记录元数据（如 id、标题、状态、范围、项目/任务归属和时间戳），用于标题级筛选和去重判断。只有需要阅读某条候选记录正文时，再单独读取：

```bash
workshop record get --id <record-id> --json
```

只有在已知结果集很小且确实需要批量正文时，才使用 `record list --include-body`。

发布版在非 Windows 平台启动时会自动安装用户级 `workshop` 和 `workshop-desktop` 命令；Windows 发布包当前尚未自动安装 CLI shim。开发环境如果 `workshop` 还没有安装到 PATH，可在 repo 根目录执行 `bash scripts/install-workshop-cli.sh`。如果桌面端没有运行，CLI 报错后应停止并告知用户；不要改为直接写 `~/Library/Application Support/workshop-desktop/personal-records/`。

## Workshop Desktop 派发的执行

当环境变量 `WORKSHOP_DESKTOP_SERVER_PORT` 和 `WORKSHOP_DESKTOP_SERVER_TOKEN` 存在时，本次执行由 Workshop Desktop 派发。派发不附带额外说明：执行内容就是用户消息本身，项目 ID 用上文声明的本 repo Workshop 项目 ID，运行与任务/记录的关联由 Workshop Desktop 的运行状态表持有。此时适用：

- 回写遵循上文 AI 记录边界与密度规则，方式优先用上文 CLI（它会自动使用这两个环境变量）；无法使用 CLI 时，直接 `POST http://127.0.0.1:${WORKSHOP_DESKTOP_SERVER_PORT}/rpc`，请求头 `Authorization: Bearer ${WORKSHOP_DESKTOP_SERVER_TOKEN}`，请求体 `{"method":"record.create","params":{"title":"<标题>","bodyMarkdown":"<正文>","scopeType":"project","projectId":98}}`。
- 派发注入的 token 允许 `record.create`、`record.search`，以及当前活跃运行项目范围内的 `task.list`、`task.get`、`task.creationContext` 和 `task.create.request`。任务写入只能提交确认请求；不要尝试直接创建、修改、删除任务，也不要调用 `context.current`、通用 `confirmation.request` 或 `codex.send`。

## 发布与自动更新流程

当用户要求“提交并发布新版本”“做个新版本”“发布到 GitHub”，或处理打包、签名、公证、自动更新、发布资产问题时，先读取 `docs/release.md`。当前发布事实以 `.github/workflows/release.yml`、`scripts/release.sh`、`package.json` build 配置和 `docs/release.md` 为准。

## 提交前检查

代码变更收尾前：

- 按 `docs/testing.md` 运行最窄但可靠的验证。
- 检查本次任务是否新增或修改了 repo 文档。
- 对每个新增或修改的文档，独立审查：
  - 它是长期项目事实，还是个人想法？
  - 它是否和代码、README 或已接受决策冲突？
  - 它是否应该合并进现有最小文档，而不是创建新文件？
  - 如果涉及应用资产或发布文档，它是否说明了稳定归属、生成物边界和发布影响？
  - 不确定内容是否标成 open 或 proposed，而不是 accepted？
  - 它是否重复了本该留在 repo 外的临时任务证据？

如果有专门的文档审查 skill，提交前文档检查应使用该 skill。实现代码的 agent 不应静默自我接受新的项目事实。
