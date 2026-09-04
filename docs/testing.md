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
- Workshop API 服务层的 allowlist 请求构造、token 刷新、任务筛选、项目标签读取和统一创建任务输入校验。
- app server 对专用任务创建提议、受限 agent 项目作用域和通用确认能力隔离的静态边界。
- `workshop task create` 对负责人、可选标签名的解析，以及向 app server 提交标准 `pending` 创建提议的本地集成链路。

提交前检查会自动运行这些 smoke tests。

## 开发任务启动时的后台新提交检查

`workshop-todo` 是 Desktop 的主要远端业务依赖。每次开发任务读取完最小上下文后，如果同级后台仓库存在，先执行只读远端同步并比较本地与远端：

```bash
git -C ../workshop-todo fetch --prune origin
git -C ../workshop-todo rev-list --left-right --count HEAD...origin/main
```

`fetch` 只用于发现新提交，不代表当前开发任务应自动升级后台。发现本地落后时，先审查提交和共享契约影响；只有用户明确要求或当前任务本身包含后台同步时，才在确认工作树干净后使用 `git pull --ff-only`。网络检查失败不应阻塞只涉及 Desktop 本地能力的工作。

## 跨仓库兼容性验证

涉及 Workshop 共享项目、任务、成员、认证、响应 envelope、分页或实时事件契约时，不能只验证 Desktop。若四个仓库位于同级目录，至少运行：

```bash
(cd ../workshop-todo && go test ./...)
(cd ../workshop-todo-cli && go test ./...)
(cd ../workshop-todo-website/frontend && npm ci && npm run build:check)
bash scripts/pre-commit-check.sh
```

当前后端 `go test ./...` 会运行单元测试，但依赖 PostgreSQL 的迁移、事务、持久化事件与实时链路测试在未配置 `WORKSHOP_TEST_POSTGRES_DSN` 时会跳过，因此仍不能替代真实数据库、网关和权限场景的 API 验证。共享契约升级在发布前还需使用同一测试账号和项目完成最小端到端验证，至少覆盖登录/刷新、项目与任务列表分页、任务创建与状态流转、成员权限以及错误响应。

发布顺序默认是：先发布向后兼容的后端，再升级网页端、独立 `todo` CLI 和 Desktop；确认消费者完成迁移后，才允许删除旧字段、旧状态或旧行为。纯客户端能力可以独立发布，但不得预设尚未上线的后端契约。

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
workshop project members --project-id 98 --json
workshop project tags --project-id 98 --json
workshop task list --project-id 98
workshop task get --project-id 98 --id <task-id> --json
workshop context current --json
```

预期结果：

- 读取命令通过 app server 返回记录、项目或任务，不直接读取 `userData` 文件。
- `workshop record list` 默认只返回记录元数据，不包含 `bodyMarkdown`；需要正文时使用 `workshop record get --id <record-id> --json`，只有小结果集批量读正文时才使用 `--include-body`。
- 打开记录命令通过 app server 请求桌面端打开已有记录窗口。
- 标注命令通过 app server 更新记录 metadata，不改写记录正文。
- 当前上下文命令返回最近聚焦的 Workshop 窗口对象；如果长时间未切换焦点，结果可标记为 `stale`。
- 任务读取要求桌面端已有有效登录配置。

记录归档与恢复验证：

```bash
workshop record archive --project-id 98 --ids <record-id-1>,<record-id-2> --reason "已完成整理" --json
workshop confirmation status --id <request-id> --json
workshop record list --project-id 98 --status archived --json
workshop record search "<关键词>" --project-id 98 --include-archived --json
workshop record restore --project-id 98 --ids <record-id-1>,<record-id-2> --json
```

预期结果：

- 归档和恢复命令立即返回待确认的 `requestId`，不会直接改变状态，也没有跳过确认参数。
- 确认页由 Desktop 模板生成并逐条展示记录；取消或关闭时不写入。
- 确认归档后，所选记录整批变为 `archived`，从当前列表隐藏，但可被显式归档列表和包含归档的检索发现；正文、标注和任务关联保持不变。
- 确认恢复后，记录回到归档前的 `active` 或 `completed`；旧归档数据没有 `archivedFromStatus` 时回到 `active`。
- 任一 ID 不存在、不属于项目、状态不匹配、确认后更新时间变化或详情窗口处于未保存编辑态时，整批失败且其他记录也不改变。
- 归档成功后，所选记录的非编辑详情窗口关闭，项目工作区与其他列表收到刷新通知；恢复不会自动打开记录窗口。
- 使用受限 agent token 时，只能为当前活跃 Codex 运行关联项目提交 1-50 条记录；归档/恢复不会调用远端 Workshop 任务 API。

统一任务创建验证：

```bash
workshop task create "验证统一任务创建" --project-id 98 --assignee me --tags Bug --json
```

预期结果：

- CLI 先按项目解析负责人和可选标签；缺少负责人或已选标签不属于项目时拒绝提交，省略标签时提交空标签集合。
- CLI 返回 `requestId` 和待确认状态，不直接创建任务。
- Desktop 打开由自身模板生成的确认页；确认后以 `pending` 状态创建任务，取消或关闭时不写入。
- 首页直接创建与记录“转为待办”使用同一个创建面板；均要求负责人，标签可选。记录只在任务成功创建后标记为已转任务。
- 记录窗口打开创建面板时扩展为完整表单尺寸，关闭或创建完成后恢复原窗口宽度。
- 首页提供明确的任务列表入口；首页与跨项目 CLI 查询均采用受控低并发同步，标签按需读取，单个项目失败时保留其余项目和上次成功结果。
- 可分别使用 Bug、技术方案评审、需求、想法等项目标签验证场景筛选；标签不改变任务状态语义。
- 已选标签在首页、任务列表和任务详情中均可见；紧凑列表最多显示两个标签并提示剩余数量。
- CLI/AI 确认创建任务后，已打开的首页和任务窗口无需手动刷新即可显示新任务。

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
- 项目工作区未绑定本地目录时显示“未绑定目录，点击绑定”。
- 工作台和托盘面板项目行点击打开同一个项目工作区；重复点击只聚焦已有窗口，只有目录文字点击触发绑定或打开目录。
- 点击提示后可以选择本地文件夹。
- 绑定后项目工作区显示当前项目的本地路径。
- 再次点击路径会打开对应文件夹。

涉及项目工作区的改动，还需要手工检查：

- 在 360px 和常规便签宽度下，待办与记录条目都保持单行；标题和任务状态不被隐藏，标签、来源和更新时间按既定优先级让位。
- “待办”和“记录”默认展开、分别折叠；窗口整理压缩后两个分区标题仍完整可见。
- 顶部搜索同时匹配待办内容、状态、标签和记录标题、状态、来源，分区计数显示当前命中数量，但不搜索记录正文。
- “待办 +”锁定当前项目，创建状态为 `pending` 的待办后自动出现在当前分区；“记录 +”直接打开独立完整记录窗口，保存后工作区自动更新。
- 完成或恢复任务、记录后条目仍保留；归档或已转任务记录继续隐藏，项目工作区不提供伪归档入口，既有任务详情中的归档操作仍提示未实现且不隐藏任务。
- 分别覆盖已关联在线、同步异常有缓存、未登录、未关联、零待办、零记录和旧远端项目目标；同步异常时缓存待办仍显示且新增暂停，记录仍可用。
- 点击待办打开既有任务详情便签，点击记录打开既有记录详情窗口，窗口排列行为不回归。
- 从项目工作区整理窗口时，只移动同一窗口工作组；未关联远端任务源的本地项目也不能带动个人记录、其他项目或全局任务窗口。
- 整理后项目工作区作为锚点，相关任务和记录详情按最近使用顺序就近排列；窗口数量超出一列时不完全重叠，当前屏幕和 macOS Space 之外的窗口不受影响。
- 整理紧凑态不改写用户原有的分区折叠状态；点击分区或打开搜索后退出紧凑态，关闭搜索恢复进入搜索前的折叠状态。
- 打开待办创建面、未保存记录草稿、记录项目选择面或存在未保存任务备注时，同组整理暂停并给出轻提示；创建面保持完整表单宽度。
- 手动移动或缩放已整理窗口后解除该窗口的排列高度约束；后续搜索、同步和内容变化不会让仍受约束的窗口重新覆盖相邻窗口。
- 整理按钮使用明确的布局图标和当前范围文案；整理完成只反馈当前触发窗口。置顶提示明确作用于所有便签，配置变化后各窗口图标保持一致。

涉及发送到 Codex 的改动，需要手工检查：

- 本机已安装 Codex CLI。
- 发送前项目已经绑定本地目录。
- 在任务详情点击发送到 Codex，会先保存任务备注，再由桌面端后台启动 Codex。
- 在项目记录或任务记录详情点击发送到 Codex，会先保存记录，再由桌面端后台启动 Codex。
- 未绑定本地目录时，界面应提示先绑定目录。
- 没有项目上下文的个人记录不能直接发送。
