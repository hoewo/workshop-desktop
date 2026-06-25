# Workshop 产品方向 · 多方案对比报告

Status: draft

Date: 2026-06-25

Source: 基于 [讨论纪要](workshop-direction-discussion.md) 两轮圆桌 + 三轮用户补充 + 代码与运行时核实，独立沉淀为横向对比。

> 本文把 Workshop Desktop 可能走向的**多个产品方向**各自拆成**多个产品方案**，横向对比。每个方案给出：定位、独占增量（相对既有方案的不可替代信息）、被谁覆盖、PMF 假设、成立条件、致命风险。
> 这是方向选择的决策辅助，**不是已接受决策**（draft）。完整探讨过程见 [`workshop-direction-discussion.md`](workshop-direction-discussion.md)。

---

## 0. 对比基线：四轮审视已确认的硬事实

下列事实均经代码与运行时独立核实，是所有方案对比的共同地基：

1. **运行时零使用**：`codex-runs=[]`、`confirmation-requests=[]`、6 条记录全为 test 垃圾、作者本人（目标用户画像）停更一周。
2. **回流入口未建**：`src/main/codexPrompt.ts:8-11` `buildCodexUserInput` 零注入、不收 localProjectId、不查任何历史记录。回写出口已建（origin:agent 路径），是单向半环。
3. **D-008 是防 prompt injection 递归派发的 scope guard**（`main.ts:1923-1945`：scope=full 放行、scope=agent 只允许 record.create），不是"可信回写层"护城河；末尾自带可逆性条款。
4. **平台 session 已物理占据连续性层**：Claude 本项目 session jsonl = **11M**、Codex sessions 按月累积、Codex `memories_1.sqlite` 记忆绑定 thread_id（任务级）。
5. **recordStore 字段集无独占增量**：`types.ts:280-298`，存 title/bodyMarkdown/summary/标注，全能从平台 session + git + AGENTS.md 重建。
6. **D-014 承诺"记录不升级成类型系统"**（`decisions.md:208`），与代码已持久化的 promotedTaskId 字段打架（但该字段 0 次真实使用，是死字段）。

> 所有方案都必须在这六条地基上自证独占增量，否则就是"在已被占满的层上叠加冗余镜像"。

---

## 1. 方向总览

| # | 方向 | 一句话定位 | 独占增量 | 当前被覆盖程度 | 存活概率 |
|---|---|---|---|---|---|
| D1 | 任务执行入口 | Workshop 后端任务的桌面视图 | 无（寄生后端事实源） | 高（后端/IDE 压扁） | 低 |
| D2 | 极简记录工具 | AI 协作的记事本 | 无（Obsidian 物理下限=0） | 高（Obsidian+插件+MCP） | 低 |
| D3 | 连续性中间件 | AI 多次执行间的项目上下文连续性 | 趋零（平台 session 占满） | 高（11M session 已占） | 低 |
| D4 | 任务外碎片收容 | 协作时任务外碎片的收容与回送 | 部分（带项目上下文） | 高（Obsidian+MCP） | 中低 |
| D5 | 多厂商中立聚合 | 跨 Codex/Claude 推理轨迹的分歧聚合 | 唯一未占（需重做数据模型） | 低（结构性不会被平台做） | 待验证（唯一活路） |
| D6 | Obsidian 插件化 | Workshop 思想作为 Obsidian/IDE 插件落地 | 思想载体，非独立位置 | 自身即降级为插件 | 中（思想归宿） |
| D7 | 本机 Agent 权限网关+审计账本 | Agent 触发本机动作的统一权限层+审计 | **幽灵对象（代码层不存在）** | — | **已判死**（代码层证伪） |
| D8 | 团队级 AI 协作记忆 | 团队多成员多厂商 Agent 协作轨迹的聚合与流转 | 真实（跨人流转）+激励自反不成立 | 部分（Notion/企业版在抢） | 形态决断：Electron判死/hooks有机会 |

> 前四个方向（D1-D4）的物理位置已被既有方案占满；D5 是唯一未被占的位置但需重做且需求未验证；D6 是"承认无独立位置"后的形态降级；D7（第三轮新增）在代码层就被证伪——确认页拦的对象物种不存在，是幽灵对象，非"未验证"；**D8（第四轮补充）是前几个判活方向的合流归宿——通过 hooks/plugin 形态有机会，通过 Electron 形态判死。**

---

## 2. 各方向 × 方案详解

### D1 · 任务执行入口

**D1-a：维持现状（D-003 已接受定位）**
- 定位：查看处理 Workshop 后端任务、任务工作面、远端任务源关联。
- 独占增量：无。任务事实源在后端，桌面端是查看器。
- 被谁覆盖：Workshop 后端自身、IDE 任务面板、手机/网页。
- PMF 假设：用户需要桌面端查看后端任务。但 `codex-runs=0` 证明连任务执行入口都没被真实触发过。
- 成立条件：Workshop 后端任务系统本身有黏性（未验证）。
- 致命风险：后端不成立则 A 是空壳；成立则 A 是后端瘦客户端，物理下限为零。**砍掉后端对接是锯自己坐的树枝，留着又是寄生。**

**D1-b：纯任务工作面（剥离记录，只做任务面板）**
- 独占增量：无（更窄）。
- 被覆盖：更彻底。
- 致命风险：连记录都没了，纯粹寄生，无任何独立价值。

---

### D2 · 极简记录工具

**D2-a：纯记事本（draft 方向 B 原版）**
- 定位：打开即写、不强制分类的 AI 协作记事本。
- 独占增量：无。记事本物理下限已被 Obsidian/Apple Notes 做到零。
- 被谁覆盖：Obsidian、Apple Notes、Notion——全部成熟、零成本、已装在用户设备。
- PMF 假设：用户需要"轻"的记事本。但目标用户是"希望项目往前走"的人，极简记事本诱导"写而不做"，与目标错配。
- 成立条件：无结构性成本优势或网络效应——不具备。
- 致命风险：红海、画像错配、留存归零。**圆桌判 B 是对已成型 A 的阴影补偿，零数据下无法证伪也无法证实。**

**D2-b：记事本 + AI 生成富 HTML 整理页（draft 第三条主线）**
- 独占增量：AI 生成结构化归纳页帮人整理。
- 被谁覆盖：Obsidian 插件（Copilot/Smart Connections 已能做语义检索+归纳）、Notion AI。
- 致命风险：HTML 整理页是"帮人看"，仍是"被看"而非"被执行引用"，闭环断在"看"。

---

### D3 · 连续性中间件（第一轮圆桌"第三路"）

**D3-a：单厂商连续性注入层（第一轮浮出的第三路）**
- 定位：给 `buildCodexUserInput` 增参注入本地 origin:human 记录，让 Codex 不重复理解项目。
- 独占增量：**趋零**。recordStore 存的 title/bodyMarkdown 全能从平台 session（11M）+ git + AGENTS.md 重建。
- 被谁覆盖：**平台 session jsonl 已物理占据**（11M Claude session、Codex memories 绑 thread_id）。
- PMF 假设：注入历史记录能让 Codex 省 token。但曼昆"激励自反"：比值越高平台自建动机越强，越证明该被吞。
- 成立条件：独占增量 > 0。当前为零。
- 致命风险：**第二轮圆桌自我颠覆第一轮**——管道两端接的是已被占满的端口。"补 buildCodexUserInput 是往断环上焊管子，焊完水还是流不过去。"

**D3-b：确认页作为可信回写护城河**
- 定位：把受控回写/确认页叙事成"AI 协作的可信边界"。
- 独占增量：无。D-008 真实身份是防递归派发的 scope guard，不是信任资产。
- 被谁覆盖：范畴错配——它保护的那块地物理面积为零（confirmation-requests=0 零调用）。
- 致命风险：把安全闸门叙事成护城河是自我感动。**芒格+苏格拉底+马斯克三方独立判死。**

---

### D4 · 任务外碎片收容（用户第二次补充）

**D4-a：任务外碎片收容器（带项目上下文）**
- 定位：AI 协作时、任务执行流里、任务外碎片的收容与后续回送。
- 独占增量：碎片自动带 `localProjectId`/`scopeType` 上下文，后续能送回对应项目执行——这是 Apple Notes 给不了的。
- 被谁覆盖：**Obsidian + 插件 + MCP 基本覆盖**（vault 是本地 markdown，Agent 可读写，碎片收容+双链+检索全成熟）。
- PMF 假设：碎片冒出频次撑得起独立桌面端，且人愿切换到 Workshop 记。
- 成立条件：差异化仍挂在未建的回流入口上；频次未验证；普适性未验证。
- 致命风险：差异化依赖回流入口（未建）；碎片冒出时人更可能顺手打在对话/便签里而非切桌面端；Obsidian 用户拼插件就能实现同等能力。

**D4-b：纯碎片收容（无回流，纯记）**
- 独占增量：无。退化为 Apple Notes。
- 被覆盖：彻底。

> D4 部分救活了方向 B 的场景（任务外是平台记忆盲区），但 Obsidian 把这道缝也填了，**B 基本被判死**。

---

### D5 · 多厂商中立聚合（两轮圆桌唯一判活方向）

**D5-a：多厂商推理轨迹聚合层**
- 定位：只记录"Codex 推理 + Claude 推理 + Gemini 推理 在同一项目上的分歧与收敛"。
- 独占增量：**唯一未被任何既有方案占据的物理位置**。这是平台因**利益冲突结构性不会自持**的独占增量——Codex 不会主动记 Claude 的轨迹（违反自身利益），反之亦然；git 记不下、AGENTS.md 装不下、Obsidian 笔记无跨厂商来源结构。
- 被谁覆盖：**结构性不会被覆盖**（激励自反在此不成立，因平台自持竞品轨迹违反自身利益）。
- PMF 假设：用户真的会在多厂商协作中产生需要聚合的轨迹。
- 成立条件：
  1. 需重做 recordStore 数据模型（存推理链快照 + 来源厂商，非当前 title/bodyMarkdown）——另一笔投入。
  2. 多厂商协作场景真实存在——**未验证**。
  3. 聚合能省下次 Agent 的重复理解——未验证。
- 致命风险：依赖一个尚未验证是否真实存在的需求。若用户根本不跨厂商协作，这道缝也是空的。

**D5-b：多厂商信任/中立记忆层（曼昆视角）**
- 定位：引入 Codex 自己消解不了的信任约束（用户不信任单一厂商持有全部跨 session 记忆）。
- 独占增量：当用户对单厂商持有记忆产生信任拒绝时，第三方持有成本比较优势从负转正。
- 成立条件：用户信任约束被激活（当前未激活，运行数据为零正说明此需求未发生）。
- 与 D5-a 关系：方向一致（都是"平台结构性不会做的层"），判据不同——D5-a 从信息独占切入，D5-b 从持有成本比较切入。

---

### D6 · Obsidian 插件化（形态降级/思想归宿）

**D6-a：Workshop 思想作为 Obsidian 插件**
- 定位：把"受控回写/确认页/origin 来源"思想做成 Obsidian vault 模板 + MCP 配置 + 插件，而非独立 Electron 端。
- 独占增量：思想载体，非独立产品位置。
- 被谁覆盖：自身即降级为既有容器的插件。
- 成立条件：Workshop 思想在 Obsidian 生态有差异化（如带来源结构的笔记 + 受控回写规范）。
- 致命风险：失去独立产品身份；但仍可能是 Workshop 思想的正确归宿。
- **意义**：这是"承认无独立位置"后的形态选择，不是失败——若 Workshop 的价值在"协作规范"而非"独立容器"，插件化是更诚实的落地。

**D6-b：作为 IDE 插件（被集成/被收购）**
- 定位：被 Cursor/VS Code 集成，做厂商中立记忆层。
- 成立条件：IDE 想保持厂商中立、不让 Agent 独占记忆层。
- 致命风险（芒格）：IDE 正在被 Agent 吞（Cursor Composer/Cline）；中立编辑器没动机做记忆层（没动机），做记忆层的不中立（要锁定）。"有动机≠会收购"——IDE 自建这层是几十行 JSON schema+prompt 模板，不是收购一个独立产品的成本。

### D7 · 本机 Agent 权限网关 + 审计账本（第三轮新增，已判死）

> 第三轮圆桌从代码层判死，不是"未验证叙事"，是"被证伪的幽灵对象"。

**D7-a：动作批准审计**
- 定位：多个 Agent 触发本机动作时的统一权限层 + 审计账本，记"人批准了 AI 干什么/拒了什么/为什么"。
- 独占增量：**幽灵对象 + 架构死锁**。三层判死（均经代码核实）：
  - **根因层（架构死锁）**：`AGENTS.md:54-55` 要求 agent 编辑正文/创建任务"必须先用 confirmation.request"，但 `main.ts:1943-1944` scope guard 把 confirmation.request 挡在 `scope!=='full'` 之外，而 D-008 给被派发 Codex 注入 agentToken（scope=agent）——**文档要求 agent 按门铃、代码让 agent 没有手**。confirmation-requests=[] 是死锁必然，非"没人用"。
  - **对象层**：`executeConfirmationAction`（`main.ts:1660`）6 种动作全是 Workshop 自身笔记/任务 CRUD，无一条触碰文件系统/shell/进程/网络。
  - **数据模型层**：`AsyncConfirmationMeta`（`types.ts:459-467`）无 approvedBy/agentId/scope/deniedReason——审计原子在数据模型里不存在。
- 被谁覆盖：被零调用判死（且是死锁必然），且所辖对象根本不存在。
- 致命风险（三层闭合）：语义层（调用方与被拦方同一主体）、对象层（拦的对象物种不存在）、物理层（用户态进程拦不住用户态进程系统调用，ring0 内核特权环 Electron 不可达）。

**D7-b：来源溯源审计 / 事后留痕（重定义尝试，均判死）**
- 苏格拉底穷举 B 的三种重定义，缝隙为零：①动作批准审计→零调用判死；②产出物来源溯源→撞前两轮内容主轴判死（origin 被 session 占满）；③Agent 本机操作事后留痕→被 git reflog/OS 审计层占满。
- 两条死刑之间没有未被占据的缝隙。

**D7-c：OS 级权限内核（马斯克指出的唯一物理活路，但等于重写为另一家公司）**
- 定位：放弃 Electron，做 macOS 内核扩展/FUSE 层，成为 Codex 必须经过才能碰磁盘的强制层（像 TCC 之于 App）。
- 成立条件：需 macOS 内核扩展 / Endpoint Security 框架 / Apple 签名链——全不在当前能力栈内，是重写为另一家公司级别的不可逆断裂。
- 门槛：答得出"做这个内核的人是谁、分发渠道在哪"才有活路；答不出，D7 封棺。
- 致命风险：两个端点（工具级 D7-a 已死 / 内核级 D7-c 不可达）之间**没有连续路径**，"形态可升级"是自我安慰。

**资产拆分（曼昆，第三轮唯一建设性产出）**：D7 判死不等于所有已落地能力都死——
- app server + 受限token + scope 分层模板 = 可迁移资产 → 投 D5 验证；
- 确认页 + 6 种动作 CRUD = 沉没成本，折旧归零；
- origin 标记 = 前两轮已判死，不处置。
- 关键：别让"判死 D7"连带判死可迁移资产，也别让"可迁移资产存在"反向救活 D7。

### D8 · 团队级 AI 协作记忆（第四轮补充，前几个判活方向的合流归宿）

> w7bdxny9f 带来的轻形态发现改变了形态判断：治理/记忆层的物理下限不是 Electron 桌面端、不是 runtime fork，而是 plugin hooks 目录 + 读 stdin 写 JSON 的脚本（核证 Claude Code PreToolUse/PostToolUse hooks，`permissionDecision:'deny'` 可物理阻断）。这使 D8 的物理可达性依赖形态选择。

**D8-a：团队记忆通过当前 Electron 工具整合**
- 定位：在 Workshop Desktop 上做多成员、多厂商 Agent 协作记忆聚合。
- 独占增量：真实存在（跨人流转是团队刚需，单机 Obsidian 给不了）。
- 被谁覆盖：自身形态不可达——当前 recordStore 是单机本地 markdown，无多用户/同步/权限模型，做团队记忆是推倒重做。
- 致命风险：与 D7 同因——Electron 形态在治理/记忆维度结构上不可达。**判死。**

**D8-b：团队记忆通过 hooks/plugin 编排层 + 中立性整合**
- 定位：放弃 Electron，做跨厂商 Agent 协作的 hooks/plugin 层 + 中立团队记忆。团队多成员用多厂商 Agent 时，A 的判断/决策流转给 B 接着干。
- 独占增量：**最强组合**——①跨人流转（团队刚需）+ ②激励自反不成立（团队不愿被单一厂商锁定全部协作记忆，与 D5 同类稀缺品）+ ③物理下限可达（hooks/plugin 几十行，非 Electron/非 OS 内核）。
- 被谁覆盖：有竞争者但未完成（Notion/飞书是"人写的文档"非"AI 协作轨迹"；Cursor 团队版在抢未定型；Agent 厂商企业版有动机但撞中立性需求）。
- 成立条件：~~①Codex 侧暴露等价 PreToolUse+permissionDecision:deny 的外部挂载点（w7bdxny9f 唯一未坐实半边，待核实）~~ **①已核实坐实（见下）**；②产品形态从 Electron 转 hooks/plugin。
- 致命风险：是前几个判活方向的**合流终点**——若成立则 D5×D6×D7 在它身上兑现；若不成立则前几轮判活碎片全部证伪。**形态决断，非功能扩展**——两个端点（Electron 已死 / hooks 可达）之间没有连续路径。

**核实结论（2026-06-25，Codex 仓库源码）**：D8-b 的物理前提已坐实。Codex 完整支持 hooks 事前拦截：
- `codex-rs/core/src/hook_runtime.rs:56` 定义 `PreToolUseHookResult::{ Continue{updated_input}, Blocked(String) }`。
- `codex-rs/core/src/tools/registry.rs:505`：`PreToolUseHookResult::Blocked(message) => return Err(FunctionCallError)`，记录 `ToolCallOutcome::Blocked`，**阻断工具执行**。
- HookEventName 枚举（hook_runtime.rs:700-709）：`PreToolUse`/`PostToolUse`/`PermissionRequest`/`SessionStart`/`UserPromptSubmit`/`SubagentStart`/`SubagentStop`/`Stop`/`PreCompact`/`PostCompact`。
- `PreToolUse` 在工具执行前触发、可返回 `Blocked` 阻断、可返回 `Continue{updated_input}` 改输入——等价于 Claude Code PreToolUse + `permissionDecision:"deny"`。
- 即：Codex 与 Claude Code 两侧的"门"都对外开着，跨厂商 hooks 编排层**物理可达，非单边空转**。
- 剩余未验证：Codex hooks 的配置粒度/信任模型（`--dangerously-bypass-hook-trust` 暗示有 hook trust 机制，需查实际部署门槛）；以及团队记忆的"跨人流转 + 中立性"真实需求仍待 dogfood。

**关键洞察（D8 的独特价值）**：D8 不是又一个孤立空位，是能**一次性检验前几轮所有假设的总判据**。它把 D5（多厂商聚合）×D6（插件化形态）×D7（permissionDecision:no）统一进一个方向。判它成立与否，等于判前几轮全部判活碎片成立与否。

---

## 3. 横向对比矩阵

### 3.1 独占增量对比（核心判据）

| 方案 | 独占增量 | 来源 |
|---|---|---|
| D1-a/b | 无 | 寄生后端 |
| D2-a | 无 | Obsidian 已占满 |
| D2-b | 无 | Obsidian 插件已做 |
| D3-a | 趋零 | 平台 session 11M 已占 |
| D3-b | 无（范畴错配） | 护城河保护的地面积为零 |
| D4-a | 部分（带上下文） | 但 Obsidian+MCP 覆盖 |
| D4-b | 无 | 退化为 Apple Notes |
| **D5-a** | **唯一未占** | **平台利益冲突结构性不做** |
| D5-b | 唯一未占（信任约束） | 需信任拒绝激活 |
| D6-a | 思想载体 | 非独立位置 |
| D7-a | **幽灵对象（不存在）** | **确认页拦的对象物种在代码里不存在** |
| D7-c | OS 级唯一活路 | 但需重写为另一家公司 |
| D8-a | 真实但形态不可达 | Electron 结构上做不了团队记忆 |
| **D8-b** | **最强组合（跨人流转移需+激励自反不成立+hooks可达）** | **前几个判活方向的合流归宿** |

### 3.2 被覆盖程度对比

| 方案 | 被谁覆盖 | 覆盖程度 |
|---|---|---|
| D1 | 后端/IDE | 高 |
| D2 | Obsidian/Apple Notes/Notion | 高 |
| D3-a | 平台 session jsonl | 高（已物理占据） |
| D3-b | 范畴错配 | — |
| D4 | Obsidian+插件+MCP | 高 |
| D5 | 结构性不被覆盖 | 低 |
| D6 | 自身降级 | — |
| D7 | 所辖对象不存在 | —（代码层证伪） |
| D8-a | 自身形态不可达 | —（Electron 做不了团队记忆） |
| D8-b | 有竞争者但未完成 | 低（抢但未定型） |

### 3.3 需要的投入与风险对比

| 方案 | 需要的投入 | 主要风险 |
|---|---|---|
| D1 | 维持 | 寄生，无独立价值 |
| D2 | 记事本打磨 | 红海留存归零 |
| D3-a | 补 buildCodexUserInput（11行级） | 焊断环，水流不过去 |
| D4-a | 建回流入口 | 差异化仍挂在未建入口 |
| **D5-a** | **重做 recordStore 数据模型** | **需求未验证，缝可能也是空的** |
| D6-a | 重做为插件 | 失去独立身份 |
| D7-a | — | 幽灵对象，不投入 |
| D7-c | 重写为另一家公司（内核扩展/签名链） | 门槛问题答不出即封棺 |
| D8-a | 重做多用户/同步/权限 | 与 D7 同因判死 |
| D8-b | 形态转 hooks/plugin 编排层 | 形态决断；Codex 挂载点未坐实 |

---

## 4. 决策树

```
前提：当前运行数据为零；D1-D4 被既有方案占满、D7 被代码层证伪，均判死
      D8 是前几个判活方向的合流归宿，其成立取决于形态决断
│
├─ 是否愿意把产品形态从 Electron 转为 hooks/plugin 编排层？
│  │
│  ├─ 否（保持 Electron）→ D8-a 判死。唯一未判死的是 D5（个人多厂商聚合）
│  │  │
│  │  ├─ 用可迁移资产投 D5，两周真实使用验证
│  │  │  ├─ 零使用 → D5 也是尸体 → 无独立位置，转 D6 插件化
│  │  │  └─ 有使用 → D5 活，重做 recordStore 数据模型
│  │  │
│  │  └─ 或回答马斯克门槛问题（OS 级内核 = 重写为另一家公司）
│  │
│  └─ 是（转 hooks/plugin 形态）→ D8-b 团队记忆是前几轮合流归宿
│     │
│     ├─ ✅ 已核实：Codex 暴露等价 PreToolUse+Blocked 的外部挂载点（hook_runtime.rs:56/registry.rs:505）。两侧门都开着，物理可达。
│     │  （仍待验证：Codex hooks 配置粒度/信任模型部署门槛；团队记忆跨人流转+中立性真实需求需 dogfood）
│     │
│     └─ 物理前提已成立 → D8-b 可进入"团队记忆真实需求"验证阶段
```

> 注：D8 的关键不在"团队记忆有没有机会"（独占增量真实存在、激励自反不成立），而在"产品形态愿不愿意从 Electron 转为 hooks/plugin"。**这是形态决断，非功能扩展**——两个端点（Electron 已死 / hooks 可达）之间没有连续路径（马斯克判据）。

---

## 5. 综合推荐（决策权交还产品决策者）

**不强行推一个方向。** 基于三场圆桌 + 四轮补充 + 代码核实，给出有条件的倾向：

1. **D1-D4 在当前代码定位下均不成立**——物理位置已被既有方案占满，这是查证后的事实，不是判断。
2. **D7（权限/审计，第三轮新增）在代码层就被判死**——三层判死：架构死锁（AGENTS.md:54 要求 agent 按门铃、main.ts:1943 scope guard 让 agent 没手）、对象层（确认页拦的是自身笔记/任务 CRUD）、数据模型层（审计原子 AsyncConfirmationMeta 缺字段）。其可迁移资产拆出投 D5，确认页折旧归零。
3. **D5（多厂商聚合）是 Electron 形态下唯一尚未被判死的物理位置**，但需重做数据模型且需求未验证。
4. **D6（插件化）是"接受无独立位置"后的诚实归宿**——若 Workshop 的价值在协作规范而非独立容器。
5. **D8（团队记忆，第四轮补充）是前几个判活方向的合流归宿**——独占增量真实（跨人流转）+ 激励自反不成立，但**成立取决于形态决断**：Electron 形态（D8-a）判死，hooks/plugin 形态（D8-b）有机会，且 D8-b 一次性检验 D5×D6×D7 所有假设。

**核心分叉已从"选哪个方向"收敛为"选哪个形态"**，取决于产品决策者层面的决断：

- **若坚持 Electron 形态** → 唯一活路是 D5（个人多厂商聚合）两周验证；活则重做数据模型，死则承认无独立位置转 D6。
- **若愿意形态转为 hooks/plugin 编排层** → D8-b 团队记忆是前几轮合流归宿。**已核实 Codex 暴露等价挂载点**（`hook_runtime.rs:56` PreToolUseHookResult::Blocked / `registry.rs:505` 阻断工具执行 / 事件枚举含 PreToolUse+PermissionRequest），物理前提成立。下一步进入"团队记忆跨人流转+中立性真实需求"的 dogfood 验证。

> 这个分叉无法再靠讨论解决——它需要产品决策者先回答一个问题：**产品形态保持 Electron，还是转为 hooks/plugin 编排层？** 三场圆桌已确认：继续在方向上换皮是症状（荣格），不是治疗；真正的决断已从"方向"下沉到"形态"。

---

## 6. 待定夺问题（需产品决策者回答才能继续）

1. **产品形态保持 Electron，还是转为 hooks/plugin 编排层？**（这是当前最本质的决断，决定 D8 生死与 D5 是否唯一活路）
2. Workshop 的核心目标是"独立产品"还是"协作思想落地"？
3. 你本人是否真的会在多厂商（Codex+Claude）协作中产生需要聚合的推理轨迹？（决定 D5 是否有空位）
4. 是否愿意在未来一周跑真实 dogfood 拿数据，还是继续在方向上推演？（决定是否突破"判据延迟"）
5. 若 D1-D5 全部判死，是否接受 D6 插件化作为思想归宿？

**待核实（技术事实，非决策）**：~~Codex 是否暴露等价于 Claude Code PreToolUse+permissionDecision:deny 的外部挂载点？~~ **✅ 已核实坐实（2026-06-25）**：Codex `codex-rs/core/src/hook_runtime.rs:56` 有 `PreToolUseHookResult::Blocked`，`registry.rs:505` 阻断工具执行，事件枚举含 PreToolUse/PostToolUse/PermissionRequest。两侧门都开着。剩余待验：Codex hooks 的配置粒度/hook trust 部署门槛；团队记忆跨人流转+中立性真实需求（需 dogfood）。

---

## 附：与已接受文档的关系

- 本报告所有事实判断基于已核实代码（`codexPrompt.ts`、`main.ts`、`types.ts`、`decisions.md`）与运行时数据（`userData`）。
- 本报告**不修改**任何 accepted 决策（D-003/D-008/D-014 等）。
- 若某方向被采纳，需按 AGENTS.md 文档边界审查流程晋升为 accepted 决策，并同步处理与 D-003/D-014 的重心漂移。
- 完整探讨过程见 [`workshop-direction-discussion.md`](workshop-direction-discussion.md)。
