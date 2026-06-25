# Workshop 产品方向探讨纪要

Status: draft

Date: 2026-06-25

Source: 2026-06-25 多轮对话 + 两轮认知圆桌（think skill）+ 代码与运行时核实

> 本文档沉淀一次完整的产品方向探讨过程：从"这个产品是什么"出发，经两轮认知圆桌深度推演，到多轮用户补充后收束。它记录**过程与结论**，供后续决策追溯，本身**不是已接受的项目事实**（draft 状态）。
> 与 [`../drafts/workshop-product-concept.md`](../drafts/workshop-product-concept.md)、[`../drafts/workshop-record-tool-plan.md`](../drafts/workshop-record-tool-plan.md) 并列，作为方向探讨的完整记录。三个方向方向的横向对比见 [`workshop-direction-comparison.md`](workshop-direction-comparison.md)。

---

## 0. 背景：探讨的起点

本次探讨始于一个直问：**当前项目是什么产品？产品价值是什么？**

初始回答基于 README/AGENTS/architecture/domain/decisions 推断，把产品定位为"任务执行入口 + 受控 AI bridge"。但用户指出未读 `docs/drafts/`，准确性存疑。补读 drafts 后发现：**draft（产品意图）与已接受文档（D-003 等）之间存在重心漂移撕裂**——draft 把重心从"任务执行入口"拉向"极简项目记录工具"，并把任务系统/后端对接/账号同步列入"当前不做"。

这一发现成为整个探讨的真正起点：**代码与文档朝不同方向走，AI 协作者拿不准以哪边为准。** 探讨由此展开。

---

## 1. 已接受文档 vs draft 的重心漂移

| 维度 | 已接受项目事实（D-003/README/architecture） | 最新 product-concept draft |
|---|---|---|
| 定位 | 个人执行客户端 / 当前注意力工作台 | AI 开发中的极简项目记录工具 |
| 重心 | 任务（查看处理 Workshop 后端任务、任务工作面、远端任务源） | 记录（产品判断/架构取舍/灵感/执行结论） |
| 后端对接 | 任务源关联是核心能力之一 | 列入"当前不做" |
| AI bridge | 受控回写（app server+CLI+确认页） | Codex 双向交互 + AI 生成富 HTML 页面 |
| 状态 | accepted | draft，未晋升 |

**关键张力**：draft 在主动收缩已接受的产品边界，但仍是 draft 状态，未纳入 accepted 决策。AGENTS.md 的默认上下文清单甚至未列 drafts，AI 协作者默认读不到最新产品意图。

---

## 2. 第一轮认知圆桌：A/B 方向之争

**议题**：方向A（任务执行入口，已接受）vs 方向B（极简记录工具，draft），谁更可取？有没有第三种可能？

**工具**：think skill · roundtable-workflow · confrontation 模式 · 3 轮交锋 · 25 agent

**五位思想家实际读了代码并取了运行时实数**，结论全部经独立核实属实。

### 2.1 第一轮硬事实（均经独立核实）

| 判断 | 核实结果 |
|---|---|
| `buildCodexUserInput` 零注入、不收 localProjectId、不查历史 | ✅ `src/main/codexPrompt.ts:8-11`，函数体只有 `return body || request.title` |
| D-008 是防"提示注入递归派发"的安全闸门，非焊死的回流闸门 | ✅ `docs/decisions.md:114`；末尾自带可逆性条款（:121） |
| D-014 承诺"记录不升级成类型系统" | ✅ `docs/decisions.md:208` |
| 运行时零使用 | ✅ `userData`：`codex-runs/index.json=[]`、`confirmation-requests/index.json=[]`、6 个 .md 记录文件（4–31 字节，内容为 test 类）、最新活动 6月18日 |

### 2.2 第一轮关键洞察

- **苏格拉底**：A/B 之争是伪问题，"必须二选一砍掉一半"这把锯子来历不明；"注意力工作台"本就是容器概念。
- **荣格**：B 或为"永恒少年"原型的阴影补偿——对 A 那套带克制执行入口的否认。可证伪：若 A 获真实黏性，B 热情会转移。
- **曼昆**：B 激励错配——极简记事本诱导"写而不做"。真正核心问题不是"记录留没留"，是"判断能否低成本回流到下次执行"。
- **芒格**：两方向真死因是 Lollapalooza（叙事偏差+沉没成本+一致性渴望叠加）。记事本是红海、物理下限=0；draft 已露马脚——6 记录技能+标注是偷偷重建类型系统，与 D-014 打架。
- **马斯克**：开发者不可压缩的物理产物是"决策与上下文连续性"。A 是 Codex 瘦客户端（物理下限 0），B 是记事本（物理下限 0）。真正稀缺是"记录→Codex 执行→结果回写的自转闭环"。

### 2.3 第一轮收敛

**共识**：零运行样本下，A/B/第三路方向之争边际收益为零。所谓"自转闭环"在代码层只通了出去那一截——**回写出口存在（origin:agent 路径已焊），回流入口从未建（buildCodexUserInput 零注入是物理断点）**。

**圆桌浮出第三路**：产品真正该解决的是"让 Codex 下次接着干时不重复理解项目"——给 `buildCodexUserInput` 增参 `localProjectId+scopeType`，按 cwd/项目/作用域检索 origin:human 记录的结论性片段按 token 预算注入。**纯读、不碰 D-008 写网关、零安全代价、不触碰任何 accepted 决策。**

**元判断**：A/B 在零运行数据上不可决——三种押注都建立在 codex-runs=0、停更一周的同一具"已无脉搏"的系统上。

---

## 3. 用户第一次补充：少数用户真实痛点 + 红海 + "中间件"身份

用户补充三条产品级约束：
1. 产品源于少数用户工作时遇到的真实问题，但普适性（PMF）从未验证，运行数据为零使用。
2. 直观判断产品可能覆盖的几个方向对应市场都偏红海。
3. 提出突破假设：把 Workshop 从"给人用的工具"跃迁为"人和 AI 之间的协作中间件"——只占一层：连续性 + 受控回写。

---

## 4. 第二轮认知圆桌：中间件身份审视

**议题**："AI 协作中间件"身份是否成立？存在意义、突破口、未来方向。

**工具**：think skill · roundtable-workflow · confrontation 模式 · 3 轮交锋 · 32 agent · 方向判定 `isDirectional=false`（单一身份审视，无比对）

### 4.1 第二轮硬事实（均经独立核实，部分比圆桌所述更狠）

| 论点 | 核实结果 |
|---|---|
| D-008 真实身份是防递归派发的 scope guard | ✅ `src/main/main.ts:1923-1945`，`handleAppServerRpc(payload, scope)`：scope="full" 放行 context/confirmation，scope="agent" 只允许 record.create |
| recordStore 字段全是 title/bodyMarkdown/summary/标注，无"推理链快照"独占字段 | ✅ `src/shared/types.ts:280-298` |
| 平台 session jsonl 已物理持有跨 session 推理轨迹 | ✅✅ **实际比圆桌说的更狠**：Claude 本项目 session 目录 = **11M**（圆桌只说 1.7M），Codex sessions 按月累积 |
| Workshop 源码对这俩目录零读取 | ✅ grep 仅 `codexAppServer.ts:5` 一条注释提及，无读取代码 |

### 4.2 第二轮核心结论：自我颠覆第一轮

> 所谓"未被占据的连续性层"，在物理上**早已被占据**：Claude 本项目 session 已累积 11M、Codex sessions 按月累积，且 Codex 默认读 AGENTS.md/git log。Workshop 源码对这两个目录**零读取**。

所以"中间件作为单厂商连续性载体"的独占增量，**数学下限趋零**——recordStore 里存的 title/bodyMarkdown/标注，全能从平台 session + git + AGENTS.md 重建。第一轮的"第三路"建立在一条尚未铺通的管道上，第二轮发现管道两端接的是已被占满的端口。

### 4.3 护城河被重新定性

确认页/受控回写作为"信任资产"护城河是**范畴错配**：
- D-008 真实身份是防 prompt injection 递归派发的 scope guard，不是"人机可信回写层"。
- confirmation-requests=`[]` 零调用——确认页当前在任何频次下都是纯负资产。
- **护城河保护的那块地，物理面积为零。**

### 4.4 唯一可能复活的物理位置

圆桌收敛到唯一不被平台占满的方向——**多厂商中立聚合层**：

> 只记录"Codex 的推理链 + Claude 的推理链 + Gemini 的推理链 在同一项目上的分歧与收敛"。这是平台因**利益冲突结构性不会自持**的独占增量——Codex 不会主动记 Claude 的轨迹（违反自身利益），反之亦然。git 记不下、AGENTS.md 装不下、任一单厂商都不愿做。

**但当前 recordStore 只存单厂商的 title/bodyMarkdown，不满足这个定义**——所以是待证伪，不是已成立。

### 4.5 曼昆的期权定价与激励自反

- **激励自反**：中间件省 token 的比值越高，平台自建记忆的动机越强，越证明该被吞。"越证明有用越证明该被吞"是自反的。
- 这把中间件从"资产定价"还原为"期权定价"：价值在 Codex 是否做记忆的**不确定性**（波动率），且必须在窗口关闭前行权（被集成），不能拿期权等分红。

### 4.6 荣格的关键一刀：判据延迟

> "为什么需要一个判据才能行动？真正被痛点驱动的人不需要设计实验，他直接用。判据的需求本身是症状——用'寻找更精密的判据'推迟'直接使用'，因为直接使用会立刻给出真实反馈（可能证伪），而设计判据可以把判决无限延后。"

---

## 5. 用户第二次补充：任务外碎片收容场景

用户指出平台在打磨的记忆是"针对任务本身的记忆"，并提出真空区：

> 工作中冒出的、但**不属于当前任务/项目**的碎片——记录一下后续继续、有想法但不需立即处理、任务进行中有高优要推进的。

### 5.1 核实：真空是真的真空

Codex `memories_1.sqlite` 的 `stage1_outputs` 表结构证实：记忆绑定 `thread_id`（当前任务），有 `rollout_summary`/`usage_count`/`last_usage`——这是**任务级执行记忆**，不会收"干 A 任务时想到 B 项目的点子"。Claude 的 CLAUDE.md/memory 也是项目级长期事实，不是"冒出来的碎片待办"。

**所以任务外碎片收容场景，确实落在平台记忆的盲区里。**

### 5.2 但它撑不住独立桌面端

三类碎片需求产品命运不同：
1. "有想法但不是当前项目的，记录一下后续继续" → 真空，平台覆盖不到。
2. "有想法但不需要立即处理" → 延迟处理的想法池。
3. "任务进行中有高优需要推进的" → **Codex goals_1.sqlite 已覆盖**。

第 1、2 类是真空，但**这正是方向 B（极简记录工具）瞄准的场景，不是中间件**。差异化仍挂在未建的回流入口上；PMF 零验证；频次存疑（碎片冒出时人是否会切到 Workshop 这个桌面端去记）。

---

## 6. 用户第三次补充：Obsidian 插件 + Agent 是否覆盖

用户提出关键竞争者：Obsidian 可通过插件方式与 AI 工具集成、Agent 驱动，是否也将上述场景覆盖掉？

### 6.1 判断：基本覆盖，但留一道窄缝

核清楚 Obsidian 作为 AI 协作容器的实际能力面：
- 已是成熟 markdown 知识库，碎片收容、双链、标签、检索全到位。
- 插件生态已能接 AI（Smart Connections / Copilot 类插件给笔记建向量索引、做语义检索、塞进 LLM 上下文）。
- Codex 支持 MCP，可挂载文件系统 MCP 读写 vault；Agent 可通过 MCP 读写 Obsidian vault 里的 markdown，拥有持久化记忆层。

**结论：方向 B（极简记录工具）和"碎片收容"场景，在 Obsidian 面前没有独立的物理位置。** 上一轮"部分救活 B"的判断被修正——**Obsidian 把这道缝也填了，B 基本被判死。**

### 6.2 剩下的窄缝

Obsidian 插件方式有一个结构性覆盖不到的点——**多厂商中立聚合**：

> Obsidian vault 是本地文件，Agent 通过 MCP 读写它，没有"厂商归属"问题。但**谁把 vault 里"Codex 干的推理 + Claude 干的推理"整理成跨厂商的分歧与收敛**？Obsidian 插件只负责"把笔记读给某个 Agent"，它不会主动聚合多个 Agent 的轨迹——因为聚合逻辑要跨厂商感知，而 Obsidian 每条笔记是孤立 markdown，没有"这条来自 Codex thread / 那条来自 Claude session"的**来源结构**。

Workshop 的 `origin` 字段（human/agent）和 `scopeType` 正是干这个的——能区分记录来自哪个执行方。**但前提是 recordStore 真的存了"推理链快照"而不只是 title/bodyMarkdown**（圆桌已核：当前只存后者）。

### 6.3 最终收束

四轮审视（A 任务入口、B 记事本、中间件身份、碎片收容）全部指向同一事实：

> Workshop 当前代码定位的每一个产品方向，都已被某个既有方案占满了物理下限：
> - 任务执行入口 → 被 Workshop 后端/IDE 压扁
> - 极简记录 / 碎片收容 → 被 Obsidian + 插件 + MCP 覆盖
> - AI 跨 session 连续性 → 被平台 session jsonl（11M）占据
> - 多厂商中立聚合 → **唯一未被占的位置**，但 Workshop 当前 recordStore 字段不支持，需重做数据模型，且需求未验证

**这不是再换个角度找空位能解决的——前三个空位根本不存在。** 唯一真实存在的物理空位是多厂商聚合，它需要重做数据模型（存推理链快照 + 来源厂商），且依赖一个尚未验证是否真实存在的需求。

---

## 6.5 第三轮圆桌：跳出"开发者个人工具"市场，押"AI agent 本机权限/审计治理"

前四轮把目标用户锁死在"深度用 Codex 推进项目的开发者"，在该市场每个位置都被占。但发现产品的硬能力（app server + 受限token + 确认页 + origin + 运行状态表）指向可能是完全不同的市场——**AI agent 的本机权限/审计治理**。

**关键性质**：激励自反在此不成立——单 Agent 厂商结构性不会自建"限制自己、记录人对它说 no"的账本（违反自身利益）。这是与前四轮内容主轴本质不同的一类稀缺品。理论上这是唯一激励自反不成立的方向。

### 第三轮硬事实（均经独立核实）

圆桌从代码层判死，证据全部属实：

| 层 | 判死证据 | 核实 |
|---|---|---|
| 语义层 | 确认页调用方与被拦方是**同一主体**（scope=full 主进程才能开确认页，Agent 被 scope guard 挡在外）——"自照镜叙事成治理结构" | ✅ `main.ts:1923-1945` |
| 对象层 | 确认页拦的"对象物种"在代码里不存在——`executeConfirmationAction`（`main.ts:1660`）的 6 种动作全是 Workshop 自身笔记/任务 CRUD（record.updateBody/appendBody/create/annotate + task.create/updateState），**没有一条触碰文件系统外操作/shell/进程/网络** | ✅ `main.ts:1009-1067, 1660-1704` |
| 物理层 | 用户态进程拦不住用户态进程的系统调用——权限治理真正需要的 ring0 内核特权环，Electron 应用结构上不可达；Codex 走 spawn 旁路（`main.ts:16` import），确认页不在 Codex 执行关键路径上 | ✅ 核实 |

### B 在代码层就判死了（不是未验证，是被证伪的幽灵对象）

> 第三轮有两个圆桌先后完成：先到的（w9frpdisy）判据是"确认页拦的对象物种不存在"（结果层）；后到的（w7bdxny9f，更准确）判据是"**架构死锁**"（根因层）。两者不矛盾，后者更深一层。以下合并为最终判据。

**根因层判死（w7bdxny9f，更硬）：架构死锁，agent 根本无法发起 confirmation.request**
- `AGENTS.md:54-55` 要求"编辑记录正文或创建任务必须先用 `confirmation.request`"——文档要求 agent（或 CLI）能按门铃。
- `main.ts:1943-1944` scope guard：`confirmation.request` 若 `scope !== "full"` 即 throw——只允许 full token 调用。
- `D-008` 给被派发 Codex 注入的是 agentToken（scope=agent）。
- **三者构成死锁**：文档要求 agent 按 doorbell、scope guard 让 agent 没有手按、实测 confirmation-requests=[] 门铃零次被按响。零使用是**架构死锁的必然结果**，不是"需求未触发"。

**对象层判死（w9frpdisy）：确认页拦的对象物种不存在**
- `executeConfirmationAction`（`main.ts:1660`）的 6 种动作全是 Workshop 自身笔记/任务 CRUD，没有一条触碰文件系统/shell/进程/网络。

**数据模型层判死（w7bdxny9f）：审计原子不存在**
- `AsyncConfirmationMeta`（`types.ts:459-467`）字段为 requestId/title/status/actionType/result/error/createdAt/completedAt——**没有 origin/agentId/scope/approvedBy/deniedReason**。"人对 agent 说 no 的账本"这个最小审计原子在数据模型里根本不存在。

**苏格拉底穷举 B 的三种重定义，缝隙为零**：
1. 动作批准审计 → 被零调用判死（且零调用是死锁必然，非未触发）
2. 产出物来源溯源审计 → 撞前两轮内容主轴判死（origin 被平台 session 占满）
3. Agent 本机操作事后留痕 → 被 git reflog / OS 审计层占满

两条死刑之间（本轮三重结构性判死 vs 前两轮内容主轴判死）没有未被占据的缝隙。

### 荣格最狠的诊断：换皮

> "已经做了三轮换皮（护城河 → 信任资产 → 权限网关/审计账本），每一轮都被判死，第三轮连代码层的拦截对象都证伪了——继续换皮是智者原型失败补偿的延续，不是产品演进。"

### 曼昆的资产拆分（第三轮唯一建设性产出）

B 死，但不等于所有已落地能力都死：

| 能力 | 性质 | 处置去向 |
|---|---|---|
| app server + 受限token + scope 分层模板 | **可迁移资产** | 投到 D5 多厂商聚合，迁移本身即对 D5"需求未验证"的真实实验 |
| 确认页 + 6 种动作 CRUD | **沉没成本** | 直接折旧归零，不再投入注意力 |
| origin 标记 | 前两轮已判死 | 不在处置范围 |

### 马斯克的门槛问题（留给产品决策者的真正决断）

> 你要做的到底是"一个审计/记录工具"（已判死，信息熵=两个布尔位），还是"Agent 的 OS 级权限内核"（活路，但要重写为另一家公司——需 macOS 内核扩展/FUSE/Endpoint Security/Apple 签名链，全不在当前能力栈内）？两者路径完全不同，**中间没有连续路径**。

门槛：答得出"做这个内核的人是谁、分发渠道在哪"，B 才有 OS 级活路；答不出，B 封棺。

### w7bdxny9f 的修正与轻形态发现（第二场第三轮圆桌）

第三轮实际有两场圆桌先后完成：w9frpdisy（先到，"幽灵对象"判据）与 w7bdxny9f（后到，更深入）。w7bdxny9f 修正并深化了判据——见上"三层判死"。此外它带来一个**改变形态判断的关键发现**：

> **马斯克自推翻了"治理要 fork runtime / OS 内核扩展"的论断**：核证 Claude Code 已有完整的 PreToolUse/PostToolUse hooks 机制，返回 `permissionDecision:'deny'` 可物理阻断工具执行。所以"人对 agent 说 no"的物理下限**不是 Electron 桌面端、不是跨设备账本、不是 runtime fork**，而是一个 **plugin hooks 目录 + 一个读 stdin 写 JSON 的脚本，几十行**。

含义：**治理/记忆层的物理形态，根本不需要独立 Electron 端**——它可以是 hooks/plugin 层。这把 D7 的"OS 内核"门槛问题降级了：活路不必是"重写为另一家公司"，可以是"转成 hooks/plugin 编排层"。

**w7bdxny9f 留下的唯一未坐实半边**：Codex 侧是否暴露等价于 PreToolUse+permissionDecision:deny 的外部挂载点——若不开放，跨厂商 hook 编排层就是单边空转。这是判断"跨厂商 hooks 编排层"能否成立的物理前提，待核实。

**核实结论（2026-06-25，Codex 仓库源码 `codex-rs/`）**：该半边已坐实，**Codex 暴露等价挂载点**：
- `codex-rs/core/src/hook_runtime.rs:56` 定义 `PreToolUseHookResult::{ Continue{updated_input}, Blocked(String) }`——PreToolUse hook 可返回 Blocked。
- `codex-rs/core/src/tools/registry.rs:505`：`PreToolUseHookResult::Blocked(message) => return Err(FunctionCallError)`，记录 `ToolCallOutcome::Blocked`，**阻断工具执行**。
- HookEventName 枚举（hook_runtime.rs:700-709）：PreToolUse / PostToolUse / PermissionRequest / SessionStart / UserPromptSubmit / SubagentStart / SubagentStop / Stop / PreCompact / PostCompact。
- 含义：PreToolUse 在工具执行前触发、可 Blocked 阻断、可 Continue 改输入——等价 Claude Code PreToolUse+permissionDecision:"deny"。**Codex 与 Claude Code 两侧的"门"都对外开着**，跨厂商 hooks 编排层物理可达，非单边空转。
- 仍待验证：Codex hooks 的配置粒度/`--dangerously-bypass-hook-trust` 暗示的 hook trust 部署门槛；团队记忆"跨人流转+中立性"真实需求仍需 dogfood。

### 用户第四次补充：团队级记忆整合是否有机会

用户提出：**团队级记忆通过这个工具整合，是否有机会？**

**判据审视**：
- 独占增量：真实存在——团队多成员用 Agent 协作时，A 的判断/决策要让 B 接着干时看得到。单机 Obsidian（一人一 vault）给不了，需跨人记录归属/权限隔离/流转。**跨人流转是团队刚需，非个人记事本换皮。**
- 激励自反：**不成立**（与 D5 多厂商聚合同类稀缺品）。单 Agent 厂商做团队记忆会让全员协作轨迹沉淀在一家手里，团队因"不愿被单一厂商锁定全部协作记忆"产生中立性需求。
- 被覆盖：有竞争者但未完成（Notion/飞书是"人写的文档"非"AI 协作轨迹"；Cursor 团队版在抢但未定型；Agent 厂商企业版有动机但撞中立性需求）。

**判断**：
- 团队记忆通过**当前工具形态（独立 Electron 端）**整合 → **判死**，与 D7 同因：当前 recordStore 是单机本地 markdown，无多用户/同步/权限模型，做团队记忆是推倒重做，且 Electron 形态在治理/审计维度结构上不可达。
- 团队记忆通过**工具思想（hooks/plugin 编排层 + 中立性）**整合 → **有机会**，且是前几轮判活方向的**合流终点**：团队记忆 = D5（多厂商聚合，个人尺度）× 团队尺度 × hooks/plugin 轻形态。三者合起来恰好满足"激励自反不成立 + 跨人流转刚需 + 物理下限可达（非 Electron）"。它一次性检验前几轮所有假设——若成立，前几轮判活碎片在它身上兑现；若不成立，前几轮碎片也都证伪。

**但它仍是形态决断，不是功能扩展**：马斯克的"两个端点之间没有连续路径"在此适用——团队记忆成立的前提是产品形态从 Electron 转为 hooks/plugin 编排层。这是产品形态的重定义。**这是第五个"可能有机会的方向"**，荣格的换皮诊断持续警示：若用"再找一个更硬方向"回避"要不要转形态"的决断，就是判据延迟。但团队记忆与前几个方向不同——它不是孤立空位，是前几个判活方向的合流归宿，是一个能一次性检验所有假设的总判据。

---

## 7. 收束后的两条出路

探讨收束到两条互斥出路，决策权在产品决策者：

1. **若还想做独立产品**：唯一未判死的活路是验证"多厂商聚合"（D5）这个唯一空位——自己同时在 Codex 和 Claude 推进同一项目时，是否真的产生过"要聚合两边推理"的需求？若有，重做 recordStore 数据模型去占这道缝；若没有，这道缝也是空的。**曼昆的聪明做法**：把可迁移资产（app server+token+scope 模板）投到 D5，迁移本身即对"D5 需求未验证"的真实实验——两周后用运行数据回答 D5 是活人还是同状态尸体，比再开圆桌信息量大得多。
2. **若开始接受"它可能没有独立位置"**：退守成"Obsidian 上的一个 vault 模板 + MCP 配置"——把 Workshop 的"受控回写/确认页/origin 来源"思想做成 Obsidian 插件，而不是独立 Electron 端。这可能是 Workshop 思想的正确归宿：**它更适合作为既有容器（Obsidian/IDE）里的协作规范，而不是独立产品。**

> 注：第三轮判死"权限/审计"方向后，出路 1 的 D5 是**唯一尚未被判死**的方向，但它"未判死"≠"已验证活路"——它仍挂在需求未验证上。B（权限网关）已从代码层判死，不再作为出路候选。

---

## 8. 贯穿全程的元判断

三轮圆桌 + 三轮用户补充 + 代码核实，收束到比"选哪个方向"更本质的两层判断：

**第一层（荣格，第三轮）——换皮诊断**：
> 整个探讨存在一个反复出现的失败模式：每个方向被判死后，换一个语义外套再找位置（护城河 → 信任资产 → 权限网关/审计账本），每一轮都被判死。这不是产品演进，是智者原型的失败补偿——用"换一个更精巧的框架"回避"承认这个产品可能没有独立位置"。

**第二层（荣格，第一轮）——判据延迟**：
> 这个产品真正卡住的地方，不是方向没想清，是判决被无限推迟。方向已经想得非常清楚（三轮圆桌已把每一面查证到底），缺的是产品决策者自己的使用数据。用"寻找更精密的判据/再开一轮圆桌"推迟"直接使用"，因为直接使用会立刻给出真实反馈（可能证伪），而探讨可以把判决无限延后。

**三层判断合起来**：换皮 + 判据延迟 + 零使用。三轮圆桌没有产生新方向，产生的是一个诊断——**继续在方向上转圈是症状，不是治疗。** 唯一能改变结论的动作，不是再讨论方向，是产品决策者本人跑一次真实使用（D5 两周验证）或回答马斯克门槛问题（要不要重写为另一家公司）。

---

## 9. 关键待验证假设清单（供后续 dogfood 逐条判真伪）

> 以下假设在零运行数据下均无法证实也无法证伪。逐条需真实使用数据才能判生死。

| # | 假设 | 验证动作 | 判真伪口径 |
|---|---|---|---|
| H1 | 碎片收容有真实频次 | 一周内每次任务外碎片强制用 Workshop 记 | 记 ≥5 条、≥1 条后续被推进 → 成立 |
| H2 | 碎片需带项目/任务上下文 | 观察记录是否自动带 localProjectId/scopeType | 不带上下文 → 退化为 Apple Notes |
| H3 | 回流入口能省 token | 手工把上次 session 推理链粘进新 turn | 省不到一个数量级 → 中间件判死 |
| H4 | 多厂商协作场景真实存在 | 自己同时用 Codex+Claude 推进同一项目 | 无聚合需求 → 多厂商聚合缝也是空的 |
| H5 | 多厂商推理聚合能省理解 | 记录两边推理分歧，看下次 Agent 是否省重复理解 | 不省 → 唯一空位也判死 |
| H6 | 确认页有频次拐点 | 观察真实高频场景是否绕过它 | 高频绕过 → 护城河负资产 |
| H7 | ~~权限网关/审计账本有市场~~ | — | **已判死**：确认页拦的对象物种在代码里不存在（只 CRUD 自身笔记/任务数据），非"未验证"而是"被证伪的幽灵对象" |
| H8 | 多厂商聚合需求真实存在 | 把可迁移资产投 D5，两周真实使用 | 零使用 → D5 也是同状态尸体（唯一未判死方向） |

---

## 附：圆桌与文档关系

- 本文 = 探讨全过程纪要（draft，位于 `docs/think/`）
- [`workshop-direction-comparison.md`](workshop-direction-comparison.md) = 多方向多方案横向对比报告（draft，同目录）
- [`../drafts/workshop-product-concept.md`](../drafts/workshop-product-concept.md) = 产品概念草案（draft，探讨前已存在）
- [`../drafts/workshop-record-tool-plan.md`](../drafts/workshop-record-tool-plan.md) = 记录技能拆解草案（draft，探讨前已存在）
- `docs/decisions.md` D-003/D-008/D-014 = 已接受的项目事实（本探讨未修改）

> 本纪要记录的是一次探讨的过程与中间结论，**不是已接受决策**。若某条结论要成为项目事实，需按 AGENTS.md 的文档边界审查流程晋升。
