# Iterations

updated_at: 2026-06-06

## I-001 真实使用链路与发布门槛验证

```yaml
id: I-001
name: 真实使用链路与发布门槛验证
status: proposed
theme: 用最短路径判断 Workshop Desktop 是否可以进入内部试用
primary_goal_id: G-001
supporting_goal_ids: []
reason_for_mix: 当前没有其他 active Goal。
review_date: 2026-06-13
selected_scope:
  - 登录和 token 生命周期
  - Workshop API 聚合契约
  - 托盘、预览、便签和状态操作
  - 本机凭据边界
  - zip/目录包构建门槛
excluded_scope:
  - 新增完整桌面项目管理能力
  - 自动更新、签名和 DMG 修复
  - 后端 API 结构调整
  - 团队总览或管理视图
success_criteria:
  - T-001 到 T-005 至少完成或形成明确 blocked 证据。
  - DC-001、DC-002、DC-003、DC-004 至少完成用户决策或保持 open 并说明阻塞。
  - Review 能明确判断：继续内测、先修风险、或暂停交付。
```

## I-001 Review 入口

Review 写入 [docs/project/reviews.md](reviews.md)。执行证据优先写入对应 Task 的 `evidence` 字段；较长日志或截图只链接，不复制全文。
