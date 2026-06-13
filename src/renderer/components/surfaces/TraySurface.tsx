import {
  CircleHelp,
  Download,
  LoaderCircle,
  NotebookPen,
  RefreshCw,
  Settings,
  ShieldCheck,
  SquareTerminal,
  StickyNote,
  WifiOff
} from "lucide-react";
import type { AppUpdateStatus, CodexRunMeta } from "../../../shared/types";
import { codexRunStatusLabels, type ProjectTodoGroup } from "../../lib/tasks";
import { ProjectMenuRow } from "../TaskViews";
import { WorkshopMark } from "../WorkshopMark";

export function TraySurface({
  codexRuns,
  error,
  hoveredProjectId,
  isLoading,
  projectRecordCounts,
  projectTodoGroups,
  updateStatus,
  hasManualUpdate,
  hideProjectTaskPreview,
  loadData,
  onOpenManual,
  onOpenSettings,
  onProjectHover,
  onProjectOpen,
  onProjectRecord
}: {
  codexRuns: CodexRunMeta[];
  error: string;
  hoveredProjectId: number | null;
  isLoading: boolean;
  projectRecordCounts: Map<number, number>;
  projectTodoGroups: ProjectTodoGroup[];
  updateStatus: AppUpdateStatus | null;
  hasManualUpdate: boolean;
  hideProjectTaskPreview: () => void;
  loadData: () => void;
  onOpenManual: () => void;
  onOpenSettings: () => void;
  onProjectHover: (group: ProjectTodoGroup, anchor: DOMRect) => void;
  onProjectOpen: (group: ProjectTodoGroup) => void;
  onProjectRecord: (group: ProjectTodoGroup) => void;
}) {
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
          <button
            className={`icon-button ${hasManualUpdate ? "has-update-dot" : ""}`}
            type="button"
            onClick={onOpenManual}
            title="使用手册"
            data-tooltip="使用手册"
          >
            <CircleHelp size={17} />
          </button>
          <button className="icon-button" type="button" onClick={onOpenSettings} title="设置" data-tooltip="设置">
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
    </main>
  );
}
