import {
  AlertTriangle,
  BookOpenText,
  CalendarClock,
  Check,
  ChevronRight,
  Eye,
  Folder,
  GripVertical,
  Link,
  LoaderCircle,
  LogIn,
  LogOut,
  Maximize2,
  Minimize2,
  NotebookPen,
  PauseCircle,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  StickyNote,
  Send,
  SquareTerminal,
  Trash2,
  WifiOff,
  X
} from "lucide-react";
import { DragEvent, FormEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  AppConfig,
  CodexRunMeta,
  CodexRunStatus,
  CurrentUserPayload,
  Organization,
  OrganizationsPayload,
  PersonalRecord,
  PersonalRecordChangeNotice,
  PersonalRecordMeta,
  PersonalRecordScope,
  PersonalRecordTarget,
  Project,
  ProjectsPayload,
  Task,
  TaskState,
  TaskStateChangeNotice,
  TasksPayload,
  VerificationCodeType,
  WindowFitRequest
} from "../shared/types";

const activeStates: TaskState[] = ["pending", "in_progress", "pending_review", "blocked"];

const codexRunStatusLabels: Record<CodexRunStatus, string> = {
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  interrupted: "已中断"
};
const recordCompleteAnimationMs = 900;
const taskCompleteAnimationMs = 850;

function isVisibleTask(task: Task) {
  return activeStates.includes(task.state) && !task.deleted_at;
}

const stateLabels: Record<TaskState, string> = {
  pending: "待办",
  in_progress: "进行中",
  pending_review: "待评审",
  completed: "已完成",
  accepted: "已验收",
  cancelled: "已取消",
  blocked: "阻塞"
};

const stateTone: Record<TaskState, string> = {
  pending: "state-pending",
  in_progress: "state-progress",
  pending_review: "state-review",
  completed: "state-done",
  accepted: "state-done",
  cancelled: "state-muted",
  blocked: "state-blocked"
};

type Surface = "tray" | "sticky" | "record";
type RecordMode = "edit" | "preview";
type RecordSaveStatus = "idle" | "saving" | "saved" | "error";
type RecordListContext =
  | { scopeType: "none" }
  | {
      scopeType: "project";
      projectId?: number;
      projectName?: string;
    };

interface EnrichedTask extends Task {
  projectName: string;
  meId?: number;
  isMine: boolean;
}

interface ProjectTodoGroup {
  project: Project;
  projectName: string;
  tasks: EnrichedTask[];
  count: number;
  latestAt: number;
}

function getSurface(): Surface {
  const surface = new URLSearchParams(window.location.search).get("surface");
  return surface === "sticky" || surface === "record" ? surface : "tray";
}

function getInitialProjectFilter() {
  const projectId = new URLSearchParams(window.location.search).get("project_id");
  return projectId && /^\d+$/.test(projectId) ? projectId : "all";
}

function getInitialTaskFilter() {
  const taskId = new URLSearchParams(window.location.search).get("task_id");
  return taskId && /^\d+$/.test(taskId) ? taskId : "all";
}

function getSafeQueryText(params: URLSearchParams, key: string, maxLength = 120) {
  const value = params.get(key)?.trim();
  return value && value.length <= maxLength ? value : undefined;
}

function getSafeRecordId(params: URLSearchParams, key: string) {
  const value = getSafeQueryText(params, key, 80);
  return value && /^[a-zA-Z0-9_-]+$/.test(value) ? value : undefined;
}

function getInitialRecordTarget(): PersonalRecordTarget {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("project_id");
  const taskId = params.get("task_id");
  const scopeType = params.get("scope_type");
  return {
    noteId: getSafeRecordId(params, "note_id"),
    draft: params.get("draft") === "1",
    scopeType: scopeType === "project" || scopeType === "task" ? scopeType : "none",
    projectId: projectId && /^\d+$/.test(projectId) ? Number(projectId) : undefined,
    projectName: getSafeQueryText(params, "project_name"),
    taskId: taskId && /^\d+$/.test(taskId) ? Number(taskId) : undefined,
    taskTitle: getSafeQueryText(params, "task_title")
  };
}

function isLoggedIn(config: AppConfig) {
  if (config.authMode === "nebula" || config.authMode === "bearer") {
    return Boolean(config.accessToken.trim());
  }

  return Boolean(config.userId.trim());
}

function getErrorMessage(payload: unknown, fallback = "请求失败") {
  if (payload && typeof payload === "object") {
    const maybe = payload as { error?: { message?: string }; message?: string; code?: string };
    return maybe.error?.message || maybe.message || maybe.code || fallback;
  }
  return fallback;
}

function extractList<T>(payload: unknown, key: string): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object") {
    const value = (payload as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  return [];
}

async function api<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, options?: {
  query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
  body?: unknown;
}) {
  const response = await window.workshopDesktop.request<T>({
    method,
    path,
    query: options?.query,
    body: options?.body
  });

  if (!response.ok) {
    throw new Error(response.error || getErrorMessage(response.body, `HTTP ${response.status || 0}`));
  }

  return response.body?.data as T;
}

function getMeId(project: Project, username?: string) {
  const members = project.members ?? [];
  return (
    members.find((member) => member.is_me)?.user_id ??
    (username ? members.find((member) => member.username === username)?.user_id : undefined)
  );
}

function withOrganization(project: Project, organization?: Organization): Project {
  return organization
    ? {
        ...project,
        organization_id: organization.id,
        organizationName: organization.name
      }
    : project;
}

function mergeProjects(projectGroups: Project[][]) {
  const byId = new Map<number, Project>();
  for (const project of projectGroups.flat()) {
    byId.set(project.id, project);
  }
  return [...byId.values()];
}

function getProjectDisplayName(project: Project) {
  return project.name;
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));

  if (minutes < 1) {
    return "刚刚";
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  });
}

function compareTasks(a: EnrichedTask, b: EnrichedTask) {
  const priorityA = a.priority ?? 999;
  const priorityB = b.priority ?? 999;
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

function splitTags(tags?: string | null) {
  if (!tags) {
    return [];
  }
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function truncateRecordTitle(title: string) {
  return title.length > 48 ? `${title.slice(0, 48)}...` : title;
}

function deriveRecordTitle(bodyMarkdown: string, fallback = "未命名记录") {
  const firstContentLine = bodyMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const h1Title = firstContentLine?.match(/^#\s+(.+)$/)?.[1]?.replace(/\s+#+$/, "").trim();
  if (h1Title) {
    return truncateRecordTitle(h1Title);
  }

  const title = (firstContentLine || fallback).replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").trim();
  return truncateRecordTitle(title || fallback);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function cssNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readLineHeight(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const lineHeight = cssNumber(style.lineHeight);
  if (lineHeight > 0) {
    return lineHeight;
  }

  const fontSize = cssNumber(style.fontSize);
  return fontSize > 0 ? fontSize * 1.4 : 20;
}

function readVerticalBorderHeight(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return cssNumber(style.borderTopWidth) + cssNumber(style.borderBottomWidth);
}

function readTextareaHeightForFit(element: HTMLTextAreaElement, maxHeight: number) {
  const previousHeight = element.style.height;
  const previousMinHeight = element.style.minHeight;
  const previousFlex = element.style.flex;

  element.style.height = "auto";
  element.style.minHeight = "0";
  element.style.flex = "0 0 auto";

  try {
    const borderHeight = readVerticalBorderHeight(element);
    const minHeight = Math.ceil(readLineHeight(element) + borderHeight);
    return clampNumber(Math.ceil(element.scrollHeight + borderHeight), minHeight, maxHeight);
  } finally {
    element.style.height = previousHeight;
    element.style.minHeight = previousMinHeight;
    element.style.flex = previousFlex;
  }
}

function readElementHeightForFit(element: HTMLElement): number {
  const currentHeight = element.getBoundingClientRect().height;
  if (element instanceof HTMLTextAreaElement && element.classList.contains("record-editor")) {
    return readTextareaHeightForFit(element, 520);
  }
  if (element instanceof HTMLTextAreaElement && element.classList.contains("task-note-editor")) {
    return readTextareaHeightForFit(element, 420);
  }
  if (
    element.classList.contains("task-detail") ||
    element.classList.contains("task-note-panel") ||
    element.classList.contains("record-preview-panel")
  ) {
    return readElementChildrenHeight(element);
  }
  return currentHeight;
}

function readElementChildrenHeight(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const paddingBlock = cssNumber(style.paddingTop) + cssNumber(style.paddingBottom);
  const borderBlock = cssNumber(style.borderTopWidth) + cssNumber(style.borderBottomWidth);
  const rowGap = cssNumber(style.rowGap || style.gap);
  const visibleChildren = Array.from(element.children).filter((child): child is HTMLElement => {
    return child instanceof HTMLElement && window.getComputedStyle(child).display !== "none";
  });
  const childrenHeight = visibleChildren.reduce<number>((height, child) => height + readElementHeightForFit(child), 0);
  return borderBlock + paddingBlock + childrenHeight + Math.max(0, visibleChildren.length - 1) * rowGap;
}

function readShellContentHeight() {
  const shell = document.querySelector("main");
  if (shell instanceof HTMLElement) {
    const shellStyle = window.getComputedStyle(shell);
    const paddingBlock = cssNumber(shellStyle.paddingTop) + cssNumber(shellStyle.paddingBottom);
    const rowGap = cssNumber(shellStyle.rowGap || shellStyle.gap);
    const visibleChildren = Array.from(shell.children).filter((child): child is HTMLElement => {
      return child instanceof HTMLElement && window.getComputedStyle(child).display !== "none";
    });
    const childrenHeight = visibleChildren.reduce((height, child) => {
      const isList = child.classList.contains("sticky-task-list") || child.classList.contains("record-list");
      return height + (isList ? readElementChildrenHeight(child) : readElementHeightForFit(child));
    }, 0);
    return Math.ceil(paddingBlock + childrenHeight + Math.max(0, visibleChildren.length - 1) * rowGap);
  }
  return Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
}

function inlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
      nodes.push(
        linkMatch ? (
          <a key={key} href={linkMatch[2]} onClick={(event) => event.preventDefault()}>
            {linkMatch[1]}
          </a>
        ) : (
          token
        )
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function MarkdownPreview({ value }: { value: string }) {
  const lines = value.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let inCode = false;
  let codeLines: string[] = [];

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        blocks.push(
          <pre key={`code-${index}`}>
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      blocks.push(<div className="markdown-gap" key={`gap-${index}`} />);
      return;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = inlineMarkdown(heading[2]);
      blocks.push(
        level === 1 ? (
          <h1 key={`h-${index}`}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={`h-${index}`}>{content}</h2>
        ) : (
          <h3 key={`h-${index}`}>{content}</h3>
        )
      );
      return;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      blocks.push(
        <ul key={`ul-${index}`}>
          <li>{inlineMarkdown(unordered[1])}</li>
        </ul>
      );
      return;
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (ordered) {
      blocks.push(
        <ol key={`ol-${index}`}>
          <li>{inlineMarkdown(ordered[1])}</li>
        </ol>
      );
      return;
    }

    const quote = /^>\s+(.+)$/.exec(line);
    if (quote) {
      blocks.push(<blockquote key={`q-${index}`}>{inlineMarkdown(quote[1])}</blockquote>);
      return;
    }

    blocks.push(<p key={`p-${index}`}>{inlineMarkdown(line)}</p>);
  });

  if (inCode) {
    blocks.push(
      <pre key="code-open">
        <code>{codeLines.join("\n")}</code>
      </pre>
    );
  }

  return <div className="markdown-preview">{blocks}</div>;
}

type RecordHeaderContext = {
  scopeType: PersonalRecordScope;
  title?: string;
  projectName?: string;
  taskTitle?: string;
};

type HeaderTitleContent =
  | {
      variant: "plain";
      text: string;
    }
  | {
      variant: "scoped";
      context: string;
      suffix: string;
    };

function WindowHeaderTitle({ title }: { title: HeaderTitleContent }) {
  if (title.variant === "plain") {
    return <h1 className="window-title-main window-title-plain">{title.text}</h1>;
  }

  return (
    <>
      <h1 className="window-title-main">{title.context}</h1>
      <span className="window-title-suffix">· {title.suffix}</span>
    </>
  );
}

function ProjectDirectorySubtitle({
  localDirectory,
  onClick
}: {
  localDirectory?: string;
  onClick: () => void;
}) {
  const label = localDirectory?.trim() || "请绑定本地目录";
  return (
    <button
      className={`project-directory-subtitle ${localDirectory ? "bound" : "unbound"}`}
      type="button"
      onClick={onClick}
      title={localDirectory ? `打开 ${localDirectory}` : "绑定本地目录"}
    >
      {label}
    </button>
  );
}

function getProjectLocalDirectory(config: AppConfig | null, projectId?: number) {
  if (!config || projectId === undefined || !Number.isFinite(projectId)) {
    return "";
  }
  return config.projectLocalDirectories[String(projectId)] || "";
}

function getRecordHeaderTitle(record: RecordHeaderContext | null, isDetail: boolean, recordCount: number): HeaderTitleContent {
  if (!record) {
    return { variant: "plain", text: `个人记录 ${recordCount}` };
  }
  if (record.scopeType === "task") {
    return { variant: "scoped", context: record.projectName || record.taskTitle || "任务", suffix: "备注" };
  }
  if (record.scopeType === "project") {
    return { variant: "scoped", context: record.projectName || "项目", suffix: isDetail ? "记录" : `记录 ${recordCount}` };
  }
  return { variant: "plain", text: isDetail ? "个人记录" : `个人记录 ${recordCount}` };
}

function getStickyHeader({
  filteredTaskCount,
  isSingleTaskSticky,
  projectFilter,
  selectedProjectName,
  selectedTask
}: {
  filteredTaskCount: number;
  isSingleTaskSticky: boolean;
  projectFilter: string;
  selectedProjectName?: string;
  selectedTask: EnrichedTask | null;
}): HeaderTitleContent {
  const isProjectSticky = !isSingleTaskSticky && projectFilter !== "all";
  if (isSingleTaskSticky) {
    return { variant: "scoped", context: selectedTask?.projectName || selectedProjectName || "项目", suffix: "任务" };
  }
  if (isProjectSticky) {
    return { variant: "scoped", context: selectedProjectName || "项目", suffix: `任务 ${filteredTaskCount}` };
  }
  return { variant: "plain", text: "全部待办" };
}

function getRecordListContext(source?: Pick<PersonalRecordMeta, "scopeType" | "projectId" | "projectName"> | PersonalRecordTarget | null): RecordListContext {
  if (source?.scopeType === "project" || source?.scopeType === "task") {
    return {
      scopeType: "project",
      projectId: source.projectId,
      projectName: source.projectName
    };
  }

  return { scopeType: "none" };
}

function recordMatchesListContext(record: PersonalRecordMeta, context: RecordListContext) {
  if (context.scopeType === "none") {
    return record.scopeType === "none";
  }

  if (record.scopeType !== "project") {
    return false;
  }

  if (context.projectId !== undefined) {
    return record.projectId === context.projectId;
  }

  if (context.projectName) {
    return record.projectName === context.projectName;
  }

  return true;
}

function recordMatchesSearch(record: PersonalRecordMeta, tokens: string[]) {
  if (tokens.length === 0) {
    return true;
  }

  const searchableText = [record.title, record.projectName, record.taskTitle]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => searchableText.includes(token));
}

function findTaskRecord(records: PersonalRecordMeta[], taskId?: number) {
  if (taskId === undefined) {
    return undefined;
  }
  return records.find((record) => record.scopeType === "task" && record.taskId === taskId);
}

function getRecordListEmptyLabel(context: RecordListContext, hasSearchQuery = false) {
  if (hasSearchQuery) {
    return "没有匹配记录";
  }
  return context.scopeType === "project" ? "还没有项目记录" : "还没有个人记录";
}

function WorkshopMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`workshop-mark ${compact ? "compact" : ""}`} aria-hidden="true">
      <span className="workshop-mark-sheet">
        <span className="workshop-mark-line primary" />
        <span className="workshop-mark-line secondary" />
        <span className="workshop-mark-line short" />
      </span>
      <span className="workshop-mark-check" />
    </span>
  );
}

function normalizeConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ""),
    serviceName: config.serviceName.trim() || "workshop",
    accessToken: config.accessToken.trim(),
    refreshToken: config.refreshToken.trim(),
    tokenType: config.tokenType.trim() || "Bearer",
    accessTokenExpiresAt: Number(config.accessTokenExpiresAt) || 0,
    refreshTokenExpiresAt: Number(config.refreshTokenExpiresAt) || 0,
    userId: config.userId.trim(),
    username: config.username.trim(),
    appId: config.appId.trim() || "workshop-desktop",
    sessionId: config.sessionId.trim(),
    dailyRefreshTime: config.dailyRefreshTime || "09:00"
  };
}

function canSubmitDirectLogin(config: AppConfig) {
  if (config.authMode === "bearer") {
    return Boolean(config.accessToken.trim());
  }

  if (config.authMode === "debugHeaders") {
    return Boolean(config.userId.trim());
  }

  return true;
}

function TaskRow({
  task,
  busyTaskId,
  compact = false,
  isCompleting = false,
  recordId,
  onExtract,
  onOpen,
  onRecord,
  onUpdate
}: {
  task: EnrichedTask;
  busyTaskId: number | null;
  compact?: boolean;
  isCompleting?: boolean;
  recordId?: string;
  onExtract?: (task: EnrichedTask, position: { x: number; y: number }) => void;
  onOpen?: (task: EnrichedTask) => void;
  onRecord?: (task: EnrichedTask) => void;
  onUpdate: (task: EnrichedTask, state: TaskState) => void;
}) {
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

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
      className={`task-row ${compact ? "compact" : ""} ${isCompleting ? "completing" : ""} ${onExtract ? "extractable" : ""} ${onOpen ? "openable" : ""} ${onRecord ? "has-record-action" : ""}`}
      draggable={Boolean(onExtract)}
      onClick={onOpen ? () => onOpen(task) : undefined}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="task-main">
        <div className="task-title-row">
          <span className={`state-dot ${stateTone[task.state]}`} />
          <h2>{task.content}</h2>
        </div>
        <div className="task-meta">
          <span>{task.projectName}</span>
          <span>{stateLabels[task.state]}</span>
          {task.priority !== null && task.priority !== undefined ? <span>P{task.priority}</span> : null}
          <span>{formatRelative(task.updated_at)}</span>
        </div>
        {!compact && splitTags(task.tags).length > 0 ? (
          <div className="tag-row">
            {splitTags(task.tags).slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="task-side-actions">
        {isCompleting ? (
          <span className="task-complete-mark" aria-label="已完成">
            <Check size={17} strokeWidth={3} />
          </span>
        ) : onRecord ? (
          <button
            className={`task-record-button ${recordId ? "has-record" : ""}`}
            type="button"
            title={recordId ? "打开备注" : "添加备注"}
            onClick={(event) => handleTaskAction(event, () => onRecord(task))}
          >
            <NotebookPen size={15} />
          </button>
        ) : null}
        {!isCompleting ? (
          <div className="task-actions">
            {task.state !== "in_progress" ? (
              <button
                type="button"
                title="开始"
                onClick={(event) => handleTaskAction(event, () => onUpdate(task, "in_progress"))}
                disabled={busyTaskId === task.id}
              >
                <Play size={15} />
              </button>
            ) : null}
            {task.state !== "completed" ? (
              <button
                type="button"
                title="完成"
                onClick={(event) => handleTaskAction(event, () => onUpdate(task, "completed"))}
                disabled={busyTaskId === task.id}
              >
                <Check size={16} />
              </button>
            ) : null}
            {task.state !== "blocked" ? (
              <button
                type="button"
                title="阻塞"
                onClick={(event) => handleTaskAction(event, () => onUpdate(task, "blocked"))}
                disabled={busyTaskId === task.id}
              >
                <PauseCircle size={16} />
              </button>
            ) : (
              <button
                type="button"
                title="退回待办"
                onClick={(event) => handleTaskAction(event, () => onUpdate(task, "pending"))}
                disabled={busyTaskId === task.id}
              >
                <RotateCcw size={15} />
              </button>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function TaskDetail({
  task,
  busyTaskId,
  noteBody,
  onNoteBlur,
  onNoteChange,
  onSendToCodex,
  onUpdate
}: {
  task: EnrichedTask;
  busyTaskId: number | null;
  noteBody: string;
  onNoteBlur: () => void;
  onNoteChange: (body: string) => void;
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
        {task.state !== "completed" ? (
          <button type="button" title="完成" onClick={() => onUpdate(task, "completed")} disabled={busyTaskId === task.id}>
            <Check size={16} />
          </button>
        ) : null}
        {task.state !== "blocked" ? (
          <button type="button" title="阻塞" onClick={() => onUpdate(task, "blocked")} disabled={busyTaskId === task.id}>
            <PauseCircle size={16} />
          </button>
        ) : (
          <button type="button" title="退回待办" onClick={() => onUpdate(task, "pending")} disabled={busyTaskId === task.id}>
            <RotateCcw size={15} />
          </button>
        )}
      </div>
    </section>
  );
}

function ProjectMenuRow({
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

function AuthFields({
  draftConfig,
  setDraftConfig
}: {
  draftConfig: AppConfig;
  setDraftConfig: (config: AppConfig) => void;
}) {
  return (
    <>
      <label>
        <span>基础地址</span>
        <input
          value={draftConfig.baseUrl}
          onChange={(event) => setDraftConfig({ ...draftConfig, baseUrl: event.target.value })}
          placeholder="https://api.feitianchengzi.com"
        />
      </label>
      <label>
        <span>服务名</span>
        <input
          value={draftConfig.serviceName}
          onChange={(event) => setDraftConfig({ ...draftConfig, serviceName: event.target.value })}
          placeholder="workshop"
        />
      </label>

      <div className="auth-switch">
        <button
          type="button"
          className={draftConfig.authMode === "nebula" ? "active" : ""}
          onClick={() => setDraftConfig({ ...draftConfig, authMode: "nebula" })}
        >
          NebulaAuth
        </button>
        <button
          type="button"
          className={draftConfig.authMode === "bearer" ? "active" : ""}
          onClick={() => setDraftConfig({ ...draftConfig, authMode: "bearer" })}
        >
          Bearer Token
        </button>
        <button
          type="button"
          className={draftConfig.authMode === "debugHeaders" ? "active" : ""}
          onClick={() => setDraftConfig({ ...draftConfig, authMode: "debugHeaders" })}
        >
          本地 Header
        </button>
      </div>

      {draftConfig.authMode === "bearer" ? (
        <label>
          <span>访问令牌</span>
          <input
            value={draftConfig.accessToken}
            onChange={(event) => setDraftConfig({ ...draftConfig, accessToken: event.target.value })}
            type="password"
            placeholder="Bearer token"
          />
        </label>
      ) : draftConfig.authMode === "debugHeaders" ? (
        <div className="debug-fields">
          <label>
            <span>用户 UUID</span>
            <input
              value={draftConfig.userId}
              onChange={(event) => setDraftConfig({ ...draftConfig, userId: event.target.value })}
            />
          </label>
          <label>
            <span>用户名</span>
            <input
              value={draftConfig.username}
              onChange={(event) => setDraftConfig({ ...draftConfig, username: event.target.value })}
            />
          </label>
          <label>
            <span>App ID</span>
            <input
              value={draftConfig.appId}
              onChange={(event) => setDraftConfig({ ...draftConfig, appId: event.target.value })}
            />
          </label>
          <label>
            <span>Session ID</span>
            <input
              value={draftConfig.sessionId}
              onChange={(event) => setDraftConfig({ ...draftConfig, sessionId: event.target.value })}
            />
          </label>
        </div>
      ) : null}
    </>
  );
}

export default function App() {
  const surface = useMemo(getSurface, []);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<AppConfig | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [projectFilter] = useState(getInitialProjectFilter);
  const [taskFilter] = useState(getInitialTaskFilter);
  const [isLoading, setIsLoading] = useState(false);
  const [loginCodeType, setLoginCodeType] = useState<VerificationCodeType>("email");
  const [loginTarget, setLoginTarget] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [sendCooldown, setSendCooldown] = useState(0);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState("");
  const [taskMessage, setTaskMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hoveredProjectId, setHoveredProjectId] = useState<number | null>(null);
  const [recordTarget] = useState(getInitialRecordTarget);
  const [records, setRecords] = useState<PersonalRecordMeta[]>([]);
  const [codexRuns, setCodexRuns] = useState<CodexRunMeta[]>([]);

  useEffect(() => {
    if (getSurface() !== "tray") {
      return undefined;
    }

    let cancelled = false;
    window.workshopDesktop
      .listCodexRuns()
      .then((runs) => {
        if (!cancelled) {
          setCodexRuns(runs);
        }
      })
      .catch(() => undefined);
    const unsubscribe = window.workshopDesktop.onCodexRunsChanged((runs) => setCodexRuns(runs));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [activeRecord, setActiveRecord] = useState<PersonalRecord | null>(null);
  const [recordListContext, setRecordListContext] = useState<RecordListContext>(() => getRecordListContext(recordTarget));
  const [recordBody, setRecordBody] = useState("");
  const [recordMode, setRecordMode] = useState<RecordMode>("edit");
  const [recordDirty, setRecordDirty] = useState(false);
  const [recordSaveStatus, setRecordSaveStatus] = useState<RecordSaveStatus>("idle");
  const [recordMessage, setRecordMessage] = useState("");
  const [recordScopePickerOpen, setRecordScopePickerOpen] = useState(false);
  const [recordProjectQuery, setRecordProjectQuery] = useState("");
  const [recordSearchQuery, setRecordSearchQuery] = useState("");
  const [recordSearchOpen, setRecordSearchOpen] = useState(false);
  const [recordCompletingId, setRecordCompletingId] = useState<string | null>(null);
  const [stickyListCollapsed, setStickyListCollapsed] = useState(false);
  const [recordListCollapsed, setRecordListCollapsed] = useState(false);
  const [taskNoteBody, setTaskNoteBody] = useState("");
  const [taskNoteDirty, setTaskNoteDirty] = useState(false);
  const [focusPulseVisible, setFocusPulseVisible] = useState(false);
  const recordSaveTimerRef = useRef<number | null>(null);
  const recordEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const recordSearchInputRef = useRef<HTMLInputElement | null>(null);
  const taskNoteSaveTimerRef = useRef<number | null>(null);
  const focusPulseTimerRef = useRef<number | null>(null);
  const focusPulseFrameRef = useRef<number | null>(null);
  const arrangementHeightTimerRef = useRef<number | null>(null);
  const arrangementMaxHeightRef = useRef<number | null>(null);
  const lastWindowFitRef = useRef("");
  const activeRecordRef = useRef<PersonalRecord | null>(null);
  const recordBodyRef = useRef("");
  const recordDirtyRef = useRef(false);
  const taskNoteBodyRef = useRef("");
  const taskNoteDirtyRef = useRef(false);
  const taskCompleteTimersRef = useRef<Map<number, number>>(new Map());
  const recordCompleteTimerRef = useRef<number | null>(null);
  const recordSaveInFlightRef = useRef<Promise<PersonalRecord | null> | null>(null);
  const recordSaveQueuedRef = useRef(false);
  const isSingleTaskSticky = surface === "sticky" && taskFilter !== "all";

  useEffect(() => {
    activeRecordRef.current = activeRecord;
  }, [activeRecord]);

  useEffect(() => {
    recordBodyRef.current = recordBody;
  }, [recordBody]);

  useEffect(() => {
    recordDirtyRef.current = recordDirty;
  }, [recordDirty]);

  useEffect(() => {
    taskNoteBodyRef.current = taskNoteBody;
  }, [taskNoteBody]);

  useEffect(() => {
    taskNoteDirtyRef.current = taskNoteDirty;
  }, [taskNoteDirty]);

  const triggerFocusPulse = useCallback(() => {
    if (focusPulseFrameRef.current !== null) {
      window.cancelAnimationFrame(focusPulseFrameRef.current);
      focusPulseFrameRef.current = null;
    }
    if (focusPulseTimerRef.current !== null) {
      window.clearTimeout(focusPulseTimerRef.current);
      focusPulseTimerRef.current = null;
    }

    setFocusPulseVisible(false);
    focusPulseFrameRef.current = window.requestAnimationFrame(() => {
      focusPulseFrameRef.current = null;
      setFocusPulseVisible(true);
      focusPulseTimerRef.current = window.setTimeout(() => {
        focusPulseTimerRef.current = null;
        setFocusPulseVisible(false);
      }, 1300);
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of taskCompleteTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      taskCompleteTimersRef.current.clear();
      if (recordCompleteTimerRef.current !== null) {
        window.clearTimeout(recordCompleteTimerRef.current);
      }
      if (focusPulseFrameRef.current !== null) {
        window.cancelAnimationFrame(focusPulseFrameRef.current);
      }
      if (focusPulseTimerRef.current !== null) {
        window.clearTimeout(focusPulseTimerRef.current);
      }
      if (arrangementHeightTimerRef.current !== null) {
        window.clearTimeout(arrangementHeightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => window.workshopDesktop.onFocusPulse(triggerFocusPulse), [triggerFocusPulse]);

  useEffect(
    () =>
      window.workshopDesktop.onWindowArrangement((notice) => {
        if (typeof notice.maxHeight === "number" && Number.isFinite(notice.maxHeight) && notice.maxHeight > 0) {
          arrangementMaxHeightRef.current = notice.maxHeight;
          lastWindowFitRef.current = "";
          if (arrangementHeightTimerRef.current !== null) {
            window.clearTimeout(arrangementHeightTimerRef.current);
          }
          arrangementHeightTimerRef.current = window.setTimeout(() => {
            arrangementHeightTimerRef.current = null;
            arrangementMaxHeightRef.current = null;
            lastWindowFitRef.current = "";
          }, 1400);
        }

        if (notice.compactList) {
          if (surface === "sticky" && !isSingleTaskSticky) {
            setStickyListCollapsed(true);
          }
          if (surface === "record" && !activeRecordRef.current) {
            setRecordListCollapsed(true);
          }
        }
      }),
    [isSingleTaskSticky, surface]
  );

  const loadData = useCallback(async () => {
    if (!config || !isLoggedIn(config)) {
      setProjects([]);
      setTasks([]);
      return;
    }

    setIsLoading(true);
    setError("");
    setTaskMessage("");

    try {
      const currentUser = await api<CurrentUserPayload>("GET", "/users").catch(() => null);
      const standaloneProjectPayload = await api<ProjectsPayload | Project[]>("GET", "/projects", {
        query: { page_size: 200 }
      });
      const standaloneProjects = extractList<Project>(standaloneProjectPayload, "projects");
      const organizationsPayload = await api<OrganizationsPayload | Organization[]>("GET", "/organizations", {
        query: { page_size: 200 }
      });
      const organizations = extractList<Organization>(organizationsPayload, "organizations");
      const organizationProjectGroups = await Promise.all(
        organizations.map(async (organization) => {
          const payload = await api<ProjectsPayload | Project[]>("GET", "/projects", {
            query: {
              organization_id: organization.id,
              page_size: 200
            }
          });
          return extractList<Project>(payload, "projects").map((project) => withOrganization(project, organization));
        })
      );
      const nextProjects = mergeProjects([standaloneProjects, ...organizationProjectGroups]);
      setProjects(nextProjects);

      const taskGroups = await Promise.all(
        nextProjects.map(async (project) => {
          const payload = await api<TasksPayload | Task[]>("GET", "/tasks", {
            query: {
              project_id: project.id,
              state: activeStates,
              page_size: 200
            }
          });

          const meId = getMeId(project, currentUser?.username || config.username);
          const projectLabel = getProjectDisplayName(project);
          return extractList<Task>(payload, "tasks").map<EnrichedTask>((task) => ({
            ...task,
            projectName: projectLabel,
            meId,
            isMine: task.creator_id === meId || task.executor_id === meId
          }));
        })
      );

      setTasks(taskGroups.flat().sort(compareTasks));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "同步失败");
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const clearTaskCompletionFeedback = useCallback((taskId: number) => {
    const existingTimer = taskCompleteTimersRef.current.get(taskId);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      taskCompleteTimersRef.current.delete(taskId);
    }

    setCompletingTaskIds((current) => {
      if (!current.has(taskId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
  }, []);

  const markTaskCompletionFeedback = useCallback((taskId: number, onDone?: () => void) => {
    const existingTimer = taskCompleteTimersRef.current.get(taskId);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }

    setCompletingTaskIds((current) => {
      const next = new Set(current);
      next.add(taskId);
      return next;
    });

    const timer = window.setTimeout(() => {
      taskCompleteTimersRef.current.delete(taskId);
      setCompletingTaskIds((current) => {
        if (!current.has(taskId)) {
          return current;
        }
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      onDone?.();
    }, taskCompleteAnimationMs);
    taskCompleteTimersRef.current.set(taskId, timer);
  }, []);

  const clearRecordCompletionFeedback = useCallback(() => {
    if (recordCompleteTimerRef.current !== null) {
      window.clearTimeout(recordCompleteTimerRef.current);
      recordCompleteTimerRef.current = null;
    }
    setRecordCompletingId(null);
  }, []);

  const markRecordCompletionFeedback = useCallback((recordId: string, onDone?: () => void) => {
    if (recordCompleteTimerRef.current !== null) {
      window.clearTimeout(recordCompleteTimerRef.current);
    }

    setRecordCompletingId(recordId);
    recordCompleteTimerRef.current = window.setTimeout(() => {
      recordCompleteTimerRef.current = null;
      setRecordCompletingId((current) => (current === recordId ? null : current));
      onDone?.();
    }, recordCompleteAnimationMs);
  }, []);

  const applyTaskStateChange = useCallback(
    (notice: TaskStateChangeNotice, options?: { refreshAfterComplete?: boolean }) => {
      const now = new Date().toISOString();
      setTasks((currentTasks) =>
        currentTasks
          .map((task) =>
            task.id === notice.id
              ? {
                  ...task,
                  state: notice.state,
                  updated_at: notice.updatedAt || now,
                  completion_at: notice.state === "completed" ? notice.completionAt || task.completion_at || now : task.completion_at
                }
              : task
          )
          .sort(compareTasks)
      );

      if (notice.state === "completed") {
        markTaskCompletionFeedback(notice.id, options?.refreshAfterComplete ? () => void loadData() : undefined);
        return;
      }

      clearTaskCompletionFeedback(notice.id);
    },
    [clearTaskCompletionFeedback, loadData, markTaskCompletionFeedback]
  );

  const loadRecords = useCallback(async () => {
    const nextRecords = await window.workshopDesktop.listPersonalRecords();
    setRecords(nextRecords);
    setRecordsLoaded(true);
    return nextRecords;
  }, []);

  const startRecordDraft = useCallback((target?: PersonalRecordTarget) => {
    const scopeType: PersonalRecordScope = target?.scopeType === "project" || target?.scopeType === "task" ? target.scopeType : "none";
    const now = new Date().toISOString();
    const draft: PersonalRecord = {
      id: "",
      title: scopeType === "task" ? target?.taskTitle || "任务备注" : scopeType === "project" ? target?.projectName || "项目想法" : "个人记录",
      scopeType,
      status: "active",
      createdAt: now,
      updatedAt: now,
      bodyMarkdown: "",
      ...(scopeType === "project" || scopeType === "task"
        ? { projectId: target?.projectId, projectName: target?.projectName }
        : {}),
      ...(scopeType === "task" ? { taskId: target?.taskId, taskTitle: target?.taskTitle } : {})
    };
    activeRecordRef.current = draft;
    recordBodyRef.current = "";
    recordDirtyRef.current = false;
    setActiveRecord(draft);
    setRecordListContext(getRecordListContext(draft));
    setRecordBody("");
    setRecordDirty(false);
    setRecordSaveStatus("idle");
    setRecordMessage("");
    setRecordMode("edit");
  }, []);

  const openRecordById = useCallback(async (id: string) => {
    const record = await window.workshopDesktop.getPersonalRecord(id);
    if (!record) {
      setRecordMessage("记录不存在");
      return;
    }
    activeRecordRef.current = record;
    recordBodyRef.current = record.bodyMarkdown;
    recordDirtyRef.current = false;
    setActiveRecord(record);
    setRecordListContext(getRecordListContext(record));
    setRecordBody(record.bodyMarkdown);
    setRecordDirty(false);
    setRecordSaveStatus("saved");
    setRecordMessage("");
    setRecordMode("edit");
  }, []);

  const saveRecordNow = useCallback(async () => {
    recordSaveQueuedRef.current = true;

    if (recordSaveInFlightRef.current) {
      return recordSaveInFlightRef.current;
    }

    const saveTask = (async () => {
      let lastSaved: PersonalRecord | null = null;
      let shouldReloadRecords = false;

      while (recordSaveQueuedRef.current) {
        recordSaveQueuedRef.current = false;

        const recordToSave = activeRecordRef.current;
        const bodyToSave = recordBodyRef.current;
        const shouldPersist = Boolean(recordDirtyRef.current || !recordToSave?.id);

        if (!recordToSave || (!recordToSave.id && !bodyToSave.trim())) {
          recordDirtyRef.current = false;
          setRecordDirty(false);
          lastSaved = null;
          continue;
        }

        if (!shouldPersist) {
          lastSaved = recordToSave;
          continue;
        }

        setRecordSaveStatus("saving");

        try {
          const saved = await window.workshopDesktop.savePersonalRecord({
            id: recordToSave.id || undefined,
            bodyMarkdown: bodyToSave,
            scopeType: recordToSave.scopeType,
            status: recordToSave.status,
            projectId: recordToSave.projectId,
            projectName: recordToSave.projectName,
            taskId: recordToSave.taskId,
            taskTitle: recordToSave.taskTitle,
            promotedTaskId: recordToSave.promotedTaskId
          });

          const latestRecord = activeRecordRef.current;
          const latestBody = recordBodyRef.current;
          const sameRecord =
            latestRecord &&
            (recordToSave.id ? latestRecord.id === recordToSave.id : latestRecord === recordToSave || latestRecord.id === saved.id);

          lastSaved = saved;
          shouldReloadRecords = true;

          if (!sameRecord || !latestRecord) {
            continue;
          }

          if (latestBody !== bodyToSave || latestRecord !== recordToSave) {
            const nextRecord = {
              ...latestRecord,
              id: latestRecord.id || saved.id,
              createdAt: latestRecord.createdAt || saved.createdAt,
              updatedAt: saved.updatedAt,
              bodyMarkdown: latestBody
            };
            activeRecordRef.current = nextRecord;
            recordDirtyRef.current = true;
            setActiveRecord(nextRecord);
            setRecordDirty(true);
            recordSaveQueuedRef.current = true;
            continue;
          }

          activeRecordRef.current = saved;
          recordBodyRef.current = saved.bodyMarkdown;
          recordDirtyRef.current = false;
          setActiveRecord(saved);
          setRecordBody(saved.bodyMarkdown);
          setRecordDirty(false);
          setRecordSaveStatus("saved");
          setRecordMessage("");
        } catch (nextError) {
          recordSaveQueuedRef.current = false;
          recordDirtyRef.current = true;
          setRecordDirty(true);
          setRecordSaveStatus("error");
          setRecordMessage(nextError instanceof Error ? nextError.message : "保存失败");
          return null;
        }
      }

      if (shouldReloadRecords) {
        void loadRecords().catch(() => undefined);
      }

      return lastSaved;
    })();

    recordSaveInFlightRef.current = saveTask;

    try {
      return await saveTask;
    } finally {
      if (recordSaveInFlightRef.current === saveTask) {
        recordSaveInFlightRef.current = null;
      }
    }
  }, [loadRecords]);

  const closeRecordWindow = useCallback(async () => {
    if (recordDirtyRef.current) {
      await saveRecordNow();
    }
    await window.workshopDesktop.closeWindow();
  }, [saveRecordNow]);

  useEffect(() => {
    window.workshopDesktop.getConfig().then((nextConfig) => {
      setConfig(nextConfig);
      setDraftConfig(nextConfig);
    });
  }, []);

  useEffect(() => {
    void loadRecords().then((nextRecords) => {
      if (surface !== "record") {
        return;
      }

      if (recordTarget.draft) {
        startRecordDraft(recordTarget);
        return;
      }

      if (recordTarget.noteId) {
        void openRecordById(recordTarget.noteId);
        return;
      }

      if (recordTarget.scopeType === "task") {
        const existingTaskRecord = findTaskRecord(nextRecords, recordTarget.taskId);
        if (existingTaskRecord) {
          void openRecordById(existingTaskRecord.id);
          return;
        }
        startRecordDraft(recordTarget);
        return;
      }

      if (recordTarget.scopeType === "project") {
        const hasProjectRecords = nextRecords.some((record) => recordMatchesListContext(record, getRecordListContext(recordTarget)));
        if (!hasProjectRecords) {
          startRecordDraft(recordTarget);
        }
      }
    });
  }, [loadRecords, openRecordById, recordTarget, startRecordDraft, surface]);

  useEffect(
    () =>
      window.workshopDesktop.onRecordsChanged((notice: PersonalRecordChangeNotice | null) => {
        if (notice?.status === "completed") {
          markRecordCompletionFeedback(notice.id, () => void loadRecords());
          return;
        }

        clearRecordCompletionFeedback();
        void loadRecords();
      }),
    [clearRecordCompletionFeedback, loadRecords, markRecordCompletionFeedback]
  );

  useEffect(() => {
    if (config && isLoggedIn(config)) {
      void loadData();
    }
  }, [config, loadData]);

  useEffect(
    () =>
      window.workshopDesktop.onRefresh((event) => {
        if (event?.task) {
          applyTaskStateChange(event.task, { refreshAfterComplete: event.task.state === "completed" });
          if (event.task.state !== "completed") {
            void loadData();
          }
          return;
        }

        void loadData();
      }),
    [applyTaskStateChange, loadData]
  );

  useEffect(() => {
    if (surface !== "record" || !recordDirty) {
      return undefined;
    }

    if (recordSaveTimerRef.current) {
      window.clearTimeout(recordSaveTimerRef.current);
    }

    recordSaveTimerRef.current = window.setTimeout(() => {
      recordSaveTimerRef.current = null;
      void saveRecordNow();
    }, 500);

    return () => {
      if (recordSaveTimerRef.current) {
        window.clearTimeout(recordSaveTimerRef.current);
        recordSaveTimerRef.current = null;
      }
    };
  }, [recordDirty, recordBody, saveRecordNow, surface]);

  useEffect(() => {
    if (surface !== "record" || recordMode !== "edit") {
      return;
    }

    const editor = recordEditorRef.current;
    if (!editor) {
      return;
    }

    const nextHeight = readTextareaHeightForFit(editor, 520);
    editor.style.minHeight = "";
    editor.style.height = `${nextHeight}px`;
    editor.style.overflowY = "auto";
  }, [activeRecord?.id, recordBody, recordMode, surface]);

  useEffect(() => {
    if (surface !== "record" || activeRecord || !recordSearchOpen) {
      return;
    }

    recordSearchInputRef.current?.focus();
  }, [activeRecord, recordSearchOpen, surface]);

  useEffect(() => {
    if (surface !== "sticky" && surface !== "record") {
      return undefined;
    }

    const isRecordDetail = surface === "record" && Boolean(activeRecord);
    const isDetailWindow = (surface === "sticky" && isSingleTaskSticky) || isRecordDetail;
    const isCollapsedList =
      (surface === "sticky" && stickyListCollapsed && !isSingleTaskSticky) || (surface === "record" && recordListCollapsed && !activeRecord);
    const fixedMinHeight = isCollapsedList ? 56 : 112;
    const detailMinHeight = surface === "sticky" && isSingleTaskSticky ? 132 : 188;
    const baseMaxHeight = isCollapsedList ? 56 : surface === "sticky" ? (isSingleTaskSticky ? 640 : 720) : isRecordDetail ? 680 : 720;
    let animationFrame: number | null = null;

    function requestWindowFit() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        const contentHeight = readShellContentHeight();
        const minHeight = isDetailWindow ? Math.min(detailMinHeight, baseMaxHeight) : fixedMinHeight;
        const maxHeight = arrangementMaxHeightRef.current
          ? Math.min(baseMaxHeight, Math.max(minHeight, arrangementMaxHeightRef.current))
          : baseMaxHeight;
        const request: WindowFitRequest = {
          height: contentHeight,
          minWidth: surface === "record" ? 320 : 300,
          minHeight,
          maxHeight
        };
        const requestKey = JSON.stringify(request);
        if (requestKey === lastWindowFitRef.current) {
          return;
        }
        lastWindowFitRef.current = requestKey;
        void window.workshopDesktop.fitWindowContent(request);
      });
    }

    requestWindowFit();
    window.addEventListener("resize", requestWindowFit);

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("resize", requestWindowFit);
    };
  }, [
    activeRecord,
    error,
    isLoading,
    isSingleTaskSticky,
    recordBody,
    recordMessage,
    recordMode,
    recordListCollapsed,
    recordSearchOpen,
    recordSearchQuery,
    records,
    stickyListCollapsed,
    surface,
    taskNoteBody,
    tasks
  ]);

  useEffect(() => {
    if (sendCooldown <= 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [sendCooldown]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (!task.isMine || (!isVisibleTask(task) && !completingTaskIds.has(task.id))) {
        return false;
      }

      if (projectFilter !== "all" && task.project_id !== Number(projectFilter)) {
        return false;
      }

      if (taskFilter !== "all" && task.id !== Number(taskFilter)) {
        return false;
      }

      return true;
    });
  }, [completingTaskIds, projectFilter, taskFilter, tasks]);

  const projectTodoGroups = useMemo<ProjectTodoGroup[]>(() => {
    return projects
      .map((project) => {
        const projectTasks = tasks
          .filter((task) => task.isMine && (isVisibleTask(task) || completingTaskIds.has(task.id)) && task.project_id === project.id)
          .sort(compareTasks);
        return {
          project,
          projectName: getProjectDisplayName(project),
          tasks: projectTasks,
          count: projectTasks.length,
          latestAt: projectTasks[0] ? new Date(projectTasks[0].updated_at).getTime() : 0
        };
      })
      .sort((a, b) => {
        if (a.count !== b.count) {
          return b.count - a.count;
        }
        if (a.latestAt !== b.latestAt) {
          return b.latestAt - a.latestAt;
        }
        return a.projectName.localeCompare(b.projectName, "zh-CN");
      });
  }, [completingTaskIds, projects, tasks]);

  const selectedProjectName = useMemo(() => {
    if (projectFilter === "all") {
      return "";
    }
    const selectedProject = projects.find((project) => project.id === Number(projectFilter));
    return selectedProject ? getProjectDisplayName(selectedProject) : "";
  }, [projectFilter, projects]);
  const recordProjectCandidates = useMemo(() => {
    const query = recordProjectQuery.trim().toLowerCase();
    return projects
      .map((project) => ({ project, projectName: getProjectDisplayName(project) }))
      .filter(({ projectName }) => !query || projectName.toLowerCase().includes(query))
      .slice(0, 8);
  }, [projects, recordProjectQuery]);
  const contextualRecords = useMemo(
    () => records.filter((record) => recordMatchesListContext(record, recordListContext)),
    [records, recordListContext]
  );
  const recordSearchTokens = useMemo(
    () => recordSearchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [recordSearchQuery]
  );
  const visibleRecords = useMemo(
    () => contextualRecords.filter((record) => recordMatchesSearch(record, recordSearchTokens)),
    [contextualRecords, recordSearchTokens]
  );
  const hasRecordSearchQuery = recordSearchTokens.length > 0;
  useEffect(() => {
    if (surface === "record" && recordsLoaded && !activeRecord && contextualRecords.length === 0) {
      setRecordListCollapsed(true);
    }
  }, [activeRecord, contextualRecords.length, recordListContext, recordsLoaded, surface]);

  const taskRecordsByTaskId = useMemo(() => {
    const byTaskId = new Map<number, PersonalRecordMeta>();
    for (const record of records) {
      if (record.scopeType === "task" && typeof record.taskId === "number" && !byTaskId.has(record.taskId)) {
        byTaskId.set(record.taskId, record);
      }
    }
    return byTaskId;
  }, [records]);
  const projectRecordCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const record of records) {
      if (record.scopeType === "project" && typeof record.projectId === "number") {
        counts.set(record.projectId, (counts.get(record.projectId) ?? 0) + 1);
      }
    }
    return counts;
  }, [records]);
  const selectedTask = isSingleTaskSticky ? filteredTasks[0] : null;
  const selectedTaskRecord = selectedTask ? taskRecordsByTaskId.get(selectedTask.id) : undefined;
  const canExtractTasks = surface === "sticky" && projectFilter !== "all" && taskFilter === "all";

  useEffect(() => {
    if (!selectedTask) {
      taskNoteBodyRef.current = "";
      taskNoteDirtyRef.current = false;
      setTaskNoteBody("");
      setTaskNoteDirty(false);
      return undefined;
    }

    if (!selectedTaskRecord) {
      taskNoteBodyRef.current = "";
      taskNoteDirtyRef.current = false;
      setTaskNoteBody("");
      setTaskNoteDirty(false);
      return undefined;
    }

    let isCancelled = false;
    void window.workshopDesktop.getPersonalRecord(selectedTaskRecord.id).then((record) => {
      if (!isCancelled && !taskNoteDirtyRef.current) {
        const nextBody = record?.bodyMarkdown ?? "";
        taskNoteBodyRef.current = nextBody;
        taskNoteDirtyRef.current = false;
        setTaskNoteBody(nextBody);
        setTaskNoteDirty(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedTask, selectedTaskRecord]);

  const saveTaskNoteNow = useCallback(async () => {
    if (!selectedTask) {
      return;
    }

    const bodyMarkdown = taskNoteBodyRef.current;
    if (!selectedTaskRecord && !bodyMarkdown.trim()) {
      taskNoteDirtyRef.current = false;
      setTaskNoteDirty(false);
      return;
    }

    await window.workshopDesktop.savePersonalRecord({
      id: selectedTaskRecord?.id,
      bodyMarkdown,
      scopeType: "task",
      status: "active",
      projectId: selectedTask.project_id,
      projectName: selectedTask.projectName,
      taskId: selectedTask.id,
      taskTitle: selectedTask.content
    });
    taskNoteDirtyRef.current = false;
    setTaskNoteDirty(false);
    await loadRecords();
  }, [loadRecords, selectedTask, selectedTaskRecord]);

  useEffect(() => {
    if (!taskNoteDirty || !selectedTask) {
      return undefined;
    }

    if (taskNoteSaveTimerRef.current) {
      window.clearTimeout(taskNoteSaveTimerRef.current);
    }

    taskNoteSaveTimerRef.current = window.setTimeout(() => {
      taskNoteSaveTimerRef.current = null;
      void saveTaskNoteNow();
    }, 500);

    return () => {
      if (taskNoteSaveTimerRef.current) {
        window.clearTimeout(taskNoteSaveTimerRef.current);
        taskNoteSaveTimerRef.current = null;
      }
    };
  }, [saveTaskNoteNow, selectedTask, taskNoteBody, taskNoteDirty]);

  async function closeStickyWindow() {
    if (taskNoteSaveTimerRef.current) {
      window.clearTimeout(taskNoteSaveTimerRef.current);
      taskNoteSaveTimerRef.current = null;
    }
    if (taskNoteDirtyRef.current) {
      await saveTaskNoteNow();
    }
    await window.workshopDesktop.closeSticky();
  }

  async function sendTaskToCodex(task: EnrichedTask) {
    setError("");
    setTaskMessage("");

    try {
      if (taskNoteSaveTimerRef.current) {
        window.clearTimeout(taskNoteSaveTimerRef.current);
        taskNoteSaveTimerRef.current = null;
      }
      if (taskNoteDirtyRef.current) {
        await saveTaskNoteNow();
      }

      const sendResult = await window.workshopDesktop.sendToCodex({
        kind: "task",
        projectId: task.project_id,
        projectName: task.projectName,
        taskId: task.id,
        title: task.content,
        bodyMarkdown: taskNoteBodyRef.current
      });
      setTaskMessage(sendResult.backend === "app-server" ? "已启动 Codex 执行，可在 Codex app 查看" : "后台执行已启动");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "发送失败");
    }
  }

  useEffect(() => {
    if (surface !== "sticky") {
      return undefined;
    }

    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void closeStickyWindow();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [surface, saveTaskNoteNow]);

  function showProjectTaskPreview(group: ProjectTodoGroup, anchor: DOMRect) {
    setHoveredProjectId(group.project.id);
    void window.workshopDesktop.showTaskPreview({
      count: group.count,
      anchor: {
        x: anchor.x,
        y: anchor.y,
        width: anchor.width,
        height: anchor.height
      },
      tasks: group.tasks.slice(0, 8).map((task) => ({
        id: task.id,
        projectId: task.project_id,
        content: task.content,
        state: task.state,
        stateLabel: stateLabels[task.state]
      }))
    });
  }

  function hideProjectTaskPreview() {
    void window.workshopDesktop.hideTaskPreview();
  }

  function extractTaskToSticky(task: EnrichedTask, position: { x: number; y: number }) {
    void window.workshopDesktop.openSticky({
      projectId: task.project_id,
      taskId: task.id,
      x: position.x,
      y: position.y
    });
  }

  function openTaskDetail(task: EnrichedTask) {
    void window.workshopDesktop.openSticky({
      projectId: task.project_id,
      taskId: task.id
    });
  }

  function openProjectWorkspace(group: ProjectTodoGroup) {
    void window.workshopDesktop.openSticky(group.project.id);
    void window.workshopDesktop.openPersonalRecord({
      scopeType: "project",
      projectId: group.project.id,
      projectName: group.projectName
    });
  }

  function openProjectRecord(group: ProjectTodoGroup) {
    void window.workshopDesktop.openPersonalRecord({
      scopeType: "project",
      projectId: group.project.id,
      projectName: group.projectName
    });
  }

  function getRecordDraftTargetFromContext(): PersonalRecordTarget | undefined {
    if (activeRecord?.scopeType === "project" || activeRecord?.scopeType === "task") {
      return {
        scopeType: activeRecord.scopeType,
        projectId: activeRecord.projectId,
        projectName: activeRecord.projectName,
        taskId: activeRecord.taskId,
        taskTitle: activeRecord.taskTitle
      };
    }

    if (recordListContext.scopeType === "project") {
      return {
        scopeType: "project",
        projectId: recordListContext.projectId,
        projectName: recordListContext.projectName
      };
    }

    return undefined;
  }

  async function handleNewRecord() {
    const draftTarget = getRecordDraftTargetFromContext();
    if (activeRecordRef.current && recordDirtyRef.current) {
      const saved = await saveRecordNow();
      if (!saved && recordDirtyRef.current) {
        return;
      }
    }

    void window.workshopDesktop.openPersonalRecord({
      ...draftTarget,
      draft: true
    });
  }

  async function saveRecordScope(nextRecord: PersonalRecord) {
    const latestBody = recordBodyRef.current;
    const nextActiveRecord = { ...nextRecord, bodyMarkdown: latestBody, status: "active" as const };
    activeRecordRef.current = nextActiveRecord;
    setActiveRecord(nextActiveRecord);
    setRecordListContext(getRecordListContext(nextActiveRecord));
    setRecordScopePickerOpen(false);
    setRecordProjectQuery("");
    setRecordSaveStatus("idle");

    if (!nextRecord.id && !latestBody.trim()) {
      recordDirtyRef.current = false;
      setRecordDirty(false);
      return;
    }

    recordDirtyRef.current = true;
    setRecordDirty(true);
    await saveRecordNow();
  }

  async function assignRecordToProject(project: Project, projectName: string) {
    const now = new Date().toISOString();
    const baseRecord = activeRecordRef.current ?? {
      id: "",
      title: "项目想法",
      scopeType: "none" as PersonalRecordScope,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
      bodyMarkdown: ""
    };
    await saveRecordScope({
      ...baseRecord,
      status: "active",
      scopeType: "project",
      projectId: project.id,
      projectName,
      taskId: undefined,
      taskTitle: undefined,
      updatedAt: now,
      bodyMarkdown: recordBodyRef.current
    });
  }

  async function deleteActiveRecord() {
    const initialRecord = activeRecordRef.current;
    const deleteLabel = initialRecord?.scopeType === "task" ? "删除这条备注？" : "删除这条记录？";
    if (initialRecord?.id && !window.confirm(deleteLabel)) {
      return;
    }

    if (recordSaveTimerRef.current) {
      window.clearTimeout(recordSaveTimerRef.current);
      recordSaveTimerRef.current = null;
    }
    recordSaveQueuedRef.current = false;
    if (recordSaveInFlightRef.current) {
      await recordSaveInFlightRef.current;
    }
    const recordToDelete = activeRecordRef.current ?? initialRecord;
    if (!recordToDelete?.id) {
      await window.workshopDesktop.closeWindow();
      return;
    }

    await window.workshopDesktop.deletePersonalRecord(recordToDelete.id);
    await window.workshopDesktop.closeWindow();
  }

  async function saveRecordAsCompleted(record: PersonalRecord) {
    return window.workshopDesktop.savePersonalRecord({
      id: record.id || undefined,
      bodyMarkdown: record.bodyMarkdown,
      scopeType: record.scopeType,
      status: "completed",
      projectId: record.projectId,
      projectName: record.projectName,
      taskId: record.taskId,
      taskTitle: record.taskTitle,
      promotedTaskId: record.promotedTaskId
    });
  }

  async function completeRecord(record: PersonalRecordMeta) {
    markRecordCompletionFeedback(record.id, () => void loadRecords());
    setRecordMessage("");

    try {
      const fullRecord = await window.workshopDesktop.getPersonalRecord(record.id);
      if (!fullRecord) {
        clearRecordCompletionFeedback();
        await loadRecords();
        return;
      }

      await saveRecordAsCompleted(fullRecord);
    } catch (nextError) {
      clearRecordCompletionFeedback();
      setRecordMessage(nextError instanceof Error ? nextError.message : "完成失败");
    }
  }

  async function completeActiveRecord() {
    const initialRecord = activeRecordRef.current;
    if (!initialRecord) {
      return;
    }

    markRecordCompletionFeedback(initialRecord.id || "active-record");
    setRecordMessage("");

    try {
      if (recordSaveTimerRef.current) {
        window.clearTimeout(recordSaveTimerRef.current);
        recordSaveTimerRef.current = null;
      }

      if (recordSaveInFlightRef.current) {
        const saved = await recordSaveInFlightRef.current;
        if (!saved && recordDirtyRef.current) {
          clearRecordCompletionFeedback();
          return;
        }
      }

      const recordToComplete = activeRecordRef.current ?? initialRecord;
      const bodyToComplete = recordBodyRef.current;
      if (!recordToComplete.id && !bodyToComplete.trim()) {
        clearRecordCompletionFeedback();
        await window.workshopDesktop.closeWindow();
        return;
      }

      const completed = await saveRecordAsCompleted({
        ...recordToComplete,
        bodyMarkdown: bodyToComplete,
        status: "completed"
      });
      activeRecordRef.current = completed;
      recordBodyRef.current = completed.bodyMarkdown;
      recordDirtyRef.current = false;
      setActiveRecord(completed);
      setRecordBody(completed.bodyMarkdown);
      setRecordDirty(false);
      setRecordSaveStatus("saved");
      setRecordMessage("");
      markRecordCompletionFeedback(completed.id);
      await new Promise((resolve) => window.setTimeout(resolve, recordCompleteAnimationMs));
      await window.workshopDesktop.closeWindow();
    } catch (nextError) {
      clearRecordCompletionFeedback();
      setRecordMessage(nextError instanceof Error ? nextError.message : "完成失败");
    }
  }

  async function createTaskFromRecord() {
    const saved = recordDirtyRef.current ? await saveRecordNow() : activeRecordRef.current;
    if (!saved?.projectId) {
      setRecordMessage("需要先关联项目");
      return;
    }

    setRecordMessage("");
    try {
      const createdTask = await api<Task>("POST", "/tasks", {
        body: {
          project_id: saved.projectId,
          content: deriveRecordTitle(recordBodyRef.current, saved.title)
        }
      });
      if (saved.id) {
        await window.workshopDesktop.savePersonalRecord({
          id: saved.id,
          bodyMarkdown: saved.bodyMarkdown,
          scopeType: saved.scopeType,
          status: "promoted",
          projectId: saved.projectId,
          projectName: saved.projectName,
          taskId: saved.taskId,
          taskTitle: saved.taskTitle,
          promotedTaskId: createdTask.id
        });
      }

      const now = new Date().toISOString();
      await window.workshopDesktop.notifyTaskChanged({
        id: createdTask.id,
        projectId: createdTask.project_id,
        state: createdTask.state,
        updatedAt: createdTask.updated_at || now,
        completionAt: createdTask.completion_at ?? null
      });

      setRecordMessage("");
      await loadRecords();
      await window.workshopDesktop.openSticky({
        projectId: createdTask.project_id,
        taskId: createdTask.id
      });
      await window.workshopDesktop.closeWindow();
    } catch (nextError) {
      setRecordMessage(nextError instanceof Error ? nextError.message : "转任务失败");
    }
  }

  async function sendActiveRecordToCodex() {
    const initialRecord = activeRecordRef.current;
    if (!initialRecord) {
      return;
    }

    setRecordMessage("");
    try {
      if (recordSaveTimerRef.current) {
        window.clearTimeout(recordSaveTimerRef.current);
        recordSaveTimerRef.current = null;
      }

      const saved = recordDirtyRef.current || !initialRecord.id ? await saveRecordNow() : initialRecord;
      if (!saved) {
        setRecordMessage("记录为空");
        return;
      }
      if (!saved.projectId) {
        setRecordMessage("需要先关联项目");
        return;
      }

      const sendResult = await window.workshopDesktop.sendToCodex({
        kind: "record",
        projectId: saved.projectId,
        projectName: saved.projectName,
        recordId: saved.id,
        title: deriveRecordTitle(recordBodyRef.current, saved.title),
        bodyMarkdown: recordBodyRef.current
      });
      setRecordMessage(sendResult.backend === "app-server" ? "已启动 Codex 执行，可在 Codex app 查看" : "后台执行已启动");
    } catch (nextError) {
      setRecordMessage(nextError instanceof Error ? nextError.message : "发送失败");
    }
  }

  async function saveConfig(nextConfig: AppConfig) {
    setIsSavingConfig(true);
    try {
      const saved = await window.workshopDesktop.saveConfig(normalizeConfig(nextConfig));
      setConfig(saved);
      setDraftConfig(saved);
      return saved;
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function handleProjectDirectoryClick(projectId: number, source: "sticky" | "record") {
    const localDirectory = getProjectLocalDirectory(config, projectId);
    if (source === "sticky") {
      setError("");
      setTaskMessage("");
    } else {
      setRecordMessage("");
    }

    try {
      if (localDirectory) {
        await window.workshopDesktop.openProjectLocalDirectory(projectId);
        return;
      }

      const saved = await window.workshopDesktop.bindProjectLocalDirectory(projectId);
      if (saved) {
        setConfig(saved);
        setDraftConfig(saved);
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "本地目录操作失败";
      if (source === "sticky") {
        setError(message);
      } else {
        setRecordMessage(message);
      }
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftConfig) {
      return;
    }

    setError("");
    setIsLoggingIn(true);

    try {
      const saved = await saveConfig(draftConfig);

      if (saved.authMode === "nebula") {
        const response = await window.workshopDesktop.loginWithCode({
          codeType: loginCodeType,
          target: loginTarget.trim(),
          code: loginCode.trim()
        });

        if (!response.ok) {
          throw new Error(response.error || getErrorMessage(response.body, "登录失败"));
        }

        const loggedInConfig = await window.workshopDesktop.getConfig();
        setConfig(loggedInConfig);
        setDraftConfig(loggedInConfig);
        setLoginCode("");
        return;
      }

      if (isLoggedIn(saved)) {
        await loadData();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "登录失败");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleSendVerification() {
    if (!draftConfig) {
      return;
    }

    const target = loginTarget.trim();
    if (!target) {
      setError(loginCodeType === "email" ? "请先填写邮箱" : "请先填写手机号");
      return;
    }

    setIsSendingCode(true);
    setError("");

    try {
      await saveConfig({ ...draftConfig, authMode: "nebula" });
      const response = await window.workshopDesktop.sendVerification({
        codeType: loginCodeType,
        target
      });

      if (!response.ok) {
        throw new Error(response.error || getErrorMessage(response.body, "验证码发送失败"));
      }

      setSendCooldown(60);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "验证码发送失败");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function updateTaskState(task: EnrichedTask, state: TaskState) {
    setBusyTaskId(task.id);
    setError("");
    setTaskMessage("");

    try {
      const updatedTask = await api<Task>("PUT", `/tasks/${task.id}`, {
        body: { state }
      });
      const now = new Date().toISOString();
      const notice: TaskStateChangeNotice = {
        id: task.id,
        projectId: task.project_id,
        state: updatedTask?.state ?? state,
        updatedAt: updatedTask?.updated_at ?? now,
        completionAt: (updatedTask?.state ?? state) === "completed" ? updatedTask?.completion_at ?? task.completion_at ?? now : task.completion_at ?? null
      };

      applyTaskStateChange(notice, { refreshAfterComplete: notice.state === "completed" });
      await window.workshopDesktop.notifyTaskChanged(notice);

      if (notice.state === "completed" && isSingleTaskSticky) {
        await closeStickyWindow();
        return;
      }

      if (notice.state !== "completed") {
        await loadData();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "更新失败");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleSaveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftConfig) {
      return;
    }

    await saveConfig(draftConfig);
    setSettingsOpen(false);
  }

  async function handleLogout() {
    if (!config) {
      return;
    }

    const saved =
      config.authMode === "nebula"
        ? await window.workshopDesktop.logoutAuth()
        : await window.workshopDesktop.saveConfig({
            ...config,
            accessToken: "",
            refreshToken: "",
            accessTokenExpiresAt: 0,
            refreshTokenExpiresAt: 0,
            userId: "",
            username: "",
            sessionId: ""
          });
    setConfig(saved);
    setDraftConfig(saved);
    setProjects([]);
    setTasks([]);
    setSettingsOpen(false);
  }

  async function handleStickyAlwaysOnTop(enabled: boolean) {
    const saved = await window.workshopDesktop.setStickyAlwaysOnTop(enabled);
    setConfig(saved);
    setDraftConfig(saved);
  }

  async function handleArrangeStickyWindows() {
    await window.workshopDesktop.arrangeStickyWindows();
  }

  const loginReady = draftConfig
    ? draftConfig.authMode === "nebula"
      ? Boolean(loginTarget.trim() && loginCode.trim())
      : canSubmitDirectLogin(draftConfig)
    : false;

  if (!config || !draftConfig) {
    return (
      <main className="app-shell loading-shell">
        <LoaderCircle className="spin" size={22} />
      </main>
    );
  }

  if (surface === "record") {
    const recordHeaderContext =
      activeRecord ||
      (recordListContext.scopeType === "project"
        ? {
            scopeType: "project" as const,
            projectName: recordListContext.projectName
          }
        : { scopeType: "none" as const });
    const recordHeaderTitle = getRecordHeaderTitle(recordHeaderContext, Boolean(activeRecord), visibleRecords.length);
    const activeRecordCompletionId = activeRecord?.id || "active-record";
    const isActiveRecordCompleting = Boolean(activeRecord && recordCompletingId === activeRecordCompletionId);
    const saveLabel =
      isActiveRecordCompleting || activeRecord?.status === "completed"
        ? "已完成"
        : recordSaveStatus === "saving"
        ? "保存中"
        : recordSaveStatus === "error"
          ? "保存失败"
          : activeRecord?.id
            ? "已保存"
            : "本地草稿";
    const isTaskNote = activeRecord?.scopeType === "task";
    const canAssignRecordToProject = activeRecord?.scopeType === "none";
    const canPromoteToTask = activeRecord?.scopeType === "project" && Boolean(activeRecord.projectId);
    const isRecordSearchExpanded = recordSearchOpen || hasRecordSearchQuery;

    return (
      <main
        className={`record-shell ${activeRecord ? "record-detail-shell" : "record-list-shell"} ${
          !activeRecord && recordListCollapsed ? "collapsed-shell" : ""
        } ${focusPulseVisible ? "window-focus-pulse" : ""}`}
      >
        <header className="record-titlebar">
          <div className="sticky-drag">
            <button className="sticky-arrange-button" type="button" onClick={() => void handleArrangeStickyWindows()} title="整理便签排列">
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
                  onClick={() => void handleProjectDirectoryClick(recordListContext.projectId as number, "record")}
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
                      onClick={() => void assignRecordToProject(project, projectName)}
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
              <button className="icon-button" type="button" onClick={() => void handleNewRecord()} title="新建">
                <Plus size={15} />
              </button>
            ) : null}
            <button
              className={`icon-button ${config.stickyAlwaysOnTop ? "active-icon" : ""}`}
              type="button"
              onClick={() => void handleStickyAlwaysOnTop(!config.stickyAlwaysOnTop)}
              title={config.stickyAlwaysOnTop ? "取消置顶" : "置顶"}
            >
              {config.stickyAlwaysOnTop ? <Pin size={15} /> : <PinOff size={15} />}
            </button>
            <button className="icon-button" type="button" onClick={() => void closeRecordWindow()} title="关闭">
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
                onChange={(event) => {
                  const nextBody = event.target.value;
                  recordBodyRef.current = nextBody;
                  recordDirtyRef.current = true;
                  setRecordBody(nextBody);
                  setRecordDirty(true);
                  setRecordSaveStatus("idle");
                }}
                onBlur={() => void saveRecordNow()}
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
                <button
                  type="button"
                  className={recordMode === "edit" ? "active" : ""}
                  onClick={() => setRecordMode("edit")}
                  title="编辑"
                >
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
                  onClick={() => void sendActiveRecordToCodex()}
                  disabled={!activeRecord?.projectId}
                  title={activeRecord?.projectId ? "发送到 Codex" : "需要先关联项目"}
                >
                  <SquareTerminal size={15} />
                </button>
                <button
                  className={`record-action-button complete ${isActiveRecordCompleting ? "active" : ""}`}
                  type="button"
                  onClick={() => void completeActiveRecord()}
                  disabled={isActiveRecordCompleting}
                  title={isActiveRecordCompleting ? "已完成" : "完成"}
                >
                  <Check size={16} strokeWidth={3} />
                </button>
                {canPromoteToTask ? (
                  <button className="record-action-button" type="button" onClick={() => void createTaskFromRecord()} title="转为任务">
                    <Send size={15} />
                  </button>
                ) : null}
                <button className="record-action-button danger" type="button" onClick={() => void deleteActiveRecord()} title="删除">
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
                <button
                  className="record-complete-button"
                  type="button"
                  onClick={() => void completeRecord(record)}
                  disabled={recordCompletingId === record.id}
                  title="完成"
                >
                  <Check size={18} strokeWidth={3} />
                </button>
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
                </button>
              </div>
            ))}
          </section>
        ) : null}
      </main>
    );
  }

  if (!isLoggedIn(config)) {
    if (surface === "sticky") {
      return (
        <main className={`sticky-shell ${isSingleTaskSticky ? "single-task-shell" : "sticky-list-shell"} ${focusPulseVisible ? "window-focus-pulse" : ""}`}>
          <header className="sticky-titlebar">
            <div className="sticky-drag">
              <button className="sticky-arrange-button" type="button" onClick={() => void handleArrangeStickyWindows()} title="整理便签排列">
                <GripVertical size={15} />
              </button>
              <h1>待办便签</h1>
            </div>
            <button className="icon-button" type="button" onClick={() => void closeStickyWindow()} title="关闭">
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

    return (
      <main className="app-shell login-shell">
        <section className="login-panel">
          <div className="login-mark">
            <WorkshopMark />
          </div>
          <div>
            <div className="eyebrow">Workshop</div>
            <h1>登录</h1>
          </div>
          <form className="login-form" onSubmit={(event) => void handleLogin(event)}>
            <AuthFields draftConfig={draftConfig} setDraftConfig={setDraftConfig} />
            {draftConfig.authMode === "nebula" ? (
              <div className="nebula-login-fields">
                <div className="segmented code-type-switch" aria-label="验证码类型">
                  <button
                    type="button"
                    className={loginCodeType === "email" ? "active" : ""}
                    onClick={() => setLoginCodeType("email")}
                  >
                    邮箱
                  </button>
                  <button
                    type="button"
                    className={loginCodeType === "sms" ? "active" : ""}
                    onClick={() => setLoginCodeType("sms")}
                  >
                    手机号
                  </button>
                </div>
                <label>
                  <span>{loginCodeType === "email" ? "邮箱" : "手机号"}</span>
                  <input
                    value={loginTarget}
                    onChange={(event) => setLoginTarget(event.target.value)}
                    type={loginCodeType === "email" ? "email" : "tel"}
                    autoComplete={loginCodeType === "email" ? "email" : "tel"}
                    placeholder={loginCodeType === "email" ? "your-email@example.com" : "13800138000"}
                  />
                </label>
                <div className="verification-row">
                  <label>
                    <span>验证码</span>
                    <input
                      value={loginCode}
                      onChange={(event) => setLoginCode(event.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6 位验证码"
                    />
                  </label>
                  <button
                    className="secondary-button code-button"
                    type="button"
                    onClick={() => void handleSendVerification()}
                    disabled={isSendingCode || isSavingConfig || sendCooldown > 0 || !loginTarget.trim()}
                  >
                    {isSendingCode ? <LoaderCircle className="spin" size={16} /> : null}
                    <span>{sendCooldown > 0 ? `${sendCooldown}s` : "发送验证码"}</span>
                  </button>
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="notice" role="alert">
                <WifiOff size={16} />
                <span>{error}</span>
              </div>
            ) : null}
            <button className="save-button" type="submit" disabled={isSavingConfig || isLoggingIn || !loginReady}>
              {isSavingConfig || isLoggingIn ? <LoaderCircle className="spin" size={16} /> : <LogIn size={16} />}
              <span>{draftConfig.authMode === "nebula" ? "登录" : "进入待办"}</span>
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (surface === "sticky") {
    const isStickyContentCollapsed = stickyListCollapsed && !isSingleTaskSticky;
    const stickyHeader = getStickyHeader({
      filteredTaskCount: filteredTasks.length,
      isSingleTaskSticky,
      projectFilter,
      selectedProjectName,
      selectedTask
    });
    const stickyProjectId = !isSingleTaskSticky && projectFilter !== "all" ? Number(projectFilter) : undefined;

    return (
      <main className={`sticky-shell ${isSingleTaskSticky ? "single-task-shell" : "sticky-list-shell"} ${isStickyContentCollapsed ? "collapsed-shell" : ""} ${focusPulseVisible ? "window-focus-pulse" : ""}`}>
        <header className="sticky-titlebar">
          <div className="sticky-drag">
            <button className="sticky-arrange-button" type="button" onClick={() => void handleArrangeStickyWindows()} title="整理便签排列">
              <GripVertical size={15} />
            </button>
            <div className="sticky-title-copy">
              <div className="window-title-line">
                <WindowHeaderTitle title={stickyHeader} />
              </div>
              {stickyProjectId !== undefined && Number.isFinite(stickyProjectId) ? (
                <ProjectDirectorySubtitle
                  localDirectory={getProjectLocalDirectory(config, stickyProjectId)}
                  onClick={() => void handleProjectDirectoryClick(stickyProjectId, "sticky")}
                />
              ) : null}
            </div>
          </div>
          <div className="sticky-actions">
            {!isSingleTaskSticky && selectedProjectName && projectFilter !== "all" ? (
              <button
                className="icon-button"
                type="button"
                onClick={() =>
                  void window.workshopDesktop.openPersonalRecord({
                    scopeType: "project",
                    projectId: Number(projectFilter),
                    projectName: selectedProjectName
                  })
                }
                title="记项目"
              >
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
              onClick={() => void handleStickyAlwaysOnTop(!config.stickyAlwaysOnTop)}
              title={config.stickyAlwaysOnTop ? "取消置顶" : "置顶"}
            >
              {config.stickyAlwaysOnTop ? <Pin size={15} /> : <PinOff size={15} />}
            </button>
            <button className="icon-button" type="button" onClick={() => void closeStickyWindow()} title="关闭">
              <X size={16} />
            </button>
          </div>
        </header>

        {taskMessage && !isStickyContentCollapsed ? (
          <div className="notice sticky-notice success" role="status">
            <SquareTerminal size={16} />
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
                  onNoteBlur={() => void saveTaskNoteNow()}
                  onNoteChange={(body) => {
                    taskNoteBodyRef.current = body;
                    taskNoteDirtyRef.current = true;
                    setTaskNoteBody(body);
                    setTaskNoteDirty(true);
                  }}
                  onSendToCodex={(task) => void sendTaskToCodex(task)}
                  onUpdate={(nextTask, state) => void updateTaskState(nextTask, state)}
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
                    recordId={taskRecordsByTaskId.get(task.id)?.id}
                    onExtract={canExtractTasks ? extractTaskToSticky : undefined}
                    onOpen={openTaskDetail}
                    onRecord={openTaskDetail}
                    onUpdate={(nextTask, state) => void updateTaskState(nextTask, state)}
                  />
                ))}
              </>
            )}
          </section>
        ) : null}
      </main>
    );
  }

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
          <button className="icon-button" type="button" onClick={() => void loadData()} title="刷新" data-tooltip="刷新">
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

      <section className="project-menu-list" aria-label="项目列表">
        {isLoading && projects.length === 0 ? (
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
            onHover={showProjectTaskPreview}
            onOpen={openProjectWorkspace}
            onRecord={openProjectRecord}
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

            <form onSubmit={(event) => void handleSaveConfig(event)}>
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

              <button className="save-button" type="submit" disabled={isSavingConfig}>
                {isSavingConfig ? <LoaderCircle className="spin" size={16} /> : <CalendarClock size={16} />}
                <span>保存并同步</span>
              </button>
              <button className="logout-button" type="button" onClick={() => void handleLogout()}>
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
