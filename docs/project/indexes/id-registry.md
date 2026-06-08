# ID Registry

updated_at: 2026-06-08

## Goals

| id | title | status | source |
| --- | --- | --- | --- |
| `G-001` | Workshop Desktop 内测可交付 | proposed | `docs/project/goals.md` |

## Iterations

| id | title | status | primary_goal_id | source |
| --- | --- | --- | --- | --- |
| `I-001` | 真实使用链路与发布门槛验证 | proposed | `G-001` | `docs/project/iterations.md` |

## Tasks

| id | title | status | goal_id | iteration_id | source |
| --- | --- | --- | --- | --- | --- |
| `T-001` | 验证 NebulaAuth 登录与 token 生命周期 | proposed | `G-001` | `I-001` | `docs/project/tasks.md` |
| `T-002` | 验证 Workshop API 聚合契约与当前用户过滤 | proposed | `G-001` | `I-001` | `docs/project/tasks.md` |
| `T-003` | 验证 Dock / 托盘 / 快捷键入口、预览和便签核心交互 | proposed | `G-001` | `I-001` | `docs/project/tasks.md` |
| `T-004` | 决定本机凭据与错误边界 | proposed | `G-001` | `I-001` | `docs/project/tasks.md` |
| `T-005` | 固化打包发布门槛 | proposed | `G-001` | `I-001` | `docs/project/tasks.md` |

## Backlog

| id | title | status | source |
| --- | --- | --- | --- |
| `B-001` | 内测交付门槛需要明确 | open | `docs/project/backlog.md` |
| `B-002` | NebulaAuth 登录和 token 刷新需要真实链路验证 | open | `docs/project/backlog.md` |
| `B-003` | Workshop API 聚合契约可能随后端变化漂移 | open | `docs/project/backlog.md` |
| `B-004` | Dock / 托盘 / 快捷键入口、任务预览、便签窗口需要按真实桌面使用验收 | open | `docs/project/backlog.md` |
| `B-005` | 本机凭据保护边界需要确认 | open | `docs/project/backlog.md` |
| `B-006` | 发布格式和签名目标需要阶段性取舍 | open | `docs/project/backlog.md` |
| `B-007` | 自动化验证和人工验收证据不足 | open | `docs/project/backlog.md` |
| `B-008` | “只展示我的任务”是内测产品边界还是临时实现 | open | `docs/project/backlog.md` |
| `B-009` | 快速新增个人任务的项目选择、默认字段和失败提示需要验收 | open | `docs/project/backlog.md` |

## Decision Candidates

| id | title | status | source |
| --- | --- | --- | --- |
| `DC-001` | 确认当前 active Goal / Iteration | open | `docs/project/decisions.md` |
| `DC-002` | 本机 token 存储边界 | open | `docs/project/decisions.md` |
| `DC-003` | 发布格式边界 | open | `docs/project/decisions.md` |
| `DC-004` | 任务可见性边界 | open | `docs/project/decisions.md` |
