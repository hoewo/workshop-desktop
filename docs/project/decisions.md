# Decisions

updated_at: 2026-06-06

## Accepted Decisions

当前没有从治理文档中确认过的 accepted Decision。

## Open Decision Candidates

### DC-001 确认当前 active Goal / Iteration

```yaml
id: DC-001
status: open
question: 是否将 G-001 / I-001 接受为当前 active 规划？
options:
  - accept: 进入内测可交付验证。
  - revise: 调整为更小的交互验证或更大的发布计划。
  - defer: 只保留为候选规划，不启动执行。
impact: 决定 current.md、roadmap.md 和 tasks.md 是否从 proposed 转为 active。
```

### DC-002 本机 token 存储边界

```yaml
id: DC-002
status: open
question: 内测阶段是否接受 token 写入 Electron userData/config.json？
options:
  - accept_for_internal_trial: 接受为阶段性风险，文档注明限制。
  - require_keychain_before_trial: 内测前先改系统钥匙串或凭据管理器。
impact: 影响 T-004、G-001 risk_controls 和 Roadmap next/later。
```

### DC-003 发布格式边界

```yaml
id: DC-003
status: open
question: 内测交付物是否先使用 zip/目录包，暂不追求 DMG？
options:
  - zip_or_dir_now: 当前阶段以可复现 zip/目录包为交付门槛。
  - require_dmg: 先解决 DMG vendor 下载或镜像问题。
  - require_signed_distribution: 先规划签名、安装器或自动更新。
impact: 影响 T-005 和 Roadmap not_now。
```

### DC-004 任务可见性边界

```yaml
id: DC-004
status: open
question: 当前版本是否继续只展示“创建者或执行者是自己”的任务？
options:
  - keep_personal_scope: 保持轻量个人待办端定位。
  - add_team_scope_later: 将团队总览放入后续 Goal。
  - change_now: 当前内测前就调整可见性。
impact: 影响 G-001 non_goals、T-002 验证口径和后续产品范围。
```
