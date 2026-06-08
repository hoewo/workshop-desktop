# Workshop Desktop 项目规划入口

本文件是项目治理入口，只保留当前焦点、读写路径和更新规则。历史证据、任务细节和决策不要堆到这里。

## 当前焦点

- `current_goal_id`: `G-001`（`proposed`）
- `current_iteration_id`: `I-001`（`proposed`）
- 当前规划主题：把 Workshop Desktop 从“本机已实现的托盘待办端”推进到“可交付内测版本”。
- 需要用户确认：是否接受 `G-001` / `I-001` 作为当前执行方向。

## 文档地图

- 当前状态：[docs/project/current.md](project/current.md)
- 项目事实与约束：[docs/project/context.md](project/context.md)
- Backlog：[docs/project/backlog.md](project/backlog.md)
- Goal：[docs/project/goals.md](project/goals.md)
- Scope：[docs/project/scopes.md](project/scopes.md)
- Iteration：[docs/project/iterations.md](project/iterations.md)
- Task：[docs/project/tasks.md](project/tasks.md)
- Review：[docs/project/reviews.md](project/reviews.md)
- Decision：[docs/project/decisions.md](project/decisions.md)
- Roadmap：[docs/project/roadmap.md](project/roadmap.md)
- 索引：[docs/project/indexes/document-map.md](project/indexes/document-map.md)，[docs/project/indexes/id-registry.md](project/indexes/id-registry.md)

## 更新规则

- 修改当前执行状态时，先改 `docs/project/current.md`，再同步对应源文件和索引。
- 新任务必须带 `goal_id`、`iteration_id`、`done_when` 和 `evidence`。
- Roadmap 是排序层，不是更大的 Goal；未被用户确认的项保持 `proposed`。
- README 继续作为产品和开发说明，不承载治理历史。
