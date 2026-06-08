# 项目事实与约束

updated_at: 2026-06-08

## 当前产品事实

- Workshop Desktop 是一个轻量跨平台桌面端，用于快速查看和处理 Workshop 后端里的个人待办。
- 内测阶段 macOS 默认显示 Dock 图标，同时保留托盘/菜单栏入口和全局快捷键。
- 默认网关是 `https://api.feitianchengzi.com`。
- 当前 Workshop 业务路径是 `/workshop/v1/user`。
- 当前使用接口包括 `GET /projects`、`GET /tasks`、`POST /tasks`、`PUT /tasks/{id}`。
- 登录模式包括 NebulaAuth 验证码登录、手工 Bearer Token 和本地调试 Header。
- 任务默认只展示与当前用户相关的记录：创建者或执行者是自己。
- 支持轻量任务状态操作：开始、完成、阻塞、退回待办。
- 支持按项目、状态和关键词过滤。
- 支持每日固定时间刷新。
- 支持便签窗口和置顶切换。

## 代码事实来源

- `README.md`：当前能力、接口契约、登录契约、打包说明。
- `src/main/main.ts`：Electron Dock / 托盘 / 快捷键入口、窗口、便签、任务预览、配置读写、token 刷新、IPC、API 代理。
- `src/renderer/App.tsx`：登录面板、项目/组织/任务聚合、当前用户过滤、任务状态操作、预览和便签交互。
- `src/shared/types.ts`：AppConfig、API 响应、Project、Task、TaskState、DesktopBridge 等类型。
- `package.json`：开发、构建、打包脚本和 Electron Builder 目标。
- `.gitignore`：`node_modules/`、`dist/`、`release/`、`artifacts/` 被忽略。

## 当前约束

- 当前目录不是 Git 仓库；后续变更审计需要依赖文件对比而不是 `git diff`。
- Electron 配置目前写入 `userData/config.json`；README 已明确后续可替换为系统钥匙串/凭据管理器。
- macOS 默认打包目标是 zip；README 记录了本机生成 DMG 时存在 vendor 下载错误。
- 真实登录、接口返回、任务状态流转依赖外部 Workshop / NebulaAuth 服务。
- 当前没有专门的自动化验收脚本；已有 Playwright 输出和截图只能作为历史产物，不能自动证明本次内测就绪。
