# Scope

updated_at: 2026-06-08

## G-001 Scope Boundary

```yaml
goal_id: G-001
must_have:
  - NebulaAuth 验证码登录、token 保存、token 刷新、401 重试和登出流程可验证。
  - Workshop API 的项目、组织、任务聚合契约可验证。
  - 当前用户任务过滤、项目分组、任务状态操作、便签窗口和 Dock / 托盘 / 快捷键打开入口可验证。
  - 本机凭据存储的阶段性边界被明确记录。
  - macOS zip/目录包构建流程可复现，并记录 DMG 暂不作为当前门槛。
nice_to_have:
  - 形成一页内测使用检查清单。
  - 为常见网络/登录失败提供更清晰的用户提示。
  - 补最小自动化 smoke 脚本，覆盖构建和主要渲染路径。
non_goals:
  - 完整团队任务管理。
  - 多平台签名发布、自动更新和安装器体系。
  - 后端 Workshop API 数据模型重构。
  - 将所有历史 Playwright 截图视为本次验收证据。
risk_controls:
  - 所有真实 token、账号、接口返回证据必须脱敏。
  - 如果没有测试账号，`T-001` / `T-002` 只能标为 blocked 或 partially verified。
  - 如果用户不接受明文配置文件存 token，`DC-002` 必须先落决策，再安排 keychain 改造。
  - 构建产物继续留在 `.gitignore` 范围，不作为治理源文件。
```
