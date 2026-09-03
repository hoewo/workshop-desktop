import { Archive, Check, PauseCircle, Play, RotateCcw, SquareTerminal } from "lucide-react";
import { useRef } from "react";
import type { DragEvent, MouseEvent } from "react";
import type { TaskState } from "../../shared/types";
import { formatRelative, stateLabels, stateTone, type EnrichedTask } from "../lib/tasks";
import { ListCellArchiveButton, ListCellCompleteButton } from "./ListCellActions";

export function TaskTagChips({
  tags,
  compact = false,
  maxVisible
}: {
  tags: EnrichedTask["resolvedTags"];
  compact?: boolean;
  maxVisible?: number;
}) {
  if (tags.length === 0) {
    return null;
  }

  const limit = maxVisible ?? (compact ? 2 : 3);
  const visibleTags = tags.slice(0, limit);
  const hiddenCount = tags.length - visibleTags.length;

  return (
    <div className={`tag-row ${compact ? "compact" : ""}`} aria-label={`标签：${tags.map((tag) => tag.name).join("、")}`}>
      {visibleTags.map((tag) => (
        <span key={tag.id}>{tag.name}</span>
      ))}
      {hiddenCount > 0 ? <span className="tag-overflow">+{hiddenCount}</span> : null}
    </div>
  );
}

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
  const tags = task.resolvedTags;
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
        <TaskTagChips tags={tags} compact={compact} />
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
        <TaskTagChips tags={task.resolvedTags} maxVisible={task.resolvedTags.length} />
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
