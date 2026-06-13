import { GripVertical, Info, LoaderCircle, LogIn, Maximize2, Minimize2, NotebookPen, Pin, PinOff, ShieldCheck, WifiOff, X } from "lucide-react";
import type { AppConfig, TaskState } from "../../../shared/types";
import { getProjectLocalDirectory } from "../../lib/appModel";
import type { HeaderTitleContent } from "../../lib/records";
import type { EnrichedTask } from "../../lib/tasks";
import { WindowFocusOverlay } from "../WindowFocusOverlay";
import { ProjectDirectorySubtitle, WindowHeaderTitle } from "../WindowHeader";
import { TaskDetail, TaskRow } from "../TaskViews";

export function StickyLoginRequiredSurface({
  closeStickyWindow,
  focusPulseVisible,
  handleArrangeStickyWindows,
  isSingleTaskSticky,
  windowFocusClass
}: {
  closeStickyWindow: () => void;
  focusPulseVisible: boolean;
  handleArrangeStickyWindows: () => void;
  isSingleTaskSticky: boolean;
  windowFocusClass: string;
}) {
  return (
    <main
      className={`sticky-shell ${isSingleTaskSticky ? "single-task-shell" : "sticky-list-shell"} ${windowFocusClass} ${
        focusPulseVisible ? "window-focus-pulse" : ""
      }`}
    >
      <WindowFocusOverlay focusClass={windowFocusClass} />
      <header className="sticky-titlebar">
        <div className="sticky-drag">
          <button className="sticky-arrange-button" type="button" onClick={handleArrangeStickyWindows} title="整理便签排列">
            <GripVertical size={15} />
          </button>
          <h1>待办便签</h1>
        </div>
        <button className="icon-button" type="button" onClick={closeStickyWindow} title="关闭">
          <X size={16} />
        </button>
      </header>
      <div className="empty-state sticky-empty">
        <LogIn size={24} />
        <span>需要先登录</span>
      </div>
    </main>
  );
}

export function StickySurface({
  busyTaskId,
  canExtractTasks,
  closeStickyWindow,
  completingTaskIds,
  config,
  error,
  extractTaskToSticky,
  filteredTasks,
  focusPulseVisible,
  handleArrangeStickyWindows,
  handleProjectDirectoryClick,
  handleStickyAlwaysOnTop,
  isLoading,
  isSingleTaskSticky,
  isStickyContentCollapsed,
  onOpenProjectRecord,
  onTaskArchive,
  openTaskDetail,
  saveTaskNoteNow,
  selectedProjectName,
  selectedTask,
  setStickyListCollapsed,
  stickyHeader,
  stickyListCollapsed,
  stickyProjectId,
  taskMessage,
  taskNoteBody,
  updateTaskNoteBody,
  updateTaskState,
  sendTaskToCodex,
  windowFocusClass
}: {
  busyTaskId: number | null;
  canExtractTasks: boolean;
  closeStickyWindow: () => void;
  completingTaskIds: Set<number>;
  config: AppConfig;
  error: string;
  extractTaskToSticky: (task: EnrichedTask, position: { x: number; y: number }) => void;
  filteredTasks: EnrichedTask[];
  focusPulseVisible: boolean;
  handleArrangeStickyWindows: () => void;
  handleProjectDirectoryClick: (projectId: number, source: "sticky") => void;
  handleStickyAlwaysOnTop: (enabled: boolean) => void;
  isLoading: boolean;
  isSingleTaskSticky: boolean;
  isStickyContentCollapsed: boolean;
  onOpenProjectRecord: () => void;
  onTaskArchive: (task: EnrichedTask) => void;
  openTaskDetail: (task: EnrichedTask) => void;
  saveTaskNoteNow: () => void;
  selectedProjectName: string;
  selectedTask: EnrichedTask | null;
  setStickyListCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
  stickyHeader: HeaderTitleContent;
  stickyListCollapsed: boolean;
  stickyProjectId?: number;
  taskMessage: string;
  taskNoteBody: string;
  updateTaskNoteBody: (body: string) => void;
  updateTaskState: (task: EnrichedTask, state: TaskState) => void;
  sendTaskToCodex: (task: EnrichedTask) => void;
  windowFocusClass: string;
}) {
  return (
    <main
      className={`sticky-shell ${isSingleTaskSticky ? "single-task-shell" : "sticky-list-shell"} ${
        isStickyContentCollapsed ? "collapsed-shell" : ""
      } ${windowFocusClass} ${focusPulseVisible ? "window-focus-pulse" : ""}`}
    >
      <WindowFocusOverlay focusClass={windowFocusClass} />
      <header className="sticky-titlebar">
        <div className="sticky-drag">
          <button className="sticky-arrange-button" type="button" onClick={handleArrangeStickyWindows} title="整理便签排列">
            <GripVertical size={15} />
          </button>
          <div className="sticky-title-copy">
            <div className="window-title-line">
              <WindowHeaderTitle title={stickyHeader} />
            </div>
            {stickyProjectId !== undefined && Number.isFinite(stickyProjectId) ? (
              <ProjectDirectorySubtitle
                localDirectory={getProjectLocalDirectory(config, stickyProjectId)}
                onClick={() => handleProjectDirectoryClick(stickyProjectId, "sticky")}
              />
            ) : null}
          </div>
        </div>
        <div className="sticky-actions">
          {!isSingleTaskSticky && selectedProjectName ? (
            <button className="icon-button" type="button" onClick={onOpenProjectRecord} title="记项目">
              <NotebookPen size={15} />
            </button>
          ) : null}
          {!isSingleTaskSticky ? (
            <button
              className="icon-button"
              type="button"
              onClick={() => setStickyListCollapsed((collapsed) => !collapsed)}
              title={stickyListCollapsed ? "展开" : "折叠"}
            >
              {stickyListCollapsed ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
            </button>
          ) : null}
          <button
            className={`icon-button ${config.stickyAlwaysOnTop ? "active-icon" : ""}`}
            type="button"
            onClick={() => handleStickyAlwaysOnTop(!config.stickyAlwaysOnTop)}
            title={config.stickyAlwaysOnTop ? "取消置顶" : "置顶"}
          >
            {config.stickyAlwaysOnTop ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <button className="icon-button" type="button" onClick={closeStickyWindow} title="关闭">
            <X size={16} />
          </button>
        </div>
      </header>

      {taskMessage && !isStickyContentCollapsed ? (
        <div className="notice sticky-notice success" role="status">
          <Info size={16} />
          <span>{taskMessage}</span>
        </div>
      ) : null}

      {error && !isStickyContentCollapsed ? (
        <div className="notice sticky-notice" role="alert">
          <WifiOff size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {!isStickyContentCollapsed ? (
        <section className="sticky-task-list">
          {isSingleTaskSticky ? (
            selectedTask ? (
              <TaskDetail
                task={selectedTask}
                busyTaskId={busyTaskId}
                noteBody={taskNoteBody}
                onNoteBlur={saveTaskNoteNow}
                onNoteChange={updateTaskNoteBody}
                onArchive={onTaskArchive}
                onSendToCodex={sendTaskToCodex}
                onUpdate={updateTaskState}
              />
            ) : (
              <div className="empty-state sticky-empty">
                {isLoading ? <LoaderCircle className="spin" size={22} /> : <ShieldCheck size={24} />}
                <span>{isLoading ? "同步中" : "当前没有待处理项"}</span>
              </div>
            )
          ) : (
            <>
              {isLoading && filteredTasks.length === 0 ? (
                <div className="empty-state sticky-empty">
                  <LoaderCircle className="spin" size={22} />
                  <span>同步中</span>
                </div>
              ) : null}

              {!isLoading && filteredTasks.length === 0 ? (
                <div className="empty-state sticky-empty">
                  <ShieldCheck size={24} />
                  <span>当前没有待处理项</span>
                </div>
              ) : null}

              {filteredTasks.slice(0, 12).map((task) => (
                <TaskRow
                  compact
                  key={`${task.project_id}-${task.id}`}
                  task={task}
                  busyTaskId={busyTaskId}
                  isCompleting={completingTaskIds.has(task.id)}
                  onExtract={canExtractTasks ? extractTaskToSticky : undefined}
                  onArchive={onTaskArchive}
                  onOpen={openTaskDetail}
                  onUpdate={updateTaskState}
                />
              ))}
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
