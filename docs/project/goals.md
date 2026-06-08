# Goals

updated_at: 2026-06-06

## G-001 Workshop Desktop 内测可交付

```yaml
id: G-001
title: Workshop Desktop 内测可交付
status: proposed
source_backlog:
  - B-001
  - B-002
  - B-003
  - B-004
  - B-005
  - B-006
  - B-007
  - B-008
why_now: 当前代码已经具备可运行和可打包形态，但缺少围绕真实登录、接口契约、桌面交互、凭据风险和发布格式的统一验收门槛。
expected_outcome: 一个内部用户可以安装或启动 Workshop Desktop，完成登录、查看自己的项目待办、处理任务状态、使用便签窗口，并知道当前版本的安全和发布边界。
success_criteria:
  - 真实或等价环境中完成登录、刷新、登出和过期处理验证。
  - 项目、组织和任务聚合结果与 Workshop 后端契约一致。
  - 托盘面板、任务预览、便签窗口和状态操作完成桌面端走查。
  - 本机 token 存储边界形成明确阶段性决策。
  - zip/目录包构建流程可复现，DMG 目标被明确放入 not_now 或后续工作。
non_goals:
  - 不把 Workshop Desktop 扩展成完整项目管理桌面端。
  - 不在本阶段强制做跨平台签名、自动更新和安装器体系。
  - 不替代 Workshop Web/API 的任务模型决策。
  - 不在没有用户确认前扩大到团队任务总览。
remaining_uncertainty:
  - 是否有可用于真实验证的 NebulaAuth / Workshop 测试账号。
  - 内测阶段是否接受明文配置文件存 token。
  - 分发对象是否需要签名、DMG 或自动更新。
```

## Goal Intake

```yaml
goal_intake:
  user_proposed_goal: 做一次规划
  historical_sources_checked:
    - README.md
    - package.json
    - .gitignore
    - src/main/main.ts
    - src/renderer/App.tsx
    - src/shared/types.ts
  evidence_supporting:
    - README 已记录当前能力、后端契约、NebulaAuth 契约和打包路径。
    - 主进程已有配置、token 刷新、托盘、便签、预览和每日刷新能力。
    - 渲染层已有项目/任务聚合、当前用户过滤、状态操作和登录 UI。
    - package.json 已有 dev/build/pack/dist 脚本，release 目录存在已生成产物。
  evidence_conflicting:
    - 当前没有既有治理文档或已接受的 Goal/Decision。
    - 当前目录不是 Git 仓库，变更审计和交付追踪需要额外注意。
    - 内测所需真实账号、签名目标和凭据安全边界未被确认。
  relation_to_active_goals: 未发现既有 active Goal。
  recommendation: keep_as_candidate
  required_user_decision: 确认是否将 G-001 接受为当前 active Goal。
```
