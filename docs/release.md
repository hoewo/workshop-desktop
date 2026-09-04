# 发布

本文件是 Workshop Desktop 的发布操作手册，只保留本地打包、正式发布、发布验收和自动更新验证所需的稳定规则。具体配置和执行逻辑以代码为准。

## 事实源

- `package.json`：版本号、Electron Builder 配置、发布目标和随包资源。
- `scripts/package.sh`：本地构建与打包。
- `scripts/release.sh`：正式发布入口。
- `.github/workflows/release.yml`：云端构建、签名、公证和 GitHub Release。
- `build/entitlements.mac*.plist`：macOS 签名与公证权限。

`dist/`、`release/`、下载的安装包和临时验证文件都是生成物，不进入 Git。

## 本地打包

```bash
# 未打包应用目录
./scripts/package.sh dir

# 当前平台的 release 包
./scripts/package.sh dist
```

macOS 本机没有签名凭据时，`dist` 会生成未公证的本地 zip，只用于结构和启动验证，不能作为真实自动更新基线。

## 正式发布

核心入口：

```bash
bash scripts/release.sh
```

默认发布 `package.json` 当前版本；如果对应 tag 已存在，则自动提升一个 patch 版本。也可以指定升级方式或目标版本：

```bash
bash scripts/release.sh patch
bash scripts/release.sh minor
bash scripts/release.sh major
bash scripts/release.sh 0.2.0
```

`npx --yes pnpm release -- <参数>` 是同一脚本的等价别名。

发布前必须满足：

- 工作区干净，当前分支为 `main`，且本地不落后于 `origin/main`。
- GitHub CLI 已登录并能访问 `hoewo/workshop-desktop`。
- `package.json` 版本符合 `X.Y.Z`，目标 `vX.Y.Z` tag 尚不存在。
- GitHub Actions 已配置下文列出的 macOS 签名和公证 secrets。

脚本负责运行提交前检查、必要的版本提交、annotated tag、push、等待 Release workflow，并校验最终 Release 资产。tag 必须使用 `vX.Y.Z`，且去掉 `v` 后与 `package.json` 版本一致。

需要从 GitHub Actions 手动发版时，可以运行 `Release` workflow 并勾选 `confirm_release`。手动流程使用当前 `package.json` 版本，目标 tag 已存在时会失败。

## 发布完成标准

只有同时满足以下条件，才能认为发布完成：

- GitHub Actions 的 `Release` workflow 成功。
- GitHub Release 已公开，且不只是 source archives。
- Release 包含：
  - macOS universal zip、对应 blockmap 和 `latest-mac.yml`。
  - Windows x64 installer、对应 blockmap、portable exe 和 `latest.yml`。
  - Windows 资产使用无空格的稳定文件名：`Workshop-Todo-Setup-<version>.exe`、对应 blockmap 和 `Workshop-Todo-Portable-<version>.exe`；`latest.yml` 的 `url`、`path` 必须与 installer 文件名完全一致。
- 发布包携带 `workshop` CLI shim 和 `workshop-codex-collaboration` Skill；具体资源来源以 `package.json.build.extraResources` 为准。

## macOS 自动更新验证

macOS 发布版通过 `electron-updater` 读取公开 GitHub Release，不在客户端内置 GitHub token。

真实更新验证必须使用已签名、公证并安装的旧版 Release 包；开发模式、`electron-builder --dir` 和本地临时包不能作为旧版本基线。

验证步骤：

1. 安装一个较低版本的正式 Release。
2. 发布更高版本，并确认 Release 完成标准全部满足。
3. 在旧版设置页或应用菜单执行“检查更新...”。
4. 确认下载完成，并通过“重启更新”安装新版本。
5. 重启后确认应用版本已提升。

必要时解压下载的 macOS zip 并验证：

```bash
codesign --verify --deep --strict --verbose=2 /path/to/Workshop\ Todo.app
spctl --assess --type execute --verbose=4 /path/to/Workshop\ Todo.app
xcrun stapler validate /path/to/Workshop\ Todo.app
```

旧版和新版必须具有兼容的 Developer ID 签名；不能用 ad-hoc 签名包验证正式更新。

## GitHub Actions secrets

macOS 正式发布需要：

- `CSC_LINK`、`CSC_KEY_PASSWORD`：Developer ID Application 证书及密码。
- `APPLE_API_KEY_BASE64`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`：App Store Connect API key。

这些值只配置在 GitHub Actions secrets 中，不进入仓库或客户端。

## 常见失败

- tag 与 `package.json` 版本不一致：修正版本或创建正确的 annotated `vX.Y.Z` tag。
- Release 只有 source archives 或缺少预期资产：检查 `Release` workflow 和 electron-builder 输出。
- macOS 签名或公证失败：检查证书、密码和 App Store Connect API key。
- 自动更新找不到新版：确认旧版来自正式签名 Release、新版本更高，并检查 `latest-mac.yml`。
