import type { AppUpdateStatus } from "../../../shared/types";
import { UpdateStatusPanel } from "../UpdateStatusPanel";
import { WorkshopMark } from "../WorkshopMark";

export function UpdateSurface({
  updateStatus,
  onCheckForUpdates,
  onInstallUpdate,
  onCloseWindow
}: {
  updateStatus: AppUpdateStatus | null;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onCloseWindow: () => void;
}) {
  return (
    <main className="app-shell update-shell">
      <section className="update-window-hero">
        <WorkshopMark />
        <div className="update-window-copy">
          <h1>{getUpdateWindowTitle(updateStatus)}</h1>
          <p>{getUpdateWindowDescription(updateStatus)}</p>
        </div>
      </section>

      <UpdateStatusPanel
        className="update-window-panel"
        status={updateStatus}
        title="更新状态"
        checkLabel="检查更新"
        installLabel="安装并重启应用"
        onCheckForUpdates={onCheckForUpdates}
        onInstallUpdate={onInstallUpdate}
      />

      <footer className="update-window-footer">
        <button className="secondary-button update-later-button" type="button" onClick={onCloseWindow}>
          稍后
        </button>
      </footer>
    </main>
  );
}

function getUpdateWindowTitle(status: AppUpdateStatus | null) {
  switch (status?.phase) {
    case "checking":
      return "正在检查 Workshop Todo 更新";
    case "available":
    case "downloading":
      return "正在下载新版本";
    case "downloaded":
      return "新版本的 Workshop Todo 可以安装了";
    case "not_available":
      return "Workshop Todo 已是最新版本";
    case "error":
      return "更新失败";
    case "disabled":
      return "当前环境不能检查更新";
    case "idle":
    default:
      return "检查 Workshop Todo 更新";
  }
}

function getUpdateWindowDescription(status: AppUpdateStatus | null) {
  const currentVersion = status?.currentVersion ? `当前版本 ${status.currentVersion}` : "当前版本未知";
  const availableVersion = status?.availableVersion ? `，可用版本 ${status.availableVersion}` : "";

  switch (status?.phase) {
    case "downloaded":
      return `${currentVersion}${availableVersion}。更新已下载完成，可以现在安装并重启应用。`;
    case "downloading":
      return `${currentVersion}${availableVersion}。下载完成后会在这里显示安装入口。`;
    case "not_available":
      return `${currentVersion}。暂时没有可安装的新版本。`;
    case "error":
      return `${currentVersion}。可以稍后重试，或确认当前应用来自已签名的 GitHub Release 包。`;
    case "disabled":
      return "开发模式或未打包环境不会连接正式更新源。";
    case "checking":
      return `${currentVersion}。正在连接更新源。`;
    case "available":
      return `${currentVersion}${availableVersion}。新版本已发现，正在准备下载。`;
    case "idle":
    default:
      return `${currentVersion}。点击检查后会从 GitHub Release 获取最新版本信息。`;
  }
}
