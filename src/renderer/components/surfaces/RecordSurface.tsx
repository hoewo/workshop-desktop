import {
  Archive,
  BookOpenText,
  Check,
  Eye,
  Folder,
  GripVertical,
  Link,
  Maximize2,
  Minimize2,
  NotebookPen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  SquareTerminal,
  Trash2,
  X
} from "lucide-react";
import type { RefObject } from "react";
import type { AppConfig, PersonalRecord, PersonalRecordMeta, Project } from "../../../shared/types";
import { getLocalProjectLocalDirectory, getProjectLocalDirectory } from "../../lib/appModel";
import {
  getRecordHeaderTitle,
  getRecordListEmptyLabel,
  recordStatusLabels,
  type RecordListContext,
  type RecordMode,
  type RecordSaveStatus
} from "../../lib/records";
import { ListCellArchiveButton, ListCellCompleteButton } from "../ListCellActions";
import { MarkdownPreview } from "../MarkdownPreview";
import { WindowFocusOverlay } from "../WindowFocusOverlay";
import { ProjectDirectorySubtitle, WindowHeaderTitle } from "../WindowHeader";

export function RecordSurface({
  activeRecord,
  archiveActiveRecord,
  archiveRecord,
  assignRecordToProject,
  closeRecordWindow,
  completeActiveRecord,
  completeRecord,
  config,
  createTaskFromRecord,
  deleteActiveRecord,
  focusPulseVisible,
  handleArrangeStickyWindows,
  handleNewRecord,
  handleLocalProjectDirectoryClick,
  handleProjectDirectoryClick,
  handleStickyAlwaysOnTop,
  hasRecordSearchQuery,
  isActiveRecordCompleting,
  isRecordSearchExpanded,
  onRecordBodyChange,
  recordBody,
  recordCompletingId,
  recordEditorRef,
  recordListCollapsed,
  recordListContext,
  recordMessage,
  recordMode,
  recordProjectCandidates,
  recordProjectQuery,
  recordSaveStatus,
  recordScopePickerOpen,
  recordSearchInputRef,
  recordSearchQuery,
  saveRecordNow,
  sendActiveRecordToCodex,
  setRecordListCollapsed,
  setRecordMode,
  setRecordProjectQuery,
  setRecordScopePickerOpen,
  setRecordSearchOpen,
  setRecordSearchQuery,
  visibleRecords,
  windowFocusClass
}: {
  activeRecord: PersonalRecord | null;
  archiveActiveRecord: () => void;
  archiveRecord: (record: PersonalRecordMeta) => void;
  assignRecordToProject: (project: Project, projectName: string) => void;
  closeRecordWindow: () => void;
  completeActiveRecord: () => void;
  completeRecord: (record: PersonalRecordMeta) => void;
  config: AppConfig;
  createTaskFromRecord: () => void;
  deleteActiveRecord: () => void;
  focusPulseVisible: boolean;
  handleArrangeStickyWindows: () => void;
  handleNewRecord: () => void;
  handleLocalProjectDirectoryClick: (localProjectId: string) => void;
  handleProjectDirectoryClick: (projectId: number, source: "record") => void;
  handleStickyAlwaysOnTop: (enabled: boolean) => void;
  hasRecordSearchQuery: boolean;
  isActiveRecordCompleting: boolean;
  isRecordSearchExpanded: boolean;
  onRecordBodyChange: (body: string) => void;
  recordBody: string;
  recordCompletingId: string | null;
  recordEditorRef: RefObject<HTMLTextAreaElement | null>;
  recordListCollapsed: boolean;
  recordListContext: RecordListContext;
  recordMessage: string;
  recordMode: RecordMode;
  recordProjectCandidates: Array<{ project: Project; projectName: string }>;
  recordProjectQuery: string;
  recordSaveStatus: RecordSaveStatus;
  recordScopePickerOpen: boolean;
  recordSearchInputRef: RefObject<HTMLInputElement | null>;
  recordSearchQuery: string;
  saveRecordNow: () => void;
  sendActiveRecordToCodex: () => void;
  setRecordListCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
  setRecordMode: (mode: RecordMode) => void;
  setRecordProjectQuery: (query: string) => void;
  setRecordScopePickerOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  setRecordSearchOpen: (open: boolean) => void;
  setRecordSearchQuery: (query: string) => void;
  visibleRecords: PersonalRecordMeta[];
  windowFocusClass: string;
}) {
  const recordHeaderContext =
    activeRecord ||
    (recordListContext.scopeType === "project"
      ? {
          scopeType: "project" as const,
          projectName: recordListContext.projectName
        }
      : { scopeType: "none" as const });
  const recordHeaderTitle = getRecordHeaderTitle(recordHeaderContext, Boolean(activeRecord), visibleRecords.length);
  const saveLabel =
    recordSaveStatus === "saving"
      ? "保存中"
      : recordSaveStatus === "error"
        ? "保存失败"
        : activeRecord?.id
          ? "已保存"
          : "本地草稿";
  const isTaskNote = activeRecord?.scopeType === "task";
  const isCompletedRecord = activeRecord?.status === "completed";
  const canAssignRecordToProject = activeRecord?.scopeType === "none";
  const canPromoteToTask = activeRecord?.scopeType === "project" && Boolean(activeRecord.projectId);

  return (
    <main
      className={`record-shell ${activeRecord ? "record-detail-shell" : "record-list-shell"} ${
        !activeRecord && recordListCollapsed ? "collapsed-shell" : ""
      } ${windowFocusClass} ${focusPulseVisible ? "window-focus-pulse" : ""}`}
    >
      <WindowFocusOverlay focusClass={windowFocusClass} />
      <header className="record-titlebar">
        <div className="sticky-drag">
          <button className="sticky-arrange-button" type="button" onClick={handleArrangeStickyWindows} title="整理便签排列">
            <GripVertical size={15} />
          </button>
          <div className="record-title-copy">
            <div className="window-title-line">
              <WindowHeaderTitle title={recordHeaderTitle} />
              {canAssignRecordToProject ? (
                <button
                  className="scope-switch-button"
                  type="button"
                  onClick={() => setRecordScopePickerOpen((open) => !open)}
                  title="分配到项目"
                >
                  <Folder size={14} strokeWidth={2.8} />
                </button>
              ) : null}
            </div>
            {!activeRecord && recordListContext.scopeType === "project" && recordListContext.projectId !== undefined ? (
              <ProjectDirectorySubtitle
                localDirectory={getProjectLocalDirectory(config, recordListContext.projectId)}
                onClick={() => handleProjectDirectoryClick(recordListContext.projectId as number, "record")}
              />
            ) : null}
            {!activeRecord &&
            recordListContext.scopeType === "project" &&
            recordListContext.localProjectId &&
            recordListContext.projectId === undefined ? (
              <ProjectDirectorySubtitle
                localDirectory={getLocalProjectLocalDirectory(config, recordListContext.localProjectId)}
                onClick={() => handleLocalProjectDirectoryClick(recordListContext.localProjectId as string)}
              />
            ) : null}
            {canAssignRecordToProject && recordScopePickerOpen ? (
              <div className="scope-popover">
                <input
                  value={recordProjectQuery}
                  onChange={(event) => setRecordProjectQuery(event.target.value)}
                  placeholder="项目"
                  autoFocus
                />
                {recordProjectCandidates.map(({ project, projectName }) => (
                  <button
                    className="scope-option"
                    type="button"
                    key={project.id}
                    onClick={() => assignRecordToProject(project, projectName)}
                  >
                    <span className="record-scope project">项目</span>
                    <strong>{projectName}</strong>
                  </button>
                ))}
                {recordProjectCandidates.length === 0 ? <div className="scope-empty">没有项目</div> : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="sticky-actions">
          {!activeRecord ? (
            <div className={`record-search-control ${isRecordSearchExpanded ? "expanded" : ""}`} role="search">
              <button
                className="record-search-toggle"
                type="button"
                onClick={() => {
                  setRecordListCollapsed(false);
                  setRecordSearchOpen(true);
                }}
                title="搜索记录"
                aria-label="搜索记录"
              >
                <Search size={14} />
              </button>
              {isRecordSearchExpanded ? (
                <>
                  <input
                    ref={recordSearchInputRef}
                    value={recordSearchQuery}
                    onChange={(event) => setRecordSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setRecordSearchQuery("");
                        setRecordSearchOpen(false);
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="搜索"
                    aria-label="搜索记录"
                    spellCheck={false}
                  />
                  <button
                    className="record-search-clear"
                    type="button"
                    onClick={() => {
                      if (recordSearchQuery) {
                        setRecordSearchQuery("");
                        recordSearchInputRef.current?.focus();
                        return;
                      }
                      setRecordSearchOpen(false);
                    }}
                    title={recordSearchQuery ? "清空搜索" : "关闭搜索"}
                    aria-label={recordSearchQuery ? "清空搜索" : "关闭搜索"}
                  >
                    <X size={12} />
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          {!activeRecord ? (
            <button
              className="icon-button"
              type="button"
              onClick={() => setRecordListCollapsed((collapsed) => !collapsed)}
              title={recordListCollapsed ? "展开" : "折叠"}
            >
              {recordListCollapsed ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
            </button>
          ) : null}
          {!isTaskNote ? (
            <button className="icon-button" type="button" onClick={handleNewRecord} title="新建">
              <Plus size={15} />
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
          <button className="icon-button" type="button" onClick={closeRecordWindow} title="关闭">
            <X size={16} />
          </button>
        </div>
      </header>

      {!activeRecord && recordMessage ? (
        <div className="record-message">
          <Link size={14} />
          <span>{recordMessage}</span>
        </div>
      ) : null}

      {activeRecord ? (
        <>
          {recordMessage ? (
            <div className="record-message">
              <Link size={14} />
              <span>{recordMessage}</span>
            </div>
          ) : null}

          {recordMode === "edit" ? (
            <textarea
              ref={recordEditorRef}
              className="record-editor"
              value={recordBody}
              onChange={(event) => onRecordBodyChange(event.target.value)}
              onBlur={saveRecordNow}
              placeholder="记一下..."
              spellCheck={false}
            />
          ) : (
            <section className="record-preview-panel">
              {recordBody.trim() ? (
                <MarkdownPreview value={recordBody} />
              ) : (
                <div className="empty-state sticky-empty">
                  <BookOpenText size={24} />
                  <span>还没有内容</span>
                </div>
              )}
            </section>
          )}

          <div className="record-toolbar">
            <div className="record-mode-switch" aria-label="编辑或预览">
              <button type="button" className={recordMode === "edit" ? "active" : ""} onClick={() => setRecordMode("edit")} title="编辑">
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className={recordMode === "preview" ? "active" : ""}
                onClick={() => setRecordMode("preview")}
                title="预览"
              >
                <Eye size={15} />
              </button>
            </div>
            <span className={`record-save-state ${recordSaveStatus}`}>{saveLabel}</span>
            <div className="record-toolbar-actions">
              <button
                className="record-action-button"
                type="button"
                onClick={sendActiveRecordToCodex}
                disabled={!activeRecord?.projectId}
                title={activeRecord?.projectId ? "发送到 Codex" : "需要先关联项目"}
              >
                <SquareTerminal size={15} />
              </button>
              <button
                className={`record-action-button complete ${isActiveRecordCompleting || isCompletedRecord ? "active" : ""}`}
                type="button"
                onClick={completeActiveRecord}
                disabled={isActiveRecordCompleting}
                title={isCompletedRecord ? "取消完成" : "完成"}
              >
                <Check size={16} strokeWidth={3} />
              </button>
              <button className="record-action-button" type="button" onClick={archiveActiveRecord} title="归档">
                <Archive size={15} />
              </button>
              {canPromoteToTask ? (
                <button className="record-action-button" type="button" onClick={createTaskFromRecord} title="转为任务">
                  <Send size={15} />
                </button>
              ) : null}
              <button className="record-action-button danger" type="button" onClick={deleteActiveRecord} title="删除">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </>
      ) : !recordListCollapsed ? (
        <section className="record-list" aria-label="记录列表">
          {visibleRecords.length === 0 ? (
            <div className="empty-state sticky-empty">
              <NotebookPen size={24} />
              <span>{getRecordListEmptyLabel(recordListContext, hasRecordSearchQuery)}</span>
            </div>
          ) : null}
          {visibleRecords.map((record) => (
            <div className={`record-list-row ${recordCompletingId === record.id ? "completing" : ""}`} key={record.id}>
              <ListCellCompleteButton
                done={record.status === "completed" || recordCompletingId === record.id}
                onClick={() => completeRecord(record)}
                disabled={recordCompletingId === record.id || (record.status !== "active" && record.status !== "completed")}
                title={record.status === "completed" ? "取消完成" : record.status === "active" ? "完成" : recordStatusLabels[record.status]}
              />
              <button
                className="record-list-main"
                type="button"
                disabled={recordCompletingId === record.id}
                onClick={() =>
                  void window.workshopDesktop.openPersonalRecord({
                    noteId: record.id
                  })
                }
              >
                <strong>{record.title}</strong>
                {record.status !== "active" && record.status !== "completed" ? (
                  <span className="record-status-pill">{recordStatusLabels[record.status]}</span>
                ) : null}
              </button>
              <ListCellArchiveButton onClick={() => archiveRecord(record)} />
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
