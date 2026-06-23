import {
  CircleHelp,
  ChevronRight,
  Download,
  House,
  LoaderCircle,
  NotebookPen,
  RefreshCw,
  ShieldCheck,
  SquareTerminal,
  StickyNote,
  WifiOff
} from "lucide-react";
import { useState } from "react";
import type { AppUpdateStatus, CodexRunMeta, LocalProject } from "../../../shared/types";
import { summarizeCodexFailureForDisplay } from "../../../shared/codexErrors";
import { codexRunStatusLabels, type ProjectTodoGroup } from "../../lib/tasks";
import { LocalProjectContextMenu, type LocalProjectContextMenuState } from "../LocalProjectContextMenu";
import { WorkshopMark } from "../WorkshopMark";

const trayLoadedAt = Date.now();
const historicalCodexRunStatusLabels = {
  completed: "上次完成",
  failed: "上次失败",
  interrupted: "上次中断"
} as const;

function codexRunStatusLabel(run: CodexRunMeta) {
  if (run.status === "running") {
    return codexRunStatusLabels.running;
  }
  const startedAtMs = Date.parse(run.startedAt);
  const isHistorical = Number.isFinite(startedAtMs) && startedAtMs < trayLoadedAt - 2_000;
  return isHistorical ? historicalCodexRunStatusLabels[run.status] : codexRunStatusLabels[run.status];
}

export function TraySurface({
  codexRuns,
  error,
  hoveredProjectId,
  isLoading,
  localProjects,
  localProjectRecordCounts,
  projectRecordCounts,
  projectLocalDirectories,
  projectTodoGroups,
  updateStatus,
  hasManualUpdate,
  hideProjectTaskPreview,
  loadData,
  onLocalProjectDirectoryClick,
  onLocalProjectRecord,
  onLinkLocalProjectRemote,
  onOpenManual,
  onOpenHome,
  onRenameLocalProject,
  onUnlinkLocalProjectRemote,
  onProjectHover,
  onRemoteProjectDirectoryClick,
  onProjectRecord
}: {
  codexRuns: CodexRunMeta[];
  error: string;
  hoveredProjectId: number | null;
  isLoading: boolean;
  localProjects: LocalProject[];
  localProjectRecordCounts: Map<string, number>;
  projectRecordCounts: Map<number, number>;
  projectLocalDirectories: Record<string, string>;
  projectTodoGroups: ProjectTodoGroup[];
  updateStatus: AppUpdateStatus | null;
  hasManualUpdate: boolean;
  hideProjectTaskPreview: () => void;
  loadData: () => void;
  onLocalProjectDirectoryClick: (localProjectId: string) => void;
  onLocalProjectRecord: (project: LocalProject) => void;
  onLinkLocalProjectRemote: (project: LocalProject) => void;
  onOpenManual: () => void;
  onOpenHome: () => void;
  onRenameLocalProject: (project: LocalProject) => void;
  onUnlinkLocalProjectRemote: (project: LocalProject) => void;
  onProjectHover: (group: ProjectTodoGroup, anchor: DOMRect) => void;
  onRemoteProjectDirectoryClick: (projectId: number) => void;
  onProjectRecord: (group: ProjectTodoGroup) => void;
}) {
  const [localProjectMenu, setLocalProjectMenu] = useState<LocalProjectContextMenuState | null>(null);
  const linkedWorkshopProjectIds = new Set(
    localProjects.map((project) => project.linkedWorkshopProjectId).filter((projectId): projectId is number => Boolean(projectId))
  );
  const remoteGroupsByProjectId = new Map(projectTodoGroups.map((group) => [group.project.id, group]));
  const remoteProjects = projectTodoGroups.filter((group) => !linkedWorkshopProjectIds.has(group.project.id));
  const hasProjects = localProjects.length > 0 || remoteProjects.length > 0;

  return (
    <main className="app-shell tray-menu-shell" onMouseLeave={hideProjectTaskPreview}>
      <header className="menu-topbar">
        <div className="menu-title">
          <WorkshopMark compact />
          <h1>项目</h1>
        </div>
        <div className="top-actions">
          <button className="icon-button" type="button" onClick={onOpenHome} title="工作台" data-tooltip="工作台">
            <House size={17} />
          </button>
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
            title="桌面便签"
            data-tooltip="桌面便签"
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
        {isLoading && !hasProjects ? (
          <div className="empty-state compact-empty">
            <LoaderCircle className="spin" size={22} />
            <span>同步中</span>
          </div>
        ) : null}

        {!isLoading && !hasProjects ? (
          <div className="empty-state compact-empty">
            <ShieldCheck size={24} />
            <span>没有本地项目</span>
          </div>
        ) : null}

        {localProjects.map((project) => {
          const linkedGroup = project.linkedWorkshopProjectId ? remoteGroupsByProjectId.get(project.linkedWorkshopProjectId) : undefined;
          const recordCount = localProjectRecordCounts.get(project.id) ?? 0;
          const directoryLabel = project.localDirectory || "未绑定目录，点击绑定";
          return (
            <article
              key={project.id}
              className={`project-menu-item tray-project-menu-item ${project.localDirectory ? "directory-bound" : "directory-unbound"}`}
              role="button"
              tabIndex={0}
              onMouseEnter={(event) => {
                if (linkedGroup) {
                  onProjectHover(linkedGroup, event.currentTarget.getBoundingClientRect());
                }
              }}
              onFocus={(event) => {
                if (linkedGroup) {
                  onProjectHover(linkedGroup, event.currentTarget.getBoundingClientRect());
                }
              }}
              onClick={() => {
                setLocalProjectMenu(null);
                onLocalProjectRecord(project);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setLocalProjectMenu({ project, x: event.clientX, y: event.clientY });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setLocalProjectMenu(null);
                  onLocalProjectRecord(project);
                }
              }}
            >
              <div className="project-row-content">
                <button
                  className={`project-record-button ${recordCount > 0 ? "has-record" : ""}`}
                  type="button"
                  title={recordCount > 0 ? `${recordCount} 条记录` : "项目记录"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onLocalProjectRecord(project);
                  }}
                >
                  <NotebookPen size={15} />
                </button>
                <div className="project-row-name-block">
                  <span>{project.name}</span>
                  <button
                    className={`project-row-directory ${project.localDirectory ? "bound" : "unbound"}`}
                    type="button"
                    title={project.localDirectory ? "打开本地目录" : "绑定本地目录"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onLocalProjectDirectoryClick(project.id);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {directoryLabel}
                  </button>
                </div>
                <div className="project-row-badges">
                  <span>{project.linkedWorkshopProjectId ? "本地+远端" : "本地"}</span>
                  {recordCount > 0 ? <strong>{recordCount}</strong> : linkedGroup ? <strong>{linkedGroup.count}</strong> : null}
                </div>
                <ChevronRight className="project-row-arrow" size={18} />
              </div>
            </article>
          );
        })}

        {remoteProjects.map((group) => {
          const localDirectory = projectLocalDirectories[String(group.project.id)] || "";
          const recordCount = projectRecordCounts.get(group.project.id) ?? 0;
          return (
            <article
              key={`remote-${group.project.id}`}
              className={`project-menu-item tray-project-menu-item ${group.count === 0 ? "is-empty" : ""} ${
                localDirectory ? "directory-bound" : "directory-unbound"
              } ${hoveredProjectId === group.project.id ? "active" : ""}`}
              role="button"
              tabIndex={0}
              onMouseEnter={(event) => onProjectHover(group, event.currentTarget.getBoundingClientRect())}
              onFocus={(event) => onProjectHover(group, event.currentTarget.getBoundingClientRect())}
              onClick={() => onProjectRecord(group)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onProjectRecord(group);
                }
              }}
            >
              <div className="project-row-content">
                <button
                  className={`project-record-button ${recordCount > 0 ? "has-record" : ""}`}
                  type="button"
                  title={recordCount > 0 ? `${recordCount} 条记录` : "项目记录"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onProjectRecord(group);
                  }}
                >
                  <NotebookPen size={15} />
                </button>
                <div className="project-row-name-block">
                  <span>{group.projectName}</span>
                  <button
                    className={`project-row-directory ${localDirectory ? "bound" : "unbound"}`}
                    type="button"
                    title={localDirectory ? "打开绑定目录" : "绑定本地目录"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoteProjectDirectoryClick(group.project.id);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {localDirectory || "未绑定目录，点击绑定"}
                  </button>
                </div>
                <div className="project-row-badges">
                  <span>远端</span>
                  <strong>{group.count}</strong>
                </div>
                <ChevronRight className="project-row-arrow" size={18} />
              </div>
            </article>
          );
        })}
      </section>

      {codexRuns.length > 0 ? (
        <section className="codex-run-list" aria-label="Codex 运行">
          <div className="codex-run-list-title">
            <SquareTerminal size={13} />
            <span>Codex 运行</span>
          </div>
          {codexRuns.slice(0, 5).map((run) => {
            const failureSummary = run.status === "failed" ? summarizeCodexFailureForDisplay(run.lastMessage) : "";
            return (
              <div key={run.runId} className={`codex-run-row status-${run.status}`} title={run.lastMessage || run.title}>
                <span className="codex-run-dot" aria-hidden="true" />
                <span className="codex-run-title">{run.title}</span>
                <span className="codex-run-meta">
                  {run.projectName ? `${run.projectName} · ` : ""}
                  {codexRunStatusLabel(run)}
                  {failureSummary ? ` · ${failureSummary}` : ""}
                </span>
              </div>
            );
          })}
        </section>
      ) : null}

      <LocalProjectContextMenu
        menu={localProjectMenu}
        onClose={() => setLocalProjectMenu(null)}
        onLinkRemote={onLinkLocalProjectRemote}
        onRename={onRenameLocalProject}
        onUnlinkRemote={onUnlinkLocalProjectRemote}
      />
    </main>
  );
}
