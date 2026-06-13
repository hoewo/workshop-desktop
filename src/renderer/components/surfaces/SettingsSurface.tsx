import { AlertTriangle, Bot, BookOpenText, CalendarClock, CheckCircle2, Download, LoaderCircle, LogOut, X } from "lucide-react";
import type { FormEvent } from "react";
import type { AppConfig, AppUpdateStatus, WorkshopCodexSkillStatus } from "../../../shared/types";
import { AuthFields } from "../AuthFields";
import { UpdateStatusPanel } from "../UpdateStatusPanel";

export function SettingsSurface({
  draftConfig,
  error,
  isSavingConfig,
  isInstallingWorkshopSkill,
  updateStatus,
  workshopSkillStatus,
  onCheckForUpdates,
  onCloseWindow,
  onInstallUpdate,
  onInstallWorkshopSkill,
  onOpenManual,
  onLogout,
  onSaveConfig,
  setDraftConfig
}: {
  draftConfig: AppConfig;
  error: string;
  isSavingConfig: boolean;
  isInstallingWorkshopSkill: boolean;
  updateStatus: AppUpdateStatus | null;
  workshopSkillStatus: WorkshopCodexSkillStatus | null;
  onCheckForUpdates: () => void;
  onCloseWindow: () => void;
  onInstallUpdate: () => void;
  onInstallWorkshopSkill: () => void;
  onOpenManual: () => void;
  onLogout: () => void;
  onSaveConfig: (event: FormEvent<HTMLFormElement>) => void;
  setDraftConfig: (config: AppConfig) => void;
}) {
  return (
    <main className="app-shell settings-shell">
      <section className="settings-panel" aria-label="设置">
        <header>
          <div>
            <div className="eyebrow">Settings</div>
            <h2>设置</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCloseWindow} title="关闭">
            <X size={17} />
          </button>
        </header>

        {error ? (
          <div className="notice" role="alert">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={onSaveConfig}>
          <AuthFields draftConfig={draftConfig} setDraftConfig={setDraftConfig} />

          <div className="settings-block">
            <label className="toggle-line">
              <input
                type="checkbox"
                checked={draftConfig.dailyRefreshEnabled}
                onChange={(event) => setDraftConfig({ ...draftConfig, dailyRefreshEnabled: event.target.checked })}
              />
              <span>每日定时更新</span>
            </label>
            <label>
              <span>更新时间</span>
              <input
                type="time"
                value={draftConfig.dailyRefreshTime}
                disabled={!draftConfig.dailyRefreshEnabled}
                onChange={(event) => setDraftConfig({ ...draftConfig, dailyRefreshTime: event.target.value })}
              />
            </label>
          </div>

          <label className="toggle-line">
            <input
              type="checkbox"
              checked={draftConfig.stickyAlwaysOnTop}
              onChange={(event) => setDraftConfig({ ...draftConfig, stickyAlwaysOnTop: event.target.checked })}
            />
            <span>便签默认置顶</span>
          </label>

          <label className="toggle-line">
            <input
              type="checkbox"
              checked={draftConfig.showDockIcon}
              onChange={(event) => setDraftConfig({ ...draftConfig, showDockIcon: event.target.checked })}
            />
            <span>显示 Dock 图标</span>
          </label>

          <label className="toggle-line">
            <input
              type="checkbox"
              checked={draftConfig.globalShortcutEnabled}
              onChange={(event) => setDraftConfig({ ...draftConfig, globalShortcutEnabled: event.target.checked })}
            />
            <span>全局快捷键 Command+Option+W</span>
          </label>

          <div className="settings-warning">
            <AlertTriangle size={15} />
            <span>本地 Header 仅用于直连开发服务；生产环境应走网关。</span>
          </div>

          <UpdateStatusPanel status={updateStatus} onCheckForUpdates={onCheckForUpdates} onInstallUpdate={onInstallUpdate} />

          <div className={`skill-status-block ${getSkillStatusClass(workshopSkillStatus)}`}>
            <div className="skill-status-copy">
              <span>AI 协作</span>
              <strong>{getSkillStatusLabel(workshopSkillStatus)}</strong>
              <small>{getSkillStatusDescription(workshopSkillStatus)}</small>
              {workshopSkillStatus?.backupDir ? <small>已备份旧版本：{workshopSkillStatus.backupDir}</small> : null}
            </div>
            <button
              className="secondary-button skill-action-button"
              type="button"
              onClick={onInstallWorkshopSkill}
              disabled={isInstallingWorkshopSkill || workshopSkillStatus?.bundled === false}
            >
              {isInstallingWorkshopSkill ? (
                <LoaderCircle className="spin" size={15} />
              ) : workshopSkillStatus?.upToDate ? (
                <CheckCircle2 size={15} />
              ) : workshopSkillStatus?.installed ? (
                <Download size={15} />
              ) : (
                <Bot size={15} />
              )}
              <span>{getSkillActionLabel(workshopSkillStatus, isInstallingWorkshopSkill)}</span>
            </button>
          </div>

          <button className="secondary-button settings-manual-button" type="button" onClick={onOpenManual}>
            <BookOpenText size={16} />
            <span>打开使用手册</span>
          </button>

          <button className="save-button" type="submit" disabled={isSavingConfig}>
            {isSavingConfig ? <LoaderCircle className="spin" size={16} /> : <CalendarClock size={16} />}
            <span>保存并同步</span>
          </button>
          <button className="logout-button" type="button" onClick={onLogout}>
            <LogOut size={16} />
            <span>退出登录</span>
          </button>
        </form>
      </section>
    </main>
  );
}

function getSkillStatusLabel(status: WorkshopCodexSkillStatus | null) {
  if (!status) {
    return "检查中";
  }
  if (!status.bundled) {
    return "内置资源缺失";
  }
  if (status.upToDate) {
    return "Skill 已安装";
  }
  if (status.installed) {
    return "Skill 可更新";
  }
  return "Skill 未安装";
}

function getSkillStatusDescription(status: WorkshopCodexSkillStatus | null) {
  if (!status) {
    return "正在检查本机 Codex skill 目录。";
  }
  if (status.error) {
    return status.error;
  }
  if (!status.bundled) {
    return "当前应用包没有携带 Workshop Codex skill。";
  }
  if (status.upToDate) {
    return `已安装到 ${status.targetDir}`;
  }
  if (status.installed) {
    return `安装到 ${status.targetDir}，更新前会备份旧版本。`;
  }
  return `安装到 ${status.targetDir}，新开的 Codex 线程会自动发现。`;
}

function getSkillActionLabel(status: WorkshopCodexSkillStatus | null, busy: boolean) {
  if (busy) {
    return "安装中";
  }
  if (status?.upToDate) {
    return "重新安装";
  }
  if (status?.installed) {
    return "更新 Skill";
  }
  return "安装 Skill";
}

function getSkillStatusClass(status: WorkshopCodexSkillStatus | null) {
  if (!status) {
    return "skill-checking";
  }
  if (status.error || !status.bundled) {
    return "skill-error";
  }
  if (status.upToDate) {
    return "skill-ready";
  }
  return "skill-action-needed";
}
