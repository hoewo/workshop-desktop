import {
  ChevronDown,
  Link2Off,
  ListTodo,
  LoaderCircle,
  LogIn,
  NotebookPen,
  PanelsTopLeft,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  WifiOff,
  X
} from "lucide-react";
import type { RefObject } from "react";
import type { AppConfig, PersonalRecordMeta, TaskState } from "../../../shared/types";
import { getLocalProjectLocalDirectory, getProjectLocalDirectory } from "../../lib/appModel";
import { recordOriginLabels, recordStatusLabels, type RecordListContext } from "../../lib/records";
import { formatRelative, stateLabels, type EnrichedTask } from "../../lib/tasks";
import { ListCellCompleteButton } from "../ListCellActions";
import { WindowFocusOverlay } from "../WindowFocusOverlay";
import { WindowArrangementFeedback } from "../WindowArrangementFeedback";
import { ProjectDirectorySubtitle, WindowHeaderTitle } from "../WindowHeader";

export type ProjectTaskSourceState = "online" | "loading" | "stale" | "logged-out" | "unlinked" | "empty";

const taskSourceLabels: Record<ProjectTaskSourceState, string> = {
  online: "在线",
  loading: "加载中",
  stale: "同步异常",
  "logged-out": "未登录",
  unlinked: "未关联",
  empty: "在线"
};

function WorkspaceTaskRow({
  busyTaskId,
  isCompleting,
  onOpen,
  onUpdate,
  task
}: {
  busyTaskId: number | null;
  isCompleting: boolean;
  onOpen: (task: EnrichedTask) => void;
  onUpdate: (task: EnrichedTask, state: TaskState) => void;
  task: EnrichedTask;
}) {
  const isDone = task.state === "completed";
  const firstTag = task.resolvedTags[0];
  const hiddenTagCount = Math.max(0, task.resolvedTags.length - 1);

  return (
    <div className={`project-workspace-row task ${isCompleting ? "completing" : ""}`}>
      <ListCellCompleteButton
        done={isDone || isCompleting}
        disabled={busyTaskId === task.id || isCompleting}
        title={isCompleting ? "已完成" : isDone ? "取消完成" : "完成"}
        onClick={(event) => {
          event.stopPropagation();
          onUpdate(task, isDone ? "pending" : "completed");
        }}
      />
      <button className="project-workspace-row-main task" type="button" onClick={() => onOpen(task)}>
        <strong>{task.content}</strong>
        <span className={`project-workspace-state ${task.state}`}>{stateLabels[task.state]}</span>
        {firstTag ? (
          <span className="project-workspace-tag" title={task.resolvedTags.map((tag) => tag.name).join("、")}>
            <span>{firstTag.name}</span>
            {hiddenTagCount > 0 ? <small>+{hiddenTagCount}</small> : null}
          </span>
        ) : null}
        <time dateTime={task.updated_at}>{formatRelative(task.updated_at)}</time>
      </button>
    </div>
  );
}

function WorkspaceRecordRow({
  isCompleting,
  onComplete,
  onOpen,
  record
}: {
  isCompleting: boolean;
  onComplete: (record: PersonalRecordMeta) => void;
  onOpen: (record: PersonalRecordMeta) => void;
  record: PersonalRecordMeta;
}) {
  const isDone = record.status === "completed";
  const origin = record.origin ?? "human";

  return (
    <div className={`project-workspace-row record ${isCompleting ? "completing" : ""}`}>
      <ListCellCompleteButton
        done={isDone || isCompleting}
        disabled={isCompleting || (record.status !== "active" && record.status !== "completed")}
        title={isDone ? "取消完成" : record.status === "active" ? "完成" : recordStatusLabels[record.status]}
        onClick={(event) => {
          event.stopPropagation();
          onComplete(record);
        }}
      />
      <button className="project-workspace-row-main record" type="button" onClick={() => onOpen(record)} disabled={isCompleting}>
        <strong>{record.title}</strong>
        {isDone ? <span className="project-workspace-record-status">已完成</span> : null}
        <span className={`project-workspace-origin ${origin}`}>{recordOriginLabels[origin]}</span>
        <time dateTime={record.updatedAt}>{formatRelative(record.updatedAt)}</time>
      </button>
    </div>
  );
}

export function ProjectWorkspaceSurface({
  arrangementCompact,
  arrangementMessage,
  arrangementProtected,
  busyTaskId,
  closeWindow,
  completeRecord,
  completingRecordId,
  completingTaskIds,
  config,
  focusPulseVisible,
  handleArrangeWindows,
  handleDirectoryClick,
  handleStickyAlwaysOnTop,
  hasSearchQuery,
  isRecordSearchExpanded,
  message,
  onCreateRecord,
  onCreateTask,
  onCloseSearch,
  onExitArrangementCompact,
  onOpenSearch,
  onOpenRecord,
  onOpenSettings,
  onOpenTask,
  onReloadTasks,
  records,
  recordsCollapsed,
  recordsLoaded,
  recordSearchInputRef,
  searchQuery,
  setRecordsCollapsed,
  setSearchQuery,
  setTasksCollapsed,
  taskCreateDisabledReason,
  taskSourceState,
  taskTotalCount,
  tasks,
  tasksCollapsed,
  updateTaskState,
  recordListContext,
  windowFocusClass
}: {
  arrangementCompact: boolean;
  arrangementMessage: string;
  arrangementProtected: boolean;
  busyTaskId: number | null;
  closeWindow: () => void;
  completeRecord: (record: PersonalRecordMeta) => void;
  completingRecordId: string | null;
  completingTaskIds: Set<number>;
  config: AppConfig;
  focusPulseVisible: boolean;
  handleArrangeWindows: () => void;
  handleDirectoryClick: () => void;
  handleStickyAlwaysOnTop: (enabled: boolean) => void;
  hasSearchQuery: boolean;
  isRecordSearchExpanded: boolean;
  message: string;
  onCreateRecord: () => void;
  onCreateTask: () => void;
  onCloseSearch: () => void;
  onExitArrangementCompact: () => void;
  onOpenSearch: () => void;
  onOpenRecord: (record: PersonalRecordMeta) => void;
  onOpenSettings: () => void;
  onOpenTask: (task: EnrichedTask) => void;
  onReloadTasks: () => void;
  records: PersonalRecordMeta[];
  recordsCollapsed: boolean;
  recordsLoaded: boolean;
  recordSearchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setRecordsCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
  setSearchQuery: (query: string) => void;
  setTasksCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
  taskCreateDisabledReason?: string;
  taskSourceState: ProjectTaskSourceState;
  taskTotalCount: number;
  tasks: EnrichedTask[];
  tasksCollapsed: boolean;
  updateTaskState: (task: EnrichedTask, state: TaskState) => void;
  recordListContext: Extract<RecordListContext, { scopeType: "project" }>;
  windowFocusClass: string;
}) {
  const projectName = recordListContext.projectName || "项目";
  const sourceNotice =
    taskSourceState === "loading"
      ? taskTotalCount > 0
        ? "正在同步，暂时显示上次结果。"
        : "正在加载当前项目的待办。"
      : taskSourceState === "stale"
        ? taskTotalCount > 0
          ? "同步失败，已显示缓存待办；刷新成功前暂停新增。"
          : "同步失败，暂无可用缓存；刷新成功前暂停新增。"
        : taskSourceState === "logged-out"
          ? "登录 Workshop 账号后可同步待办；本地记录仍可使用。"
          : taskSourceState === "unlinked"
            ? "回到工作台，在项目右键菜单中关联远端任务源。"
            : "";

  return (
    <main
      className={`record-shell record-list-shell project-workspace-shell ${
        arrangementCompact || (tasksCollapsed && recordsCollapsed) ? "collapsed-shell" : ""
      } ${windowFocusClass} ${focusPulseVisible ? "window-focus-pulse" : ""}`}
    >
      <WindowFocusOverlay focusClass={windowFocusClass} />
      <WindowArrangementFeedback message={arrangementMessage} />
      <header className="record-titlebar">
        <div className="sticky-drag">
          <button
            className="sticky-arrange-button"
            type="button"
            onClick={handleArrangeWindows}
            disabled={arrangementProtected}
            title={arrangementProtected ? "完成当前编辑后再整理" : "整理当前项目窗口"}
          >
            <PanelsTopLeft size={15} />
          </button>
          <div className="record-title-copy">
            <div className="window-title-line">
              <WindowHeaderTitle title={{ variant: "scoped", context: projectName, suffix: "工作区" }} />
            </div>
            <ProjectDirectorySubtitle
              localDirectory={
                recordListContext.localProjectId
                  ? getLocalProjectLocalDirectory(config, recordListContext.localProjectId) ||
                    getProjectLocalDirectory(config, recordListContext.projectId)
                  : getProjectLocalDirectory(config, recordListContext.projectId)
              }
              onClick={handleDirectoryClick}
            />
          </div>
        </div>
        <div className="sticky-actions">
          <div className={`record-search-control ${isRecordSearchExpanded ? "expanded" : ""}`} role="search">
            <button
              className="record-search-toggle"
              type="button"
              onClick={onOpenSearch}
              title="搜索待办和记录"
              aria-label="搜索待办和记录"
            >
              <Search size={14} />
            </button>
            {isRecordSearchExpanded ? (
              <>
                <input
                  ref={recordSearchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setSearchQuery("");
                      onCloseSearch();
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder="搜索"
                  aria-label="搜索待办和记录"
                  spellCheck={false}
                />
                <button
                  className="record-search-clear"
                  type="button"
                  onClick={() => {
                    if (searchQuery) {
                      setSearchQuery("");
                      recordSearchInputRef.current?.focus();
                      return;
                    }
                    onCloseSearch();
                  }}
                  title={searchQuery ? "清空搜索" : "关闭搜索"}
                  aria-label={searchQuery ? "清空搜索" : "关闭搜索"}
                >
                  <X size={12} />
                </button>
              </>
            ) : null}
          </div>
          <button
            className={`icon-button ${config.stickyAlwaysOnTop ? "active-icon" : ""}`}
            type="button"
            onClick={() => handleStickyAlwaysOnTop(!config.stickyAlwaysOnTop)}
            title={config.stickyAlwaysOnTop ? "取消所有便签置顶" : "所有便签置顶"}
          >
            {config.stickyAlwaysOnTop ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <button className="icon-button" type="button" onClick={closeWindow} title="关闭">
            <X size={16} />
          </button>
        </div>
      </header>

      {message && !arrangementCompact ? (
        <div className="project-workspace-message" role="status">
          <span>{message}</span>
        </div>
      ) : null}

      <div className="project-workspace-scroll">
        <section
          className={`project-workspace-section ${tasksCollapsed || arrangementCompact ? "collapsed" : ""}`}
          aria-labelledby="workspace-tasks-title"
        >
          <header className="project-workspace-section-header">
            <div className="project-workspace-section-heading">
              <button
                className="project-workspace-section-toggle"
                type="button"
                onClick={() => {
                  if (arrangementCompact) {
                    onExitArrangementCompact();
                    if (tasksCollapsed) {
                      setTasksCollapsed(false);
                    }
                    return;
                  }
                  setTasksCollapsed((collapsed) => !collapsed);
                }}
                aria-expanded={!tasksCollapsed && !arrangementCompact}
              >
                <ChevronDown size={14} />
                <strong id="workspace-tasks-title">待办</strong>
                <span>{tasks.length}</span>
              </button>
              <button
                className="project-workspace-add"
                type="button"
                onClick={onCreateTask}
                disabled={Boolean(taskCreateDisabledReason)}
                title={taskCreateDisabledReason || "新建待办"}
                aria-label={taskCreateDisabledReason || "新建待办"}
              >
                <Plus size={14} />
              </button>
            </div>
            <span className={`project-workspace-source ${taskSourceState}`}>{taskSourceLabels[taskSourceState]}</span>
          </header>

          {!tasksCollapsed && !arrangementCompact ? (
            <div className="project-workspace-section-body">
              {sourceNotice ? (
                <div className={`project-workspace-source-notice ${taskSourceState}`}>
                  {taskSourceState === "loading" ? <LoaderCircle className="spin" size={14} /> : null}
                  {taskSourceState === "stale" ? <WifiOff size={14} /> : null}
                  {taskSourceState === "logged-out" ? <LogIn size={14} /> : null}
                  {taskSourceState === "unlinked" ? <Link2Off size={14} /> : null}
                  <span>{sourceNotice}</span>
                  {taskSourceState === "stale" ? (
                    <button type="button" onClick={onReloadTasks} title="重新同步">
                      <RefreshCw size={13} />
                      重试
                    </button>
                  ) : null}
                  {taskSourceState === "logged-out" ? (
                    <button type="button" onClick={onOpenSettings}>
                      前往设置
                    </button>
                  ) : null}
                </div>
              ) : null}
              {tasks.length === 0 && taskSourceState !== "loading" ? (
                <div className="project-workspace-empty">
                  <ListTodo size={18} />
                  <span>{hasSearchQuery ? "没有匹配待办" : taskSourceState === "empty" ? "还没有待办" : "暂无待办"}</span>
                </div>
              ) : null}
              {tasks.map((task) => (
                <WorkspaceTaskRow
                  key={task.id}
                  busyTaskId={busyTaskId}
                  isCompleting={completingTaskIds.has(task.id)}
                  onOpen={onOpenTask}
                  onUpdate={updateTaskState}
                  task={task}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section
          className={`project-workspace-section ${recordsCollapsed || arrangementCompact ? "collapsed" : ""}`}
          aria-labelledby="workspace-records-title"
        >
          <header className="project-workspace-section-header">
            <div className="project-workspace-section-heading">
              <button
                className="project-workspace-section-toggle"
                type="button"
                onClick={() => {
                  if (arrangementCompact) {
                    onExitArrangementCompact();
                    if (recordsCollapsed) {
                      setRecordsCollapsed(false);
                    }
                    return;
                  }
                  setRecordsCollapsed((collapsed) => !collapsed);
                }}
                aria-expanded={!recordsCollapsed && !arrangementCompact}
              >
                <ChevronDown size={14} />
                <strong id="workspace-records-title">记录</strong>
                <span>{records.length}</span>
              </button>
              <button className="project-workspace-add" type="button" onClick={onCreateRecord} title="新建记录" aria-label="新建记录">
                <Plus size={14} />
              </button>
            </div>
          </header>

          {!recordsCollapsed && !arrangementCompact ? (
            <div className="project-workspace-section-body">
              {!recordsLoaded ? (
                <div className="project-workspace-empty">
                  <LoaderCircle className="spin" size={16} />
                  <span>正在读取记录</span>
                </div>
              ) : records.length === 0 ? (
                <div className="project-workspace-empty">
                  <NotebookPen size={18} />
                  <span>{hasSearchQuery ? "没有匹配记录" : "还没有记录"}</span>
                </div>
              ) : null}
              {records.map((record) => (
                <WorkspaceRecordRow
                  key={record.id}
                  isCompleting={completingRecordId === record.id}
                  onComplete={completeRecord}
                  onOpen={onOpenRecord}
                  record={record}
                />
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
