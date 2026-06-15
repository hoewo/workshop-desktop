---
name: workshop-codex-collaboration
description: >-
  当 Codex 需要和 Workshop Desktop 配合处理任意 repo、Workshop 当前项目/任务/记录、
  项目 ID 解析、AI 协作流程、任务执行回写、记录沉淀、确认页写入、repo 最小文档结构初始化或治理时使用。
  也适用于用户没有安装 Workshop Desktop、需要由 AI 下载、安装、启动并验证 workshop CLI 的场景。
  这个 skill 管理完整跨项目流程：先确认 Workshop 可用性和项目上下文，再读取目标 repo 的
  AGENTS.md 覆盖规则，按最小 repo 文档结构和事实边界执行代码任务，最后通过 workshop CLI/app server
  进行安全回写。
---

# Workshop + Codex 跨项目协作

这个 skill 定义的是一套跨项目 AI 协作规范。Workshop Desktop 只是配合这套规范的工具 app；`workshop` CLI 是 Codex 和 Workshop 交互的命令入口。

不要把 Workshop 当成 repo 知识库、流程本体或事实源。Codex 的工作仍以目标 repo 的代码、`AGENTS.md` 和最小文档为准；Workshop 用于提供当前上下文、任务/记录入口、确认页和结果回写。

## 核心协作模型

- Workshop 是人的当前注意力工作台：它帮助用户聚焦当前项目、任务、记录和确认动作。
- Codex / 用户 AI 是记录池的理解、检索、整理和执行入口：它可以读取材料、生成候选整理、执行代码任务并提出写入动作。
- Workshop Desktop 是配合这套规范的工具 app，不是完整知识库、完整项目管理系统或流程本体。
- `workshop` CLI 是交互方式；repo `AGENTS.md` 是项目级覆盖层；最小 repo 文档是已审查事实层。
- 稳定事实进入 repo 时必须经过文档边界检查；不要把 Workshop 记录原文整段搬进 repo。

## 总流程

1. 读取目标 repo 的 `AGENTS.md`，如果存在。
2. 用 `workshop --json doctor` 检查本机 Workshop bridge 是否可用，除非用户明确禁止工具调用。
3. 解析当前 Workshop 项目上下文，得到可信的 `projectId` / `projectName`。
4. 按目标 repo 的代码、测试和文档边界完成用户任务。
5. 需要沉淀结论时，通过 `workshop` CLI 或 app server 回写记录；不要直接写 `userData` 文件。
6. 涉及编辑已有记录正文、创建任务或改变任务状态时，先走 Workshop 确认页。

如果 Workshop 不可用，仍可继续做 repo 任务，但不要声称已完成 Workshop 上下文解析或回写。

## 安装与可用性

当 `workshop` 命令不存在、`workshop --json doctor` 失败，或用户询问如何安装 Workshop Desktop 时，优先让 AI 直接完成安装和验证。

- 如果用户明确要求“安装 Workshop Desktop”或“帮我装好 workshop”，可以直接执行安装。
- 如果用户只是询问安装方式，先说明将下载 GitHub Release、写入用户应用目录并启动应用，得到确认后再执行。
- 不使用 `sudo`，不写 `/usr/local/bin`，不要求普通用户安装 Node、pnpm 或 clone repo。
- 发布版在非 Windows 平台启动后会自动安装用户级 `workshop` 和 `workshop-desktop` 命令到 `~/.local/bin`。Windows 发布包当前尚未自动安装 CLI shim。
- 在支持 CLI 自动安装的平台，安装完成后打开新终端或直接运行：
  ```bash
  workshop --json doctor
  ```

### macOS 自动安装

在 macOS 上，下载最新 GitHub Release 的 universal zip，安装到当前用户的 `~/Applications` 并启动：

```bash
set -euo pipefail
tmp_dir="$(mktemp -d)"
release_json="$tmp_dir/release.json"
curl -fsSL "https://api.github.com/repos/hoewo/workshop-desktop/releases/latest" -o "$release_json"
asset_url="$(python3 - "$release_json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assets = data.get("assets", [])
matches = [
    a for a in assets
    if a.get("name", "").endswith(".zip")
    and "universal" in a.get("name", "").lower()
    and "mac" in a.get("name", "").lower()
]
if not matches:
    matches = [a for a in assets if a.get("name", "").endswith(".zip") and "mac" in a.get("name", "").lower()]
if not matches:
    raise SystemExit("No macOS zip asset found in latest release")
print(matches[0]["browser_download_url"])
PY
)"
curl -fL "$asset_url" -o "$tmp_dir/workshop.zip"
unzip -q "$tmp_dir/workshop.zip" -d "$tmp_dir/app"
app_path="$(find "$tmp_dir/app" -maxdepth 4 -type d -name "Workshop Todo.app" | head -n 1)"
test -n "$app_path"
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/Workshop Todo.app"
ditto "$app_path" "$HOME/Applications/Workshop Todo.app"
open "$HOME/Applications/Workshop Todo.app"
```

启动后等待几秒，再验证：

```bash
"$HOME/.local/bin/workshop" --json doctor || workshop --json doctor
```

如果验证失败，先让用户确认应用已经启动；如果只是 `workshop` 命令不可见，提示新开终端或检查 `~/.local/bin` 是否在 `PATH`。

### Windows 自动安装

在 Windows 上，优先下载最新 GitHub Release 的 installer exe；没有 installer 时才使用其他 exe：

```powershell
$ErrorActionPreference = "Stop"
$release = Invoke-RestMethod "https://api.github.com/repos/hoewo/workshop-desktop/releases/latest"
$asset = $release.assets |
  Where-Object { $_.name -match '\.exe$' -and $_.name -match '(Setup|setup|installer|Installer)' } |
  Select-Object -First 1
if (-not $asset) {
  $asset = $release.assets |
    Where-Object { $_.name -match '\.exe$' } |
    Select-Object -First 1
}
if (-not $asset) { throw "No Windows exe asset found in latest release" }
$installer = Join-Path $env:TEMP $asset.name
Invoke-WebRequest $asset.browser_download_url -OutFile $installer
Start-Process -FilePath $installer -Wait
```

安装后启动 Workshop Desktop。如果 installer 没有自动启动，可在开始菜单打开 `Workshop Todo`。

当前 Windows 发布包尚未自动安装 `workshop` CLI shim；不要声称 Windows 端一定可以直接执行 `workshop --json doctor`。若用户需要 CLI 验证，先说明 Windows CLI 自动安装仍待实现，或改用支持 CLI 自动安装的平台验证。

### 开发 repo 内安装

只有在 `workshop-desktop` 开发 repo 内，才建议安装开发版 CLI：

```bash
bash scripts/install-workshop-cli.sh
```

### 人工下载安装

如果自动下载失败，让用户打开 `https://github.com/hoewo/workshop-desktop/releases/latest`，按系统下载最新安装包：

- macOS：`Workshop.Todo-<version>-universal-mac.zip`
- Windows：NSIS installer exe；其他 exe 只适合临时运行

不要退回到 `pnpm`、`npx`、开发脚本或直接调用仓库里的 Node 文件作为普通用户安装方式。

## 项目 ID 解析

需要项目级 Workshop 操作前，先按以下优先级解析 `projectId` 和 `projectName`。如果某个写入动作依赖项目来源，在回复里简要说明来源。

1. **用户明确给出**
   用户直接提供的项目 ID 或项目名优先。

2. **目标 repo 的 `AGENTS.md`**
   搜索 `Workshop 项目 ID`、`Workshop project ID`、`project-id`、`项目名`、`--project-id` 等线索。repo 本地契约优先于运行时猜测。

3. **Workshop 当前上下文**
   ```bash
   workshop context current --json
   ```
   当 `context.projectId` 存在且 `stale` 不是 `true` 时可以使用。若 `stale: true`，只能当提示，必须用 `AGENTS.md`、用户确认或项目列表再校验。

4. **当前任务或记录**
   当前 context 如果是 task/record 且带 `projectId`，使用该项目。若只有 `recordId` 且拥有 full CLI 权限，可读取记录：
   ```bash
   workshop record get --id <record-id> --json
   ```

5. **项目名精确匹配**
   已知项目名但没有 ID 时：
   ```bash
   workshop project list --json
   ```
   只接受精确匹配。多匹配、近似匹配或缺失时问用户，不要猜。

6. **仍无法确定**
   若下一步必须知道项目 ID，要求用户提供 Workshop 项目 ID，或让用户在 Workshop 中聚焦相关项目/任务/记录后重试。

不要只根据文件夹名、repo 名、Git remote、package name 或分支名推断 Workshop 项目 ID，除非 `AGENTS.md` 明确建立映射。

## Repo 最小文档结构

推荐跨项目使用最小、高信噪比文档结构。默认不要为普通代码任务启动完整治理流程。

建议 repo 包含：

- `README.md`：项目是什么、怎么运行、核心能力入口。
- `AGENTS.md`：AI 协作规则、项目级 Workshop 项目 ID、默认上下文、执行边界。
- `docs/architecture.md`：架构边界、数据归属、服务边界和非目标；不维护文件清单、接口清单或 method 清单。
- `docs/testing.md`：开发运行、构建验证、自动化测试、手工验证入口。
- `docs/decisions.md`：已接受决策和开放问题。
- `docs/domain.md`：仅当项目有稳定业务术语、状态机、记录/任务/领域对象时维护。
- `docs/release.md`：仅当项目涉及打包、发布、签名、公证、自动更新、应用资产或分发时维护。

不应默认写入 repo 的内容：

- 个人笔记、脑暴、会议原文、临时想法。
- AI 的完整推理过程、完整对话、运行流水账、测试长日志。
- 未确认的需求、未接受的决策、临时任务拆解。
- Workshop 本地 `userData` 数据、app server token、个人记录原始文件。
- `dist/`、`release/`、截图、下载包、构建产物和其他生成物。
- 为一次任务临时创建的长篇计划文档，除非用户明确要求并且它会成为长期项目事实。

文档只在影响运行行为、架构边界、领域术语、启动方式、测试方式、打包发布、应用资产或已接受决策时更新。新增或修改 repo 文档前，检查它是不是长期项目事实；不确定的内容标成 open/proposed，不要写成 accepted。

## 初始化 Repo 最小文档结构

当用户要求“初始化 repo”“建立 AI 协作文档”“接入 Workshop/Codex 流程”“补齐最小文档结构”时，可以帮助目标 repo 创建或修补最小文档结构。

执行顺序：

1. 先用 `rg --files` 检查现有 `README.md`、`AGENTS.md` 和 `docs/`，不要覆盖已有内容。
2. 读取已有入口文档和最相关代码，基于当前 repo 事实写文档；未知内容写 `open` 或 `TODO`，不要编造。
3. 尝试按“项目 ID 解析”规则得到 Workshop `projectId` / `projectName`。
4. 只创建缺失的最小文件，或在已有文件中补充必要章节。
5. 如果无法确定 Workshop 项目 ID，允许先写占位：`TODO: 填写 Workshop 项目 ID`，并在最终回复里提醒用户补齐。
6. 收尾时运行一次最窄验证，例如 markdown lint、文档格式检查或至少 `git diff --check`。

初始化时默认创建：

- `AGENTS.md`
- `docs/architecture.md`
- `docs/testing.md`
- `docs/decisions.md`

如果 `README.md` 缺失，可以创建极简 README。`docs/domain.md` 和 `docs/release.md` 只在项目确实需要领域术语或发布分发规则时创建。

初始化文档的写法：

- `AGENTS.md` 写 AI 如何开始、读哪些上下文、如何获取 Workshop 项目 ID、如何验证、如何回写。
- `architecture.md` 写稳定架构边界和运行时事实归属，不写愿景，也不重复代码里已经维护的文件名、接口名或命令名。
- `testing.md` 写可实际运行的开发、测试、构建、手工验证命令。
- `decisions.md` 只写已接受决策和开放问题；不要塞任务清单。
- 不创建 `.tasks/`、`Tasks/`、`notes/`、`ai-log/`、`meeting-notes/` 这类默认目录，除非用户明确要求或 repo 已有稳定规范。

## AGENTS.md 的职责

目标 repo 的 `AGENTS.md` 是项目级覆盖层，应包含：

- 默认读取哪些最小上下文。
- 当前 repo 的 Workshop 项目 ID 和项目名。
- 任务涉及领域术语、发布、资产、测试时需要额外读取哪些文档。
- 代码变更前后的验证命令。
- 记录、任务、repo fact 的边界。
- 是否允许或如何使用 Workshop 回写。
- 项目特有的发布、签名、部署或数据安全规则。

`AGENTS.md` 不应变成完整知识库。详细发布流程放 `docs/release.md`；详细领域模型放 `docs/domain.md`；架构事实放 `docs/architecture.md`。

## 执行规范

- 先读最小必要上下文，再看相关代码路径。
- 代码是当前运行时事实；文档解释意图和约束。冲突时先核实现有行为。
- 修改范围保持在用户请求和相邻代码内。
- 优先使用 repo 现有模式、服务层和测试入口。
- 任务结束前运行 `docs/testing.md` 或 `AGENTS.md` 指定的最窄可靠验证。
- 如果改动影响长期事实，按文档边界更新最小文档。
- 不把短期执行记录写进 repo；短期记录留在 Workshop 或当前对话。

## Workshop 与 CLI 的角色

Workshop Desktop 是工具 app，提供：

- 当前 Workshop 上下文：当前项目、任务、记录或窗口。
- 本地记录：个人、项目、任务三类人类可读记录。
- 确认页：让用户确认高风险写入。
- 任务/记录发送到 Codex 的服务层入口。

`workshop` CLI 是交互方式，优先使用 JSON 输出：

```bash
workshop --json doctor
workshop context current --json
workshop project list --json
workshop record list --project-id <project-id> --json
workshop record get --id <record-id> --json
workshop task list --project-id <project-id> --json
```

查询记录时优先走标题/元数据级检索：`record list` 默认只返回 id、标题、状态、范围、项目/任务归属、时间戳和标注等元数据，不要为了找候选记录就加 `--include-body`。需要判断某条记录正文时，再对少量候选记录调用 `record get --id <record-id> --json`。只有已知结果集很小且用户明确需要批量正文时，才使用 `record list --include-body`。

不要直接读写 `~/Library/Application Support/workshop-desktop/` 作为正式能力。不要把 CLI 当成绕过用户确认的后门。

补齐 CLI 能力时，不要从“缺一个命令”直接倒推实现；先确认目标项目是否已有清晰的服务层、权限边界、确认页动作和测试，再把这些能力封装成统一命令入口。

## Workshop 派发模式

当环境变量 `WORKSHOP_DESKTOP_SERVER_PORT` 和 `WORKSHOP_DESKTOP_SERVER_TOKEN` 存在时，本次执行大概率由 Workshop Desktop 派发。

- 用户消息就是任务输入，不要假设还有隐藏说明。
- Workshop 已在运行状态表里持有关联关系，prompt 里不需要再写来源包装。
- 注入 token 是受限 token，只允许 `record.create`。
- 不要用受限 token 调用 `context.current`、`record.get`、`confirmation.request` 或 `codex.send`。
- 项目 ID 优先来自目标 repo 的 `AGENTS.md` 或用户消息；没有项目上下文时，完成 repo 任务并说明回写需要项目 ID。

## 记录与任务边界

- Workshop 记录是人类思考材料，不是任务、决策、迭代或 repo fact 的类型系统。
- Workshop 任务属于 Workshop 任务体系。
- Repo fact 只通过 repo 文件和文档审查进入项目事实层。
- Codex 可以理解、检索、整理记录池并执行代码任务；最终事实写入必须通过 Workshop 确认页、Workshop 任务体系或 repo 文档审查完成。
- 记录数量增长后，优先增强检索、标注、关联和确认流程，不要默认把记录升级成复杂固定类型系统。
- AI 可以在任务完成、形成稳定结论、或用户要求记录时创建短记录。
- AI 默认不编辑、删除、合并、重组用户已有记录。
- AI 默认不创建 Workshop 任务；创建任务或改任务状态需要用户明确要求或确认。
- 归档记录或改变记录状态只有在目标项目 CLI / confirmation action 明确提供正式能力时才执行；不要通过直接改 `userData` 代替。
- `codex.send` 是 Workshop UI/service layer 拥有的执行动作，不是 Codex 可随意递归触发的能力。

## 记录整理架构

记录正文是唯一面向人的叙事源。AI 需要补充摘要、执行结果、结论、风险或后续建议时，应写入正文；追加或改写已有记录正文必须走确认页。

记录标注是 metadata 上的标准化索引，只放简洁字段，不放长摘要：

```json
{
  "namespace": "codex.record整理",
  "intent": "task | question | discussion | principle | execution_summary | note",
  "retention": "temp | keep | candidate | archived",
  "resolution": "open | answered | decided | converted | obsolete",
  "tags": ["product-boundary"],
  "relatedRecordIds": ["<record-id>"],
  "relatedTaskId": 123,
  "confidence": 0.86
}
```

`intent` 是 AI 对内容主意图的判断，不是记录本体强类型。`retention` 是保留策略；`temp` 代表执行过程材料，任务完成后通常不沉淀正文。`resolution` 表示问题、讨论或任务型记录当前是否已有答案、结论或转化结果。分类变化时优先重跑标注，不迁移记录正文或扩展记录状态机。

## 回写规范

默认回写是短记录，面向人类后续阅读和编辑，不面向 AI 自我复盘。

默认 3-6 行：

- 结论
- 影响
- 下一步或验证结果

创建新的项目记录：

```bash
workshop record create --title "<短标题>" --body "<markdown>" --scope project --project-id <project-id> --project-name "<project-name>" --open
```

追加或改写已有记录正文，必须走确认页：

```bash
workshop confirmation request --title "<确认标题>" --html-file ./confirm.html --action-file ./action.json --json
workshop confirmation status --id <request-id> --json
```

可以在确认动作中使用 `record.appendBody`、`record.updateBody`、`record.create`、`record.annotate`、`task.create`、`task.updateState`，但动作必须明确、范围清楚、可由用户理解。删除、合并和重组多条记录不属于默认动作。

## 失败处理

- `workshop` 不存在：按“安装与可用性”给出发布版下载/安装/重开终端路径；只有在 `workshop-desktop` 开发 repo 内才使用 `bash scripts/install-workshop-cli.sh`。
- app server 不可达：让用户启动 Workshop Desktop。
- 当前 context 过期：用 `AGENTS.md` 或用户确认校验，或让用户重新聚焦 Workshop 对象。
- 项目名多匹配：询问用户，不猜。
- repo 任务完成但回写失败：分别说明 repo 结果和 Workshop 回写失败原因。
