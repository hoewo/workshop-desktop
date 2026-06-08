# 当前状态

updated_at: 2026-06-08

## Active Core

```yaml
current_focus: Workshop Desktop 内测可交付规划
current_goal_id: G-001
current_goal_status: proposed
current_iteration_id: I-001
current_iteration_status: proposed
required_user_decision: 是否确认 G-001 / I-001 作为当前执行方向
```

## 当前判断

现有代码和 README 已经支持 Dock / 托盘 / 全局快捷键入口、NebulaAuth 登录、Workshop API 聚合、当前用户任务过滤、任务状态操作、每日刷新和便签窗口。当前缺口不是再扩功能，而是把真实登录、API 契约、交互路径、凭据风险和打包发布门槛一起验收，形成可内测交付的闭环。

## 当前候选 Goal

- `G-001`: Workshop Desktop 内测可交付
- 状态：`proposed`
- 来源：README 当前能力、`src/main/main.ts`、`src/renderer/App.tsx`、`src/shared/types.ts`、打包脚本和 release 产物事实

## 当前候选 Iteration

- `I-001`: 真实使用链路与发布门槛验证
- 状态：`proposed`
- `primary_goal_id`: `G-001`
- Review 建议日期：2026-06-13

## 当前任务顺序

1. `T-001` 验证 NebulaAuth 登录与 token 生命周期
2. `T-002` 验证 Workshop API 聚合契约与当前用户过滤
3. `T-003` 验证 Dock / 托盘 / 快捷键入口、预览和便签核心交互
4. `T-004` 决定本机凭据与错误边界
5. `T-005` 固化打包发布门槛

## 当前开放决策

- `DC-001`: 是否确认 `G-001` / `I-001` 为当前 active 规划
- `DC-002`: 内测阶段是否接受 token 写入 Electron `userData/config.json`
- `DC-003`: 内测交付物是否先使用 zip/目录包，暂不追求 DMG
- `DC-004`: 当前任务可见性是否继续限定为“创建者或执行者是自己”
