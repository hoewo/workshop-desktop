import { CheckCircle2, Download, LoaderCircle } from "lucide-react";
import type { AppUpdateStatus } from "../../shared/types";

export function UpdateStatusPanel({
  status,
  title = "应用更新",
  checkLabel = "检查更新",
  installLabel = "重启更新",
  className = "",
  onCheckForUpdates,
  onInstallUpdate
}: {
  status: AppUpdateStatus | null;
  title?: string;
  checkLabel?: string;
  installLabel?: string;
  className?: string;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
}) {
  const phase = status?.phase ?? "idle";
  const actionDisabled = phase === "checking" || phase === "downloading";
  const actionIsInstall = phase === "downloaded";
  const updatePercent =
    typeof status?.percent === "number" && Number.isFinite(status.percent)
      ? `${Math.max(0, Math.min(100, status.percent)).toFixed(0)}%`
      : "";

  return (
    <div className={`update-status-block update-${phase} ${className}`.trim()}>
      <div className="update-status-copy">
        <span>{title}</span>
        <strong>{getUpdatePhaseLabel(status)}</strong>
        {status?.message ? <small>{status.message}</small> : null}
        {status?.availableVersion ? <small>版本 {status.availableVersion}</small> : null}
        {updatePercent ? <small>{updatePercent}</small> : null}
      </div>
      <button
        className="secondary-button update-action-button"
        type="button"
        onClick={actionIsInstall ? onInstallUpdate : onCheckForUpdates}
        disabled={actionDisabled || phase === "disabled"}
      >
        {phase === "checking" || phase === "downloading" ? (
          <LoaderCircle className="spin" size={15} />
        ) : actionIsInstall ? (
          <CheckCircle2 size={15} />
        ) : (
          <Download size={15} />
        )}
        <span>{actionIsInstall ? installLabel : checkLabel}</span>
      </button>
    </div>
  );
}

export function getUpdatePhaseLabel(status: AppUpdateStatus | null) {
  switch (status?.phase) {
    case "disabled":
      return "未启用";
    case "checking":
      return "检查中";
    case "available":
      return "发现新版本";
    case "downloading":
      return "下载中";
    case "downloaded":
      return "已下载";
    case "not_available":
      return "已是最新";
    case "error":
      return "更新失败";
    case "idle":
    default:
      return "可检查";
  }
}
