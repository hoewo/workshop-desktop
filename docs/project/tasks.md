# Tasks

updated_at: 2026-06-08

## I-001 Task List

| id | title | goal_id | iteration_id | owner | status | done_when | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `T-001` | 验证 NebulaAuth 登录与 token 生命周期 | `G-001` | `I-001` | Codex + user | proposed | 能完成发送验证码、验证码登录、配置保存、token 临近过期或 401 后刷新、登出后清空登录态的验证；若缺账号，记录 blocked 原因。 | 待补：脱敏账号类型、验证步骤、截图或日志摘要。 |
| `T-002` | 验证 Workshop API 聚合契约与当前用户过滤 | `G-001` | `I-001` | Codex + user | proposed | 能验证 `/projects`、`/organizations`、`/tasks` 的返回形态被正确聚合，并确认只展示创建者或执行者为当前用户的任务。 | 待补：脱敏请求/响应摘要、任务数量对照或截图。 |
| `T-003` | 验证 Dock / 托盘 / 快捷键入口、预览和便签核心交互 | `G-001` | `I-001` | Codex | proposed | 能走查 Dock、托盘和全局快捷键打开面板、失焦隐藏、项目 hover 预览、打开便签、从便签抽出单任务、置顶切换、任务状态按钮。 | 待补：桌面走查截图、失败点记录。 |
| `T-004` | 决定本机凭据与错误边界 | `G-001` | `I-001` | user + Codex | proposed | 明确内测阶段是否接受 `userData/config.json` 保存 token；同时确认过期、网络失败、接口失败的用户提示是否足够。 | 待补：`DC-002` 决策结果和相关风险说明。 |
| `T-005` | 固化打包发布门槛 | `G-001` | `I-001` | Codex | proposed | `build` 和 macOS `dir` 或 `zip` 打包路径可复现；README 或发布说明明确 DMG 不作为当前门槛。 | 待补：构建命令结果、产物路径、失败或警告摘要。 |

## Task 规则

- 任务状态使用 `proposed`、`in_progress`、`blocked`、`completed`、`cancelled`。
- 执行时先补证据，再进入 Review。
- 任何真实凭据或用户信息必须脱敏。
