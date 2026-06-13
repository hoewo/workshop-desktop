# 发布

本文件是 Workshop Desktop 的发布、发布资产和自动更新文档。涉及打包、签名、公证、GitHub Release、自动更新或发布说明的变更，应优先更新本文件。

## 事实源

- `package.json`：版本号、Electron Builder 配置、发布目标和 `pnpm release` 脚本入口。
- `.github/workflows/release.yml`：正式云端发布流程。
- `scripts/release.sh`：本地发版编排脚本。
- `scripts/package.sh`：本地构建、目录包和 release 包脚本。
- `resources/`：进入应用或安装包的图标资产。
- `resources/skills/workshop-codex-collaboration/`：进入应用包的 Workshop Codex skill 资源。
- `build/entitlements.mac.plist` 和 `build/entitlements.mac.inherit.plist`：macOS 签名、公证相关权限配置。

代码和脚本是当前运行时事实；如果本文和脚本冲突，先核实现有脚本行为，再更新本文。

## 发布资产

跟随源码维护的应用资产：

- `resources/app-icon.png`
- `resources/app-icon.icns`
- `resources/app-icon.ico`
- `resources/app-icon.svg`
- `resources/tray-icon.png`
- `resources/tray-icon.svg`
- `resources/tray-iconTemplate.png`
- `resources/tray-iconTemplate.svg`
- `resources/tray-iconTemplate@2x.png`
- `scripts/workshop-desktop-cli.mjs`：随 app 打包为 `cli/workshop-desktop-cli.mjs`，供发布版自动安装的 `workshop` / `workshop-desktop` shim 调用。
- `resources/skills/workshop-codex-collaboration/`：随 app 打包为 `skills/workshop-codex-collaboration/`，供首次启动提示和设置页安装 Workshop Codex skill。

生成物不进入 Git：

- `dist/`
- `release/`
- 本地打包输出、下载的 GitHub Release 包、校验用截图和临时日志

如果图标、截图、release notes、安装说明或自动更新说明会影响用户获取、识别、安装或更新应用，应把稳定规则写入本文，而不是散落在临时记录里。

## 本地打包

构建未打包 app 目录：

```bash
./scripts/package.sh dir
```

构建 release 包：

```bash
./scripts/package.sh dist
```

macOS 本地无签名 secrets 时可只生成 zip 做本机验证。正式 macOS release 由 GitHub Actions 生成签名、公证后的 universal zip，并上传 `latest-mac.yml` 供自动更新使用。

本机默认生成当前平台安装包；云端 macOS release 必须包含：

```text
release/Workshop.Todo-<version>-universal-mac.zip
```

发布版启动时会自动安装用户级 CLI shim：

- 默认写入 `~/.local/bin/workshop` 和 `~/.local/bin/workshop-desktop`。
- shim 使用 Electron 自带的 Node 执行随 app 打包的 `cli/workshop-desktop-cli.mjs`，不要求用户单独安装 Node。
- macOS 会以幂等方式在当前用户 shell profile 中补充 `~/.local/bin` PATH；已打开的终端可能需要新开窗口后才能识别命令。
- 自动安装不写 `/usr/local/bin`，不需要管理员权限。

发布版也会携带 Workshop Codex skill：

- 内置资源来自 `resources/skills/workshop-codex-collaboration/`。
- 首次启动会轻提示安装；设置页可检查、安装或更新。
- 默认安装到 `~/.codex/skills/workshop-codex-collaboration`。
- 目标目录已有不同内容时，先备份为同级 `workshop-codex-collaboration.backup-*`，再安装内置版本。

## 正式发布

正式发布优先使用 release 脚本：

```bash
npx --yes pnpm release
```

默认发布当前 `package.json` 版本；如果对应 `vX.Y.Z` tag 已存在，则自动升一个 patch 版本。也可以显式指定版本或 bump 类型：

```bash
npx --yes pnpm release -- 0.1.15
npx --yes pnpm release -- patch
npx --yes pnpm release -- minor
npx --yes pnpm release -- major
```

发布前必须确认：

- 工作区干净。
- 当前分支是 `main`。
- GitHub CLI 已登录并可访问 `hoewo/workshop-desktop`。
- `package.json` version 是 `X.Y.Z` 格式。
- 目标 tag 未被本地或远端占用。
- GitHub Actions release secrets 已配置。

脚本会执行：

- 拉取 `main` 和 tags。
- 校验本地 `main` 未落后远端。
- 必要时更新并提交 `package.json` 版本。
- 运行 `scripts/pre-commit-check.sh`。
- 创建 annotated `vX.Y.Z` tag。
- push `main` 和 tag。
- 等待 `Release` GitHub Actions workflow 结束。
- 使用 `gh release view` 校验 GitHub Release 资产。

也可以在 GitHub Actions 页面手动触发 `Release` workflow。手动触发不会修改 `package.json`，需要勾选 `confirm_release`，确认它会在 macOS 和 Windows 构建成功后创建当前 `package.json` 版本对应的 `vX.Y.Z` tag，再发布 GitHub Release。如果该 tag 已存在，workflow 会在构建前失败；需要先通过 release 脚本或手工提交方式提升版本号。

tag 约定使用 annotated `vX.Y.Z`：

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
```

除非正在兼容旧流程，不要创建裸数字 tag。tag 去掉 `v` 后必须和 `package.json` version 完全一致。

## GitHub Release 输出

云端发布通过 GitHub Actions 生成：

- macOS universal zip
- macOS universal zip blockmap
- `latest-mac.yml`
- Windows x64 NSIS installer
- Windows x64 portable exe
- `latest.yml`

发布完成的判定必须来自 GitHub Actions `Release` workflow 成功，以及 `gh release view` 能看到 macOS universal zip、`latest-mac.yml`、Windows exe 和 `latest.yml` 等预期资产。只有 source archives 不算发布完成。

## macOS 自动更新

macOS 自动更新使用 `electron-updater` 访问公开 GitHub Release。客户端直接读取 Release 里的 `latest-mac.yml`、zip 和 blockmap，不内置 GitHub token，也不要求 `WORKSHOP_DESKTOP_UPDATE_TOKEN`。

开发模式下更新状态会显示未启用；不能用 `pnpm dev` 验证真实自动更新。

macOS 自动更新验证必须使用签名、公证后的 GitHub Release 包作为旧版和新版基线；不要用本地 `release/mac-arm64/*.app`、`electron-builder --dir` 或开发模式应用验证真实更新。

验证步骤：

1. 安装一个旧版本，例如 `v0.1.10`。
2. 发布一个更高版本 tag，且 tag 版本和 `package.json` version 一致。
3. 打开旧版应用，进入设置，确认“应用更新”能检查到新版本并自动下载。
4. 在 macOS 顶部应用菜单点击“检查更新...”，确认会打开独立更新窗口并显示同一更新状态。
5. 下载完成后点击“重启更新”或“安装并重启应用”，确认应用重启后版本变为新版本。

更新链路变更后，至少确认 `latest-mac.yml`、macOS universal zip、zip blockmap、签名和公证状态。必要时下载 release zip 后验证：

```bash
codesign --verify --deep --strict --verbose=2 /path/to/Workshop\ Todo.app
spctl --assess --type execute --verbose=4 /path/to/Workshop\ Todo.app
xcrun stapler validate /path/to/Workshop\ Todo.app
```

## 发布环境

脚本默认设置：

- `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
- `CSC_IDENTITY_AUTO_DISCOVERY=false`

如果要走自己的签名或下载源，可在命令前覆盖环境变量。

macOS 云端发布需要以下 GitHub Actions secrets：

- `CSC_LINK`：Developer ID Application 证书 `.p12` 的 base64 或 electron-builder 支持的证书链接。
- `CSC_KEY_PASSWORD`：证书导出密码。
- `APPLE_API_KEY_BASE64`：App Store Connect API key `.p8` 文件内容的 base64。
- `APPLE_API_KEY_ID`：App Store Connect API key ID。
- `APPLE_API_ISSUER`：App Store Connect issuer ID。

## 故障判断

- GitHub Release 只有 source archives：通常是 publish job 被跳过、tag 不符合触发条件或 workflow 失败。
- tag/version 不一致：修正 `package.json` version 或重新创建正确的 annotated `vX.Y.Z` tag，不要把错误 tag 当作完成发布。
- 缺少 macOS universal zip、`latest-mac.yml`、Windows exe 或 `latest.yml`：先检查 GitHub Actions 日志和 electron-builder publish 输出。
- macOS 包未签名或未公证：先检查 release secrets、证书类型和 notarization 输出。
- 本机找不到 `pnpm`、`npm` 或 `gh`：优先检查 `/opt/homebrew/bin` 是否在当前执行环境 PATH 中。
- 自动更新无法发现新版本：先确认旧版是已安装的签名 release 包，新版 GitHub Release 公开可访问，且 `latest-mac.yml` 指向正确 zip。
