# 测试与验证

本项目当前有构建和打包检查，但没有专门的自动化测试套件。

## 安装

使用 pnpm：

```bash
npx --yes pnpm install
```

## 开发运行

以开发模式运行桌面端：

```bash
npx --yes pnpm dev
```

开发脚本会先构建 Electron 主进程，再在 `127.0.0.1` 启动 Vite，等待 renderer 就绪后启动 Electron。

## 构建验证

默认构建检查使用包装脚本：

```bash
./scripts/package.sh build
```

等价 pnpm 脚本：

```bash
npx --yes pnpm run build
```

## 本地 AI Bridge 验证

先启动桌面端：

```bash
npx --yes pnpm dev
```

再在另一个终端新增一条记录：

```bash
npx --yes pnpm app:record:create -- --title "AI 记录验证" --body "由 CLI 通过 app server 写入。" --open
```

预期结果：

- CLI 输出新记录 ID 和标题。
- Workshop Desktop 打开新建的个人记录窗口。
- 记录出现在个人记录列表中。

如果桌面端未运行，CLI 应提示找不到 app server，而不是直接写内部数据文件。

## 打包

构建未打包 app 目录：

```bash
./scripts/package.sh dir
```

构建 release 包：

```bash
./scripts/package.sh dist
```

macOS 当前默认目标是 zip。DMG 不是默认打包目标。

## 手工验证

涉及登录、API 调用、任务状态变更或当前用户过滤的改动，需要真实 Workshop/NebulaAuth 环境验证。

涉及窗口、菜单、快捷键、便签窗口或个人记录的改动，需要在运行中的 Electron 应用里直接检查相关界面：

- Dock/托盘菜单入口
- 全局快捷键
- 任务面板
- 便签窗口
- 个人记录列表或详情窗口
- 任务到记录、记录到任务的流转

涉及项目本地目录绑定的改动，需要手工检查：

- 项目任务列表未绑定时显示“请绑定本地目录”。
- 项目记录列表未绑定时显示“请绑定本地目录”。
- 点击提示后可以选择本地文件夹。
- 绑定后两个列表都显示同一项目的本地路径。
- 再次点击路径会打开对应文件夹。

涉及发送到 Codex 的改动，需要手工检查：

- 本机已安装 Codex CLI。
- 发送前项目已经绑定本地目录。
- 在任务详情点击发送到 Codex，会先保存任务备注，再由桌面端后台启动 Codex。
- 在项目记录或任务记录详情点击发送到 Codex，会先保存记录，再由桌面端后台启动 Codex。
- 未绑定本地目录时，界面应提示先绑定目录。
- 没有项目上下文的个人记录不能直接发送。

## 本机注意事项

如果 Vite/Rollup 原生依赖在内置环境下失败，先用本机正常 Node 环境重试同一命令，再判断是否是代码问题。
