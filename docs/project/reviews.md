# Reviews

updated_at: 2026-06-06

## I-001 Review Checklist

```yaml
iteration_review:
  iteration_id: I-001
  primary_goal_id: G-001
  supporting_goal_ids: []
  result: not_started
  evidence:
    - T-001 evidence pending
    - T-002 evidence pending
    - T-003 evidence pending
    - T-004 evidence pending
    - T-005 evidence pending
  review_questions:
    - 是否可以进入内部试用？
    - 如果不能，阻塞是账号/API、交互、凭据安全、打包发布，还是证据不足？
    - 哪些风险可以作为内测限制说明接受，哪些必须先修？
  next_iteration_candidates:
    - 内测反馈修复
    - 凭据安全改造
    - 自动化 smoke 验证
```

## Goal Progress 模板

```yaml
goal_progress:
  - goal_id: G-001
    covered_iterations:
      - I-001
    completed_tasks: []
    evidence: []
    remaining_uncertainty:
      - 待 I-001 执行后确认。
    status: proposed
```
