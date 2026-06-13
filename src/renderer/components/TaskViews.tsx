import { Archive, Check, ChevronRight, PauseCircle, Play, RotateCcw, SquareTerminal } from "lucide-react";
import { useRef } from "react";
import type { DragEvent, MouseEvent } from "react";
import type { TaskState } from "../../shared/types";
import { formatRelative, splitTags, stateLabels, stateTone, type EnrichedTask, type ProjectTodoGroup } from "../lib/tasks";
import { ListCellArchiveButton, ListCellCompleteButton } from "./ListCellActions";

export function TaskRow({
  task,
  busyTaskId,
  compact = false,
  isCompleting = false,
  onExtract,
  onArchive,
  onOpen,
  onUpdate
}: {
  task: EnrichedTask;
  busyTaskId: number | null;
  compact?: boolean;
  isCompleting?: boolean;
  onExtract?: (task: EnrichedTask, position: { x: number; y: number }) => void;
  onArchive: (task: EnrichedTask) => void;
  onOpen?: (task: EnrichedTask) => void;
  onUpdate: (task: EnrichedTask, state: TaskState) => void;
}) {
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const tags = splitTags(task.tags);
  const isDone = task.state === "completed";

  function handleDragStart(event: DragEvent<HTMLElement>) {
    if (!onExtract) {
      return;
    }

    dragStartRef.current = { x: event.screenX, y: event.screenY };
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", task.content);
  }

  function handleDragEnd(event: DragEvent<HTMLElement>) {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!onExtract || !start) {
      return;
    }

    const distance = Math.hypot(event.screenX - start.x, event.screenY - start.y);
    if (distance < 36) {
      return;
    }

    onExtract(task, { x: event.screenX, y: event.screenY });
  }

  function handleTaskAction(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    event.stopPropagation();
    action();
  }

  return (
    <article
      className={`task-row ${compact ? "compact" : ""} ${isCompleting ? "completing" : ""} ${onExtract ? "extractable" : ""} ${onOpen ? "openable" : ""}`}
      draggable={Boolean(onExtract)}
      onClick={onOpen ? () => onOpen(task) : undefined}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <ListCellCompleteButton
        done={isDone || isCompleting}
        disabled={busyTaskId === task.id || isCompleting}
        title={isCompleting ? "已完成" : isDone ? "取消完成" : "完成"}
        onClick={(event) => handleTaskAction(event, () => onUpdate(task, isDone ? "pending" : "completed"))}
      />
      <div className="task-main">
        <h2 className="task-list-title">{task.content}</h2>
        <div className="task-meta">
          <span>{task.projectName}</span>
          {task.state !== "completed" ? <span>{stateLabels[task.state]}</span> : null}
          {task.priority !== null && task.priority !== undefined ? <span>P{task.priority}</span> : null}
          <span>{formatRelative(task.updated_at)}</span>
        </div>
        {!compact && tags.length > 0 ? (
          <div className="tag-row">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : null}
      </div>
      <ListCellArchiveButton
        disabled={busyTaskId === task.id}
        onClick={(event) => handleTaskAction(event, () => onArchive(task))}
      />
    </article>
  );
}

export function TaskDetail({
  task,
  busyTaskId,
  noteBody,
  onNoteBlur,
  onNoteChange,
  onArchive,
  onSendToCodex,
  onUpdate
}: {
  task: EnrichedTask;
  busyTaskId: number | null;
  noteBody: string;
  onNoteBlur: () => void;
  onNoteChange: (body: string) => void;
  onArchive: (task: EnrichedTask) => void;
  onSendToCodex: (task: EnrichedTask) => void;
  onUpdate: (task: EnrichedTask, state: TaskState) => void;
}) {
  return (
    <section className="task-detail" aria-label="任务详情">
      <article className="task-detail-card">
        <div className="task-title-row">
          <span className={`state-dot ${stateTone[task.state]}`} />
          <p className="task-detail-content">{task.content}</p>
        </div>
      </article>

      <label className="task-note-panel">
        <span>备注</span>
        <textarea
          className="task-note-editor"
          value={noteBody}
          onBlur={onNoteBlur}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="添加备注"
          spellCheck={false}
        />
      </label>

      <div className="task-detail-actions">
        <button type="button" title="发送到 Codex" onClick={() => onSendToCodex(task)} disabled={busyTaskId === task.id}>
          <SquareTerminal size={15} />
        </button>
        {task.state !== "in_progress" ? (
          <button type="button" title="开始" onClick={() => onUpdate(task, "in_progress")} disabled={busyTaskId === task.id}>
            <Play size={15} />
          </button>
        ) : null}
        <button
          className={task.state === "completed" ? "done" : ""}
          type="button"
          title={task.state === "completed" ? "取消完成" : "完成"}
          onClick={() => onUpdate(task, task.state === "completed" ? "pending" : "completed")}
          disabled={busyTaskId === task.id}
        >
          <Check size={16} />
        </button>
        {task.state !== "blocked" ? (
          <button type="button" title="阻塞" onClick={() => onUpdate(task, "blocked")} disabled={busyTaskId === task.id}>
            <PauseCircle size={16} />
          </button>
        ) : (
          <button type="button" title="退回待办" onClick={() => onUpdate(task, "pending")} disabled={busyTaskId === task.id}>
            <RotateCcw size={15} />
          </button>
        )}
        <button type="button" title="归档" onClick={() => onArchive(task)} disabled={busyTaskId === task.id}>
          <Archive size={15} />
        </button>
      </div>
    </section>
  );
}

export function ProjectMenuRow({
  group,
  active,
  recordCount,
  onHover,
  onOpen,
  onRecord
}: {
  group: ProjectTodoGroup;
  active: boolean;
  recordCount: number;
  onHover: (group: ProjectTodoGroup, anchor: DOMRect) => void;
  onOpen: (group: ProjectTodoGroup) => void;
  onRecord: (group: ProjectTodoGroup) => void;
}) {
  return (
    <article
      className={`project-menu-item ${group.count === 0 ? "is-empty" : ""} ${active ? "active" : ""}`}
      role="button"
      tabIndex={0}
      onMouseEnter={(event) => onHover(group, event.currentTarget.getBoundingClientRect())}
      onFocus={(event) => onHover(group, event.currentTarget.getBoundingClientRect())}
      onClick={() => onOpen(group)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(group);
        }
      }}
    >
      <div className="project-row-content">
        <button
          className={`project-record-button ${recordCount > 0 ? "has-record" : ""}`}
          type="button"
          title={recordCount > 0 ? `${recordCount} 条记录` : "记项目"}
          onClick={(event) => {
            event.stopPropagation();
            onRecord(group);
          }}
        >
          <NotebookPen size={15} />
        </button>
        <span className="project-row-name">{group.projectName}</span>
        <span className="project-row-count">{group.count}</span>
        <ChevronRight className="project-row-arrow" size={18} />
      </div>
    </article>
  );
}
