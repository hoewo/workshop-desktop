# Workshop Desktop · 聚焦收敛交互设计稿

> Status: draft · 非已接受项目事实
>
> 本目录是基于"记录 + 注入闭环"北极星方向的**前端交互设计稿**，独立于当前 workshop-desktop 前后端服务代码。它不改任何运行行为、accepted 决策或 app server/skill 边界，仅用于可视化"聚焦后客户端应该长什么样"。

## 这个设计稿在回答什么

前几轮收敛的结论：客户端要从"项目 + 任务源 + 运行"三足鼎立，收敛到"**记录为单焦点**"。MVP 已裁减任务源（无任务入口），Codex 运行降级为状态条、metrics 改指向记录。同时要为"记录↔Agent 双向流动"闭环预留可见位置：CLI 路径注入(push) + MCP 路径取用(pull) 为记录→Agent 方向，origin:agent 回写为 Agent→记录方向。

本设计稿把这些**可视化**，让人能直接看到聚焦后的交互形态，而不是停在文字描述。

## 视图清单

| 视图 | 对应收敛动作 | 设计要点 |
|---|---|---|
| 工作台 Home | 记录单焦点 / 任务源裁减 / Codex 运行降级 / metrics 改向记录 | 记录面板升主位，MVP 无任务入口，运行降为一行状态条 |
| 记录详情 | RecordSurface 打磨 | origin(human/agent) UI 区分、标注 badge、**注入命中历史**（闭环可见性） |
| 注入闭环 | 双路径补断环（`buildCodexUserInput` 注入 / `record.search` 取用） | 命中时间线：CLI 注入与 MCP 取用两条路径的记录→Agent 命中，回写 origin:agent 闭环可见 |
| 本地项目 | 注入落点（`localProjectId` + `cwd`） | 目录绑定 + 关联记录数 + 一键注入入口 |

## 安全模型在 UI 上的体现

- 读开放（双路径）：CLI 直调走 buildCodexUserInput 注入(push)，MCP 对接走 record.search 取用(pull)；脱敏边界由 app server 取用出口实现（规则配置预留中），不返 raw body
- 写收紧：agent 改写正文 / 状态变更 → 确认页（D-011，agent 按不了门铃的架构死锁待修，不在本稿范围）；人手动改写正文直接进入编辑页。MVP 已裁减任务，无"创建任务/转为任务"入口。
- origin 区分：human（人记）/ agent（机器记）始终可见，不混淆

## 运行方式

纯 vanilla HTML/CSS/JS，无构建、无依赖。双击 `index.html` 即可在浏览器打开。数据为内联模拟数据，仅用于演示交互形态。

## 与已接受决策的关系

- 本稿**不修改** D-003/D-008/D-011/D-014/D-017/D-018/D-019 任何 accepted 决策。
- 稿中"任务源裁减"是 MVP 范围决定：记录 scope 仅剩 项目 / 个人，无任务入口、无"转为任务"。是否恢复任务源，等注入 dogfood 验证后再定。
- 稿中"注入命中"是 dogfood 验证的可视化抓手，本身不改变 app server 权限面。
