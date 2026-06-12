import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  LoaderCircle,
  LogOut,
  NotebookPen,
  RefreshCw,
  Settings,
  ShieldCheck,
  SquareTerminal,
  StickyNote,
  WifiOff,
  X
} from "lucide-react";
import type { FormEvent } from "react";
import type { AppConfig, AppUpdateStatus, CodexRunMeta } from "../../../shared/types";
import { codexRunStatusLabels, type ProjectTodoGroup } from "../../lib/tasks";
import { AuthFields } from "../AuthFields";
import { ProjectMenuRow } from "../TaskViews";
import { WorkshopMark } from "../WorkshopMark";

export function TraySurface({
  codexRuns,
  draftConfig,
  error,
  hoveredProjectId,
  isLoading,
  isSavingConfig,
  projectRecordCounts,
  projectTodoGroups,
  settingsOpen,
  updateStatus,
  hideProjectTaskPreview,
  loadData,
  onCheckForUpdates,
  onInstallUpdate,
  onLogout,
  onProjectHover,
  onProjectOpen,
  onProjectRecord,
  onSaveConfig,
  setDraftConfig,
  setSettingsOpen
}: {
  codexRuns: CodexRunMeta[];
  draftConfig: AppConfig;
  error: string;
  hoveredProjectId: number | null;
  isLoading: boolean;
  isSavingConfig: boolean;
  projectRecordCounts: Map<number, number>;
  projectTodoGroups: ProjectTodoGroup[];
  settingsOpen: boolean;
  updateStatus: AppUpdateStatus | null;
  hideProjectTaskPreview: () => void;
  loadData: () => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onLogout: () => void;
  onProjectHover: (group: ProjectTodoGroup, anchor: DOMRect) => void;
  onProjectOpen: (group: ProjectTodoGroup) => void;
  onProjectRecord: (group: ProjectTodoGroup) => void;
  onSaveConfig: (event: FormEvent<HTMLFormElement>) => void;
  setDraftConfig: (config: AppConfig) => void;
  setSettingsOpen: (open: boolean) => void;
}) {
  const updatePhaseLabel = getUpdatePhaseLabel(updateStatus);
  const updateActionDisabled = updateStatus?.phase === "checking" || updateStatus?.phase === "downloading";
  const updatePercent =
    typeof updateStatus?.percent === "number" && Number.isFinite(updateStatus.percent)
      ? `${Math.max(0, Math.min(100, updateStatus.percent)).toFixed(0)}%`
      : "";

  return (
    <main className="app-shell tray-menu-shell" onMouseLeave={hideProjectTaskPreview}>
      <header className="menu-topbar">
        <div className="menu-title">
          <WorkshopMark compact />
          <h1>待办项目</h1>
        </div>
        <div className="top-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => void window.workshopDesktop.openPersonalRecord()}
            title="个人记录"
            data-tooltip="个人记录"
          >
            <NotebookPen size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => void window.workshopDesktop.openSticky()}
            title="任务便签"
            data-tooltip="任务便签"
          >
            <StickyNote size={17} />
          </button>
          <button className="icon-button" type="button" onClick={loadData} title="刷新" data-tooltip="刷新">
            <RefreshCw size={17} className={isLoading ? "spin" : undefined} />
          </button>
          <button className="icon-button" type="button" onClick={() => setSettingsOpen(true)} title="设置" data-tooltip="设置">
            <Settings size={17} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="notice" role="alert">
          <WifiOff size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {updateStatus?.phase === "downloaded" ? (
        <div className="notice success" role="status">
          <Download size={16} />
          <span>新版本已下载，重启后生效</span>
        </div>
      ) : null}

      <section className="project-menu-list" aria-label="项目列表">
        {isLoading && projectTodoGroups.length === 0 ? (
          <div className="empty-state compact-empty">
            <LoaderCircle className="spin" size={22} />
            <span>同步中</span>
          </div>
        ) : null}

        {!isLoading && projectTodoGroups.length === 0 ? (
          <div className="empty-state compact-empty">
            <ShieldCheck size={24} />
            <span>没有可用项目</span>
          </div>
        ) : null}

        {projectTodoGroups.map((group) => (
          <ProjectMenuRow
            key={group.project.id}
            group={group}
            active={hoveredProjectId === group.project.id}
            recordCount={projectRecordCounts.get(group.project.id) ?? 0}
            onHover={onProjectHover}
            onOpen={onProjectOpen}
            onRecord={onProjectRecord}
          />
        ))}
      </section>

      {codexRuns.length > 0 ? (
        <section className="codex-run-list" aria-label="Codex 运行">
          <div className="codex-run-list-title">
            <SquareTerminal size={13} />
            <span>Codex 运行</span>
          </div>
          {codexRuns.slice(0, 5).map((run) => (
            <div key={run.runId} className={`codex-run-row status-${run.status}`} title={run.lastMessage || run.title}>
              <span className="codex-run-dot" aria-hidden="true" />
              <span className="codex-run-title">{run.title}</span>
              <span className="codex-run-meta">
                {run.projectName ? `${run.projectName} · ` : ""}
                {codexRunStatusLabels[run.status] ?? run.status}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {settingsOpen ? (
        <div className="settings-backdrop" role="presentation">
          <aside className="settings-panel" aria-label="设置">
            <header>
              <div>
                <div className="eyebrow">Settings</div>
                <h2>设置</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setSettingsOpen(false)} title="关闭">
                <X size={17} />
              </button>
            </header>

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

              <div className={`update-status-block update-${updateStatus?.phase ?? "idle"}`}>
                <div className="update-status-copy">
                  <span>应用更新</span>
                  <strong>{updatePhaseLabel}</strong>
                  {updateStatus?.message ? <small>{updateStatus.message}</small> : null}
                  {updateStatus?.availableVersion ? <small>版本 {updateStatus.availableVersion}</small> : null}
                  {updatePercent ? <small>{updatePercent}</small> : null}
                </div>
                <button
                  className="secondary-button update-action-button"
                  type="button"
                  onClick={updateStatus?.phase === "downloaded" ? onInstallUpdate : onCheckForUpdates}
                  disabled={updateActionDisabled || updateStatus?.phase === "disabled"}
                >
                  {updateStatus?.phase === "checking" || updateStatus?.phase === "downloading" ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : updateStatus?.phase === "downloaded" ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <Download size={15} />
                  )}
                  <span>{updateStatus?.phase === "downloaded" ? "重启更新" : "检查更新"}</span>
                </button>
              </div>

              <button className="save-button" type="submit" disabled={isSavingConfig}>
                {isSavingConfig ? <LoaderCircle className="spin" size={16} /> : <CalendarClock size={16} />}
                <span>保存并同步</span>
              </button>
              <button className="logout-button" type="button" onClick={onLogout}>
                <LogOut size={16} />
                <span>退出登录</span>
              </button>
            </form>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function getUpdatePhaseLabel(status: AppUpdateStatus | null) {
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
