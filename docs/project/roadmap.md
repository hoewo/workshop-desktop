# Roadmap

updated_at: 2026-06-06

Roadmap 是排序层，不是更大的 Goal。未被用户确认或 accepted Decision 支持的项保持 `proposed`。

```yaml
roadmap:
  now:
    - item: Workshop Desktop 内测可交付
      item_type: goal
      source: G-001
      status: proposed
      rationale: 当前实现已接近可运行和可打包状态，下一步应验证真实使用链路和发布门槛，而不是继续扩功能。
    - item: 确认当前 active 规划
      item_type: decision
      source: DC-001
      status: proposed
      rationale: 没有用户确认前，G-001/I-001 只能作为候选规划。
  next:
    - item: 内测反馈修复与体验收敛
      item_type: goal_candidate
      source: I-001 review candidate
      status: proposed
      rationale: 需要等 I-001 证据判断是修登录/API、修桌面交互，还是修发布流程。
    - item: 最小自动化 smoke 验证
      item_type: backlog
      source: B-007
      status: proposed
      rationale: 当前没有专门验收脚本，后续应减少每次发布前的人工重复验证。
  later:
    - item: 系统钥匙串/凭据管理器改造
      item_type: decision
      source: DC-002
      status: proposed
      rationale: 如果内测接受 JSON 存储，可以作为后续安全改造；如果不接受，则提前到 now。
    - item: 团队任务总览或更完整项目管理视图
      item_type: decision
      source: DC-004
      status: proposed
      rationale: 这会改变轻量个人托盘端定位，不能从当前实现直接推导为当前目标。
  not_now:
    - item: 完整桌面项目管理应用
      item_type: backlog
      source: G-001 non_goals
      status: deferred
      rationale: 当前目标是轻量个人待办托盘端，不扩成完整项目管理客户端。
    - item: DMG、签名和自动更新体系
      item_type: decision
      source: DC-003
      status: deferred
      rationale: README 已记录当前 macOS zip 可用，DMG 不是默认目标；除非用户确认，否则不作为 I-001 门槛。
```
