import { AlertTriangle, CalendarClock, LoaderCircle, LogOut, X } from "lucide-react";
import type { FormEvent } from "react";
import type { AppConfig, AppUpdateStatus } from "../../../shared/types";
import { AuthFields } from "../AuthFields";
import { UpdateStatusPanel } from "../UpdateStatusPanel";

export function SettingsSurface({
  draftConfig,
  error,
  isSavingConfig,
  updateStatus,
  onCheckForUpdates,
  onCloseWindow,
  onInstallUpdate,
  onLogout,
  onSaveConfig,
  setDraftConfig
}: {
  draftConfig: AppConfig;
  error: string;
  isSavingConfig: boolean;
  updateStatus: AppUpdateStatus | null;
  onCheckForUpdates: () => void;
  onCloseWindow: () => void;
  onInstallUpdate: () => void;
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
