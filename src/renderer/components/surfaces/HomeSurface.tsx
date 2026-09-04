import {
  CircleHelp,
  Download,
  ListTodo,
  LoaderCircle,
  NotebookPen,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  SquareTerminal,
  StickyNote,
  WifiOff
} from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { AppUpdateStatus, CodexRunMeta, LocalProject } from "../../../shared/types";
import { summarizeCodexFailureForDisplay } from "../../../shared/codexErrors";
import {
  codexRunStatusLabels,
  formatRelative,
  stateLabels,
  type EnrichedTask,
  type ProjectTodoGroup
} from "../../lib/tasks";
import { LocalProjectContextMenu, type LocalProjectContextMenuState } from "../LocalProjectContextMenu";
import { TaskTagChips } from "../TaskViews";
import { WorkshopMark } from "../WorkshopMark";

function handleKeyboardAction(event: KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  action();
}

export function HomeSurface({
  codexRuns,
  error,
  hasManualUpdate,
  isLoading,
  isCreatingLocalProject,
  isRemoteConnected,
  localProjects,
  localProjectRecordCounts,
  projectRecordCounts,
  projectLocalDirectories,
  projectTodoGroups,
  recentTasks,
  taskMessage,
  updateStatus,
  loadData,
  hideProjectTaskPreview,
  onOpenManual,
  onOpenCreateLocalProject,
  onOpenCreateTask,
  onOpenPersonalRecords,
  onOpenSettings,
  onOpenSticky,
  onLocalProjectDirectoryClick,
  onLocalProjectWorkspace,
  onLinkLocalProjectRemote,
  onRenameLocalProject,
  onUnlinkLocalProjectRemote,
  onProjectHover,
  onProjectWorkspace,
  onRemoteProjectDirectoryClick,
  onTaskOpen
}: {
  codexRuns: CodexRunMeta[];
  error: string;
  hasManualUpdate: boolean;
  isLoading: boolean;
  isCreatingLocalProject: boolean;
  isRemoteConnected: boolean;
  localProjects: LocalProject[];
  localProjectRecordCounts: Map<string, number>;
  projectRecordCounts: Map<number, number>;
  projectLocalDirectories: Record<string, string>;
  projectTodoGroups: ProjectTodoGroup[];
  recentTasks: EnrichedTask[];
  taskMessage: string;
  updateStatus: AppUpdateStatus | null;
  loadData: () => void;
  hideProjectTaskPreview: () => void;
  onOpenManual: () => void;
  onOpenCreateLocalProject: () => void;
  onOpenCreateTask: () => void;
  onOpenPersonalRecords: () => void;
  onOpenSettings: () => void;
  onOpenSticky: () => void;
  onLocalProjectDirectoryClick: (localProjectId: string) => void;
  onLocalProjectWorkspace: (project: LocalProject) => void;
  onLinkLocalProjectRemote: (project: LocalProject) => void;
  onRenameLocalProject: (project: LocalProject) => void;
  onUnlinkLocalProjectRemote: (project: LocalProject) => void;
  onProjectHover: (group: ProjectTodoGroup, anchor: DOMRect) => void;
  onProjectWorkspace: (group: ProjectTodoGroup) => void;
  onRemoteProjectDirectoryClick: (projectId: number) => void;
  onTaskOpen: (task: EnrichedTask) => void;
}) {
  const [localProjectMenu, setLocalProjectMenu] = useState<LocalProjectContextMenuState | null>(null);
  const totalTasks = projectTodoGroups.reduce((sum, group) => sum + group.count, 0);
  const activeProjects = localProjects.length;
  const totalProjectRecords = [...projectRecordCounts.values()].reduce((sum, count) => sum + count, 0);
  const runningCodexRuns = codexRuns.filter((run) => run.status === "running").length;
  const linkedWorkshopProjectIds = new Set(
    localProjects.map((project) => project.linkedWorkshopProjectId).filter((projectId): projectId is number => Boolean(projectId))
  );
  const remoteGroupsByProjectId = new Map(projectTodoGroups.map((group) => [group.project.id, group]));
  const topLocalProjects = localProjects.slice(0, 8);
  const topRemoteProjects = projectTodoGroups.filter((group) => !linkedWorkshopProjectIds.has(group.project.id)).slice(0, 8);
  const topRuns = codexRuns.slice(0, 6);
  const hasProjects = topLocalProjects.length > 0 || topRemoteProjects.length > 0;

  return (
    <main className="app-shell home-shell" onMouseLeave={hideProjectTaskPreview}>
      <header className="home-topbar">
        <div className="home-title">
          <WorkshopMark />
          <div>
            <h1>工作台</h1>
            <span>{isLoading ? "同步中" : "Workshop Desktop"}</span>
          </div>
        </div>
        <div className="home-actions">
          <button className="icon-button" type="button" onClick={loadData} title="刷新">
            <RefreshCw size={17} className={isLoading ? "spin" : undefined} />
          </button>
          <button className={`icon-button ${hasManualUpdate ? "has-update-dot" : ""}`} type="button" onClick={onOpenManual} title="使用手册">
            <CircleHelp size={17} />
          </button>
          <button className="icon-button" type="button" onClick={onOpenSettings} title="设置">
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

      {!error && taskMessage ? (
        <div className="notice success" role="status">
          <ShieldCheck size={16} />
          <span>{taskMessage}</span>
        </div>
      ) : null}

      {updateStatus?.phase === "downloaded" ? (
        <div className="notice success" role="status">
          <Download size={16} />
          <span>新版本已下载，重启后生效</span>
        </div>
      ) : null}

      <section className="home-metrics" aria-label="工作台概览">
        <div>
          <strong>{activeProjects}</strong>
          <span>本地项目</span>
        </div>
        <div>
          <strong>{totalTasks}</strong>
          <span>待处理任务</span>
        </div>
        <div>
          <strong>{totalProjectRecords}</strong>
          <span>记录</span>
        </div>
        <div>
          <strong>{runningCodexRuns}</strong>
          <span>Codex 运行中</span>
        </div>
      </section>

      <div className="home-layout">
        <section className="home-panel home-projects" aria-label="项目">
          <div className="home-panel-head">
            <div>
              <span className="eyebrow">Projects</span>
              <h2>项目</h2>
            </div>
            <button
              type="button"
              className="secondary-button compact-command"
              onClick={onOpenCreateLocalProject}
              disabled={isCreatingLocalProject}
            >
              <Plus size={15} />
              <span>{isCreatingLocalProject ? "选择中" : "添加项目"}</span>
            </button>
          </div>

          <div className="home-project-list">
            {isLoading && !hasProjects ? (
              <div className="empty-state">
                <LoaderCircle className="spin" size={22} />
                <span>同步中</span>
              </div>
            ) : null}

            {!isLoading && !hasProjects ? (
              <div className="empty-state">
                <ShieldCheck size={24} />
                <span>先添加一个本地项目</span>
              </div>
            ) : null}

            {topLocalProjects.map((project) => {
              const directoryLabel = project.localDirectory || "未绑定目录，点击绑定";
              const linkedGroup = project.linkedWorkshopProjectId ? remoteGroupsByProjectId.get(project.linkedWorkshopProjectId) : undefined;
              const recordCount = localProjectRecordCounts.get(project.id) ?? 0;
              const openLocalProject = () => {
                setLocalProjectMenu(null);
                onLocalProjectWorkspace(project);
              };
              return (
                <article
                  key={project.id}
                  className={`project-menu-item home-project-menu-item ${project.localDirectory ? "directory-bound" : "directory-unbound"}`}
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
                  onClick={openLocalProject}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setLocalProjectMenu({ project, x: event.clientX, y: event.clientY });
                  }}
                  onKeyDown={(event) => handleKeyboardAction(event, openLocalProject)}
                >
                  <div className="project-row-content">
                    <button
                      className={`project-workspace-button ${recordCount > 0 ? "has-record" : ""}`}
                      type="button"
                      title={recordCount > 0 ? `打开项目工作区（${recordCount} 条记录）` : "打开项目工作区"}
                      onClick={(event) => {
                        event.stopPropagation();
                        openLocalProject();
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
                    <span className="project-row-arrow" aria-hidden="true">
                      ›
                    </span>
                  </div>
                </article>
              );
            })}

            {topRemoteProjects.map((group) => {
              const localDirectory = projectLocalDirectories[String(group.project.id)] || "";
              const directoryLabel = localDirectory || "未绑定目录，点击绑定";
              const recordCount = projectRecordCounts.get(group.project.id) ?? 0;
              return (
                <article
                  key={`remote-${group.project.id}`}
                  className={`project-menu-item home-project-menu-item ${group.count === 0 ? "is-empty" : ""} ${
                    localDirectory ? "directory-bound" : "directory-unbound"
                  }`}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={(event) => onProjectHover(group, event.currentTarget.getBoundingClientRect())}
                  onFocus={(event) => onProjectHover(group, event.currentTarget.getBoundingClientRect())}
                  onClick={() => onProjectWorkspace(group)}
                  onKeyDown={(event) => handleKeyboardAction(event, () => onProjectWorkspace(group))}
                >
                  <div className="project-row-content">
                    <button
                      className={`project-workspace-button ${recordCount > 0 ? "has-record" : ""}`}
                      type="button"
                      title={recordCount > 0 ? `打开项目工作区（${recordCount} 条记录）` : "打开项目工作区"}
                      onClick={(event) => {
                        event.stopPropagation();
                        onProjectWorkspace(group);
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
                        {directoryLabel}
                      </button>
                    </div>
                    <div className="project-row-badges">
                      <span>远端</span>
                      <strong>{group.count}</strong>
                    </div>
                    <span className="project-row-arrow" aria-hidden="true">
                      ›
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="home-panel home-tasks" aria-label="近期任务">
          <div className="home-panel-head">
            <div>
              <span className="eyebrow">Tasks</span>
              <h2>任务列表</h2>
            </div>
            <div className="home-panel-head-actions">
              <button type="button" className="secondary-button compact-command" onClick={onOpenSticky}>
                <ListTodo size={15} />
                <span>查看全部</span>
              </button>
              <button
                type="button"
                className="secondary-button compact-command"
                onClick={onOpenCreateTask}
                disabled={!isRemoteConnected || projectTodoGroups.length === 0}
              >
                <Plus size={15} />
                <span>创建待办</span>
              </button>
            </div>
          </div>

          <div className="home-task-list">
            {recentTasks.slice(0, 8).map((task) => (
              <article
                key={task.id}
                className="home-task-row"
                role="button"
                tabIndex={0}
                onClick={() => onTaskOpen(task)}
                onKeyDown={(event) => handleKeyboardAction(event, () => onTaskOpen(task))}
              >
                <div className="home-task-content">
                  <strong>{task.content}</strong>
                  <span>
                    {task.projectName} · {stateLabels[task.state]} · {formatRelative(task.updated_at)}
                  </span>
                  <TaskTagChips tags={task.resolvedTags} compact maxVisible={2} />
                </div>
              </article>
            ))}

            {!isLoading && recentTasks.length === 0 ? (
              <div className="empty-state">
                <ShieldCheck size={24} />
                <span>没有当前任务</span>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="home-side" aria-label="快捷入口">
          <section className={`home-panel home-account ${isRemoteConnected ? "connected" : "disconnected"}`}>
            <div className="home-account-copy">
              <span>远端任务源</span>
              <strong>{isRemoteConnected ? "可同步" : "未登录"}</strong>
              <small>{isRemoteConnected ? "使用刷新同步任务" : "在设置中登录账号"}</small>
            </div>
          </section>

          <section className="home-panel home-quick-actions">
            <button type="button" onClick={onOpenPersonalRecords}>
              <NotebookPen size={17} />
              <span>个人记录</span>
            </button>
            <button type="button" onClick={onOpenSticky}>
              <StickyNote size={17} />
              <span>任务列表</span>
            </button>
          </section>

          <section className="home-panel home-runs" aria-label="Codex 运行">
            <div className="home-panel-head">
              <div>
                <span className="eyebrow">Codex</span>
                <h2>运行</h2>
              </div>
              <SquareTerminal size={17} />
            </div>

            <div className="home-run-list">
              {topRuns.map((run) => {
                const failureSummary = run.status === "failed" ? summarizeCodexFailureForDisplay(run.lastMessage) : "";
                return (
                  <div key={run.runId} className={`codex-run-row status-${run.status}`} title={run.lastMessage || run.title}>
                    <span className="codex-run-dot" aria-hidden="true" />
                    <span className="codex-run-title">{run.title}</span>
                    <span className="codex-run-meta">
                      {codexRunStatusLabels[run.status]}
                      {failureSummary ? ` · ${failureSummary}` : ""}
                    </span>
                  </div>
                );
              })}

              {topRuns.length === 0 ? (
                <div className="home-empty-inline">
                  <span>暂无运行</span>
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

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
