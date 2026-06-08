# Backlog

updated_at: 2026-06-08

Backlog 是原料，不直接作为可执行任务。只有进入 Goal 和 Iteration 后才形成 Task。

| id | type | title | status | source | route |
| --- | --- | --- | --- | --- | --- |
| `B-001` | Validation | 内测交付门槛需要明确 | open | README 已有能力和打包说明，但缺少验收口径 | `G-001` |
| `B-002` | Risk | NebulaAuth 登录和 token 刷新需要真实链路验证 | open | `src/main/main.ts` 实现登录、刷新、401 重试 | `T-001` |
| `B-003` | Risk | Workshop API 聚合契约可能随后端变化漂移 | open | `src/renderer/App.tsx` 同时拉取组织、项目和任务 | `T-002` |
| `B-004` | Validation | Dock / 托盘 / 快捷键入口、任务预览、便签窗口需要按真实桌面使用验收 | open | Dock / 托盘 / 快捷键入口、便签和预览在主进程与渲染层共同实现 | `T-003` |
| `B-005` | Decision Candidate | 本机凭据保护边界需要确认 | open | README 记录 token 当前写入 `userData/config.json` | `DC-002` |
| `B-006` | Risk | 发布格式和签名目标需要阶段性取舍 | open | 当前 macOS zip 可用，DMG 非默认目标 | `DC-003` / `T-005` |
| `B-007` | Risk | 自动化验证和人工验收证据不足 | open | 当前未见专门测试脚本 | `I-001` review |
| `B-008` | Question | “只展示我的任务”是内测产品边界还是临时实现 | open | README 和代码都以当前用户任务为默认边界 | `DC-004` |
| `B-009` | Feature | 快速新增个人任务的项目选择、默认字段和失败提示需要验收 | open | README 记录支持快速新增个人任务 | `I-001` 后续候选 |
