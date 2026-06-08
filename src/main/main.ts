import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
  type MenuItemConstructorOptions
} from "electron";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ApiRequest,
  ApiResponse,
  AppConfig,
  AuthTokens,
  LoginPayload,
  LoginRequest,
  PersonalRecord,
  PersonalRecordMeta,
  PersonalRecordScope,
  PersonalRecordStatus,
  PersonalRecordTarget,
  SavePersonalRecordRequest,
  StickyTarget,
  TaskPreviewRequest,
  TaskState,
  VerificationRequest,
  WindowFitRequest
} from "../shared/types";

const defaultConfig: AppConfig = {
  baseUrl: "https://api.feitianchengzi.com",
  serviceName: "workshop",
  authMode: "nebula",
  accessToken: "",
  refreshToken: "",
  tokenType: "Bearer",
  accessTokenExpiresAt: 0,
  refreshTokenExpiresAt: 0,
  userId: "",
  username: "",
  appId: "workshop-desktop",
  sessionId: "",
  dailyRefreshEnabled: false,
  dailyRefreshTime: "09:00",
  stickyAlwaysOnTop: true,
  showDockIcon: true,
  globalShortcutEnabled: true
};

const PANEL_SHORTCUT_ACCELERATOR = "CommandOrControl+Alt+W";

let tray: Tray | null = null;
let windowRef: BrowserWindow | null = null;
const stickyWindows = new Set<BrowserWindow>();
const stickyWindowTargets = new Map<BrowserWindow, NormalizedStickyTarget>();
const recordWindows = new Set<BrowserWindow>();
let taskPreviewWindowRef: BrowserWindow | null = null;
let taskPreviewHideTimer: NodeJS.Timeout | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let tokenRefreshInProgress: Promise<AppConfig> | null = null;
let isQuitting = false;
let registeredPanelShortcut = false;

const configPath = () => path.join(app.getPath("userData"), "config.json");

function bundledResourcePath(fileName: string) {
  return app.isPackaged ? path.join(process.resourcesPath, fileName) : path.join(process.cwd(), "resources", fileName);
}

function loadBundledImage(fileName: string) {
  const imagePaths = app.isPackaged
    ? [bundledResourcePath(fileName)]
    : [
        bundledResourcePath(fileName),
        path.join(app.getAppPath(), "resources", fileName),
        path.join(__dirname, "../../resources", fileName)
      ];
  for (const imagePath of imagePaths) {
    const image = nativeImage.createFromPath(imagePath);
    if (!image.isEmpty()) {
      return image;
    }
  }
  throw new Error(`Bundled image is missing or unreadable: ${imagePaths.join(", ")}`);
}

async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const saved = JSON.parse(raw) as Partial<AppConfig>;
    return sanitizeConfig({ ...defaultConfig, ...saved });
  } catch {
    return defaultConfig;
  }
}

async function saveConfig(next: Partial<AppConfig>): Promise<AppConfig> {
  const current = await readConfig();
  const merged = sanitizeConfig({ ...current, ...next });
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(merged, null, 2), "utf8");
  if (app.isReady()) {
    applyDockVisibility(merged);
    registerPanelShortcut(merged);
    scheduleDailyRefresh(merged);
  }
  return merged;
}

function sanitizeConfig(config: AppConfig): AppConfig {
  const authMode = ["nebula", "bearer", "debugHeaders"].includes(config.authMode)
    ? config.authMode
    : "nebula";
  return {
    ...config,
    authMode,
    baseUrl: (config.baseUrl || defaultConfig.baseUrl).trim().replace(/\/+$/, ""),
    serviceName: (config.serviceName || defaultConfig.serviceName).trim() || defaultConfig.serviceName,
    accessTokenExpiresAt: Number(config.accessTokenExpiresAt) || 0,
    refreshTokenExpiresAt: Number(config.refreshTokenExpiresAt) || 0,
    tokenType: config.tokenType || "Bearer",
    showDockIcon: config.showDockIcon !== false,
    globalShortcutEnabled: config.globalShortcutEnabled !== false
  };
}

function applyDockVisibility(config: AppConfig) {
  if (process.platform !== "darwin") {
    return;
  }

  if (config.showDockIcon) {
    void app.dock?.show();
  } else {
    app.dock?.hide();
  }
}

function unregisterPanelShortcut() {
  if (!registeredPanelShortcut) {
    return;
  }

  globalShortcut.unregister(PANEL_SHORTCUT_ACCELERATOR);
  registeredPanelShortcut = false;
}

function registerPanelShortcut(config: AppConfig) {
  if (!app.isReady()) {
    return;
  }

  unregisterPanelShortcut();
  if (!config.globalShortcutEnabled) {
    return;
  }

  registeredPanelShortcut = globalShortcut.register(PANEL_SHORTCUT_ACCELERATOR, () => {
    showWindow("screen");
  });

  if (!registeredPanelShortcut) {
    console.warn(`Unable to register global shortcut: ${PANEL_SHORTCUT_ACCELERATOR}`);
  }
}

function hasValidLogin(config: AppConfig) {
  if (config.authMode === "nebula" || config.authMode === "bearer") {
    return Boolean(config.accessToken.trim());
  }

  return Boolean(config.userId.trim());
}

function createTrayIcon() {
  const image = loadBundledImage(process.platform === "darwin" ? "tray-iconTemplate.png" : "tray-icon.png");
  if (process.platform === "darwin") {
    image.setTemplateImage(true);
    return image;
  }
  return image.resize({ width: 20, height: 20 });
}

function windowIconOption() {
  if (process.platform === "darwin") {
    return {};
  }
  return { icon: loadBundledImage("app-icon.png") };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 392,
    height: 520,
    minWidth: 392,
    minHeight: 420,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "Workshop Todo",
    backgroundColor: "#f6f6f2",
    ...windowIconOption(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.on("blur", () => {
    setTimeout(() => hideTrayAndPreviewIfUnfocused(), 140);
  });

  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideTaskPreviewWindow();
      win.hide();
    }
  });

  loadRenderer(win, { surface: "tray" });

  return win;
}

function hideTrayAndPreviewIfUnfocused() {
  if (!windowRef || windowRef.webContents.isDevToolsOpened()) {
    return;
  }

  if (
    windowRef.isFocused() ||
    taskPreviewWindowRef?.isFocused() ||
    [...stickyWindows].some((win) => win.isFocused()) ||
    [...recordWindows].some((win) => win.isFocused())
  ) {
    return;
  }

  hideTaskPreviewWindow();
  windowRef.hide();
}

interface RendererLoadOptions {
  surface: "tray" | "sticky" | "record";
  projectId?: number | null;
  taskId?: number | null;
  noteId?: string | null;
  draft?: string | null;
  scopeType?: PersonalRecordScope | null;
  projectName?: string | null;
  taskTitle?: string | null;
}

function appendRendererQuery(searchParams: URLSearchParams, options: RendererLoadOptions) {
  searchParams.set("surface", options.surface);
  if (options.projectId) {
    searchParams.set("project_id", String(options.projectId));
  }
  if (options.taskId) {
    searchParams.set("task_id", String(options.taskId));
  }
  if (options.noteId) {
    searchParams.set("note_id", options.noteId);
  }
  if (options.draft) {
    searchParams.set("draft", options.draft);
  }
  if (options.scopeType) {
    searchParams.set("scope_type", options.scopeType);
  }
  if (options.projectName) {
    searchParams.set("project_name", options.projectName);
  }
  if (options.taskTitle) {
    searchParams.set("task_title", options.taskTitle);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeWindowText(value: unknown, maxLength = 120) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function loadRenderer(win: BrowserWindow, options: RendererLoadOptions) {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    const url = new URL(rendererUrl);
    appendRendererQuery(url.searchParams, options);
    void win.loadURL(url.toString());
  } else {
    const searchParams = new URLSearchParams();
    appendRendererQuery(searchParams, options);
    const query = Object.fromEntries(searchParams.entries());
    void win.loadFile(path.join(__dirname, "../renderer/index.html"), {
      query
    });
  }
}

interface NormalizedStickyTarget {
  projectId: number | null;
  taskId: number | null;
  x: number | null;
  y: number | null;
}

async function createStickyWindow(target: NormalizedStickyTarget) {
  const config = await readConfig();
  const isSingleTaskWindow = target.taskId !== null;
  const win = new BrowserWindow({
    width: 360,
    height: isSingleTaskWindow ? 180 : 520,
    minWidth: 300,
    minHeight: isSingleTaskWindow ? 132 : 360,
    show: false,
    frame: false,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: config.stickyAlwaysOnTop,
    title: "Workshop Todo Note",
    backgroundColor: "#f6f6f2",
    ...windowIconOption(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.on("closed", () => {
    stickyWindows.delete(win);
    stickyWindowTargets.delete(win);
  });

  stickyWindows.add(win);
  stickyWindowTargets.set(win, target);
  loadRenderer(win, { surface: "sticky", projectId: target.projectId, taskId: target.taskId });
  return win;
}

function normalizeStickyTarget(target?: StickyTarget | number): NormalizedStickyTarget {
  if (typeof target === "number" && Number.isFinite(target)) {
    return { projectId: target, taskId: null, x: null, y: null };
  }

  const nextTarget = isPlainObject(target) ? target : undefined;
  return {
    projectId: typeof nextTarget?.projectId === "number" && Number.isFinite(nextTarget.projectId) ? nextTarget.projectId : null,
    taskId: typeof nextTarget?.taskId === "number" && Number.isFinite(nextTarget.taskId) ? nextTarget.taskId : null,
    x: typeof nextTarget?.x === "number" && Number.isFinite(nextTarget.x) ? nextTarget.x : null,
    y: typeof nextTarget?.y === "number" && Number.isFinite(nextTarget.y) ? nextTarget.y : null
  };
}

function findExistingProjectListSticky(target: NormalizedStickyTarget) {
  if (target.projectId === null || target.taskId !== null) {
    return null;
  }

  for (const win of stickyWindows) {
    const windowTarget = stickyWindowTargets.get(win);
    if (!win.isDestroyed() && windowTarget?.projectId === target.projectId && windowTarget.taskId === null) {
      return win;
    }
  }

  return null;
}

async function showStickyWindow(target?: StickyTarget | number) {
  const nextTarget = normalizeStickyTarget(target);
  const existingWin = findExistingProjectListSticky(nextTarget);
  if (existingWin) {
    hideTaskPreviewWindow();
    windowRef?.hide();
    if (existingWin.isMinimized()) {
      existingWin.restore();
    }
    existingWin.show();
    existingWin.focus();
    return;
  }

  const win = await createStickyWindow(nextTarget);
  if (nextTarget.x !== null && nextTarget.y !== null) {
    const bounds = win.getBounds();
    const display = screen.getDisplayNearestPoint({ x: nextTarget.x, y: nextTarget.y });
    const workArea = display.workArea;
    win.setPosition(
      clamp(Math.round(nextTarget.x - 24), workArea.x + 8, workArea.x + workArea.width - bounds.width - 8),
      clamp(Math.round(nextTarget.y - 24), workArea.y + 8, workArea.y + workArea.height - bounds.height - 8),
      false
    );
  } else {
    const bounds = win.getBounds();
    const workArea = screen.getPrimaryDisplay().workArea;
    const offset = (stickyWindows.size % 6) * 22;
    win.setPosition(
      clamp(Math.round(workArea.x + (workArea.width - bounds.width) / 2 + offset), workArea.x + 8, workArea.x + workArea.width - bounds.width - 8),
      clamp(Math.round(workArea.y + (workArea.height - bounds.height) / 2 + offset), workArea.y + 8, workArea.y + workArea.height - bounds.height - 8),
      false
    );
  }

  hideTaskPreviewWindow();
  windowRef?.hide();
  win.show();
  win.focus();
}

const recordsDirPath = () => path.join(app.getPath("userData"), "personal-records");
const recordsIndexPath = () => path.join(recordsDirPath(), "index.json");

function normalizeRecordScope(value: unknown): PersonalRecordScope {
  return value === "project" || value === "task" ? value : "none";
}

function normalizeRecordStatus(value: unknown): PersonalRecordStatus {
  return value === "completed" || value === "promoted" ? value : "active";
}

function normalizeRecordId(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("记录 ID 无效");
  }
  return id;
}

function recordBodyPath(id: string) {
  return path.join(recordsDirPath(), `${normalizeRecordId(id)}.md`);
}

async function readRecordIndex(): Promise<PersonalRecordMeta[]> {
  try {
    const raw = await fs.readFile(recordsIndexPath(), "utf8");
    const parsed = JSON.parse(raw) as { records?: PersonalRecordMeta[] } | PersonalRecordMeta[];
    const records = Array.isArray(parsed) ? parsed : parsed.records;
    return Array.isArray(records)
      ? records
          .filter((record) => record.id && record.title)
          .map((record) => ({
            ...record,
            scopeType: normalizeRecordScope(record.scopeType),
            status: normalizeRecordStatus(record.status)
          }))
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      : [];
  } catch {
    return [];
  }
}

async function writeRecordIndex(records: PersonalRecordMeta[]) {
  await fs.mkdir(recordsDirPath(), { recursive: true });
  const sorted = [...records].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  await fs.writeFile(recordsIndexPath(), JSON.stringify({ records: sorted }, null, 2), "utf8");
}

function truncateRecordTitle(title: string) {
  return title.length > 48 ? `${title.slice(0, 48)}...` : title;
}

function deriveRecordTitle(bodyMarkdown: string, fallback?: string) {
  const firstContentLine = bodyMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const h1Title = firstContentLine?.match(/^#\s+(.+)$/)?.[1]?.replace(/\s+#+$/, "").trim();
  if (h1Title) {
    return truncateRecordTitle(h1Title);
  }

  const title = (firstContentLine || fallback || "未命名记录")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+/, "")
    .trim();
  return truncateRecordTitle(title || fallback || "未命名记录");
}

async function listPersonalRecords() {
  const records = await readRecordIndex();
  return records.filter((record) => record.status === "active");
}

function notifyRecordsChanged() {
  if (windowRef && !windowRef.isDestroyed()) {
    windowRef.webContents.send("record:changed");
  }
  for (const win of stickyWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send("record:changed");
    }
  }
  for (const win of recordWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send("record:changed");
    }
  }
}

async function getPersonalRecord(id: string): Promise<PersonalRecord | null> {
  const safeId = normalizeRecordId(id);
  const records = await readRecordIndex();
  const meta = records.find((record) => record.id === safeId);
  if (!meta) {
    return null;
  }

  let bodyMarkdown = "";
  try {
    bodyMarkdown = await fs.readFile(recordBodyPath(safeId), "utf8");
  } catch {
    bodyMarkdown = "";
  }

  return { ...meta, bodyMarkdown };
}

async function savePersonalRecord(request: SavePersonalRecordRequest): Promise<PersonalRecord> {
  const nextRequest: Record<string, unknown> = isPlainObject(request) ? request : {};
  const bodyMarkdown = typeof nextRequest.bodyMarkdown === "string" ? nextRequest.bodyMarkdown : "";
  const projectId = typeof nextRequest.projectId === "number" && Number.isFinite(nextRequest.projectId) ? nextRequest.projectId : undefined;
  const projectName = safeWindowText(nextRequest.projectName) ?? undefined;
  const taskId = typeof nextRequest.taskId === "number" && Number.isFinite(nextRequest.taskId) ? nextRequest.taskId : undefined;
  const taskTitle = safeWindowText(nextRequest.taskTitle) ?? undefined;
  const promotedTaskId =
    typeof nextRequest.promotedTaskId === "number" && Number.isFinite(nextRequest.promotedTaskId) ? nextRequest.promotedTaskId : undefined;
  const records = await readRecordIndex();
  const scopeType = normalizeRecordScope(nextRequest.scopeType);
  const existingTaskRecord =
    !nextRequest.id && scopeType === "task" && typeof taskId === "number"
      ? records.find((record) => record.status === "active" && record.scopeType === "task" && record.taskId === taskId)
      : undefined;
  const requestId = safeWindowText(nextRequest.id, 80);
  const id = requestId
    ? normalizeRecordId(requestId)
    : existingTaskRecord?.id ?? `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const existing = records.find((record) => record.id === id);
  const now = new Date().toISOString();
  const fallbackTitle = taskTitle || projectName;
  const meta: PersonalRecordMeta = {
    id,
    title: deriveRecordTitle(bodyMarkdown, fallbackTitle),
    scopeType,
    status: normalizeRecordStatus(nextRequest.status ?? existing?.status),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(promotedTaskId ? { promotedTaskId } : existing?.promotedTaskId ? { promotedTaskId: existing.promotedTaskId } : {}),
    ...(scopeType === "project" || scopeType === "task" ? { projectId, projectName } : {}),
    ...(scopeType === "task" ? { taskId, taskTitle } : {})
  };
  const nextRecords = [meta, ...records.filter((record) => record.id !== id)];
  await fs.mkdir(recordsDirPath(), { recursive: true });
  await fs.writeFile(recordBodyPath(id), bodyMarkdown, "utf8");
  await writeRecordIndex(nextRecords);
  notifyRecordsChanged();
  return { ...meta, bodyMarkdown };
}

async function deletePersonalRecord(id: string) {
  const safeId = normalizeRecordId(id);
  const records = await readRecordIndex();
  await writeRecordIndex(records.filter((record) => record.id !== safeId));
  await fs.unlink(recordBodyPath(safeId)).catch(() => undefined);
  notifyRecordsChanged();
}

interface NormalizedRecordTarget {
  noteId: string | null;
  draft: boolean;
  scopeType: PersonalRecordScope;
  projectId: number | null;
  projectName: string | null;
  taskId: number | null;
  taskTitle: string | null;
  x: number | null;
  y: number | null;
}

function normalizeRecordTarget(target?: PersonalRecordTarget): NormalizedRecordTarget {
  const nextTarget = isPlainObject(target) ? target : undefined;
  const noteId = safeWindowText(nextTarget?.noteId, 80);

  return {
    noteId: noteId && /^[a-zA-Z0-9_-]+$/.test(noteId) ? noteId : null,
    draft: nextTarget?.draft === true,
    scopeType: normalizeRecordScope(nextTarget?.scopeType),
    projectId: typeof nextTarget?.projectId === "number" && Number.isFinite(nextTarget.projectId) ? nextTarget.projectId : null,
    projectName: safeWindowText(nextTarget?.projectName),
    taskId: typeof nextTarget?.taskId === "number" && Number.isFinite(nextTarget.taskId) ? nextTarget.taskId : null,
    taskTitle: safeWindowText(nextTarget?.taskTitle),
    x: typeof nextTarget?.x === "number" && Number.isFinite(nextTarget.x) ? nextTarget.x : null,
    y: typeof nextTarget?.y === "number" && Number.isFinite(nextTarget.y) ? nextTarget.y : null
  };
}

async function createRecordWindow(target: NormalizedRecordTarget) {
  const config = await readConfig();
  const opensRecordDetail = Boolean(target.noteId || target.scopeType === "project" || target.scopeType === "task");
  const win = new BrowserWindow({
    width: 360,
    height: opensRecordDetail ? 220 : 480,
    minWidth: 320,
    minHeight: opensRecordDetail ? 188 : 360,
    show: false,
    frame: false,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: config.stickyAlwaysOnTop,
    title: "Workshop Personal Record",
    backgroundColor: "#f6f6f2",
    ...windowIconOption(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.on("closed", () => {
    recordWindows.delete(win);
  });

  recordWindows.add(win);
  loadRenderer(win, {
    surface: "record",
    noteId: target.noteId,
    draft: target.draft ? "1" : null,
    scopeType: target.scopeType,
    projectId: target.projectId,
    projectName: target.projectName,
    taskId: target.taskId,
    taskTitle: target.taskTitle
  });
  return win;
}

async function showPersonalRecordWindow(target?: PersonalRecordTarget) {
  const nextTarget = normalizeRecordTarget(target);
  if (nextTarget.scopeType === "task" && nextTarget.projectId !== null && nextTarget.taskId !== null) {
    await showStickyWindow({
      projectId: nextTarget.projectId,
      taskId: nextTarget.taskId,
      x: nextTarget.x ?? undefined,
      y: nextTarget.y ?? undefined
    });
    return;
  }

  if (nextTarget.noteId) {
    const record = await getPersonalRecord(nextTarget.noteId);
    if (record?.scopeType === "task" && typeof record.projectId === "number" && typeof record.taskId === "number") {
      await showStickyWindow({
        projectId: record.projectId,
        taskId: record.taskId,
        x: nextTarget.x ?? undefined,
        y: nextTarget.y ?? undefined
      });
      return;
    }
  }

  const win = await createRecordWindow(nextTarget);
  if (nextTarget.x !== null && nextTarget.y !== null) {
    const bounds = win.getBounds();
    const display = screen.getDisplayNearestPoint({ x: nextTarget.x, y: nextTarget.y });
    const workArea = display.workArea;
    win.setPosition(
      clamp(Math.round(nextTarget.x - 24), workArea.x + 8, workArea.x + workArea.width - bounds.width - 8),
      clamp(Math.round(nextTarget.y - 24), workArea.y + 8, workArea.y + workArea.height - bounds.height - 8),
      false
    );
  } else {
    const bounds = win.getBounds();
    const workArea = screen.getPrimaryDisplay().workArea;
    const offset = (recordWindows.size % 6) * 22;
    win.setPosition(
      clamp(Math.round(workArea.x + (workArea.width - bounds.width) / 2 + offset), workArea.x + 8, workArea.x + workArea.width - bounds.width - 8),
      clamp(Math.round(workArea.y + (workArea.height - bounds.height) / 2 + offset), workArea.y + 8, workArea.y + workArea.height - bounds.height - 8),
      false
    );
  }

  hideTaskPreviewWindow();
  windowRef?.hide();
  win.show();
  win.focus();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const previewStateClass: Record<TaskState, string> = {
  pending: "pending",
  in_progress: "progress",
  pending_review: "review",
  completed: "done",
  accepted: "done",
  cancelled: "muted",
  blocked: "blocked"
};

function renderTaskPreviewHtml(request: TaskPreviewRequest) {
  const tasks = request.tasks.slice(0, 8);
  const overflowCount = Math.max(0, request.count - tasks.length);
  const taskItems =
    tasks.length > 0
      ? tasks
          .map((task) => {
            const stateClass = previewStateClass[task.state] ?? "pending";
            return `<li><button type="button" data-project-id="${task.projectId}" data-task-id="${task.id}"><span class="dot ${stateClass}"></span><span class="title">${escapeHtml(task.content)}</span><span class="state">${escapeHtml(task.stateLabel)}</span></button></li>`;
          })
          .join("")
      : `<div class="empty">无未完成任务</div>`;
  const more = overflowCount > 0 ? `<div class="more">还有 ${overflowCount} 条</div>` : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
body {
  color: #1d1f22;
  font-family: "Aptos", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.menu {
  width: 100%;
  min-height: 100%;
  padding: 7px;
  border: 1px solid rgba(30, 36, 34, 0.12);
  border-radius: 10px;
  background: rgba(247, 247, 244, 0.98);
  box-shadow: 0 12px 34px rgba(30, 36, 34, 0.22);
}
ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  min-height: 30px;
}
button {
  width: 100%;
  min-height: 30px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: default;
}
button:hover, button:focus-visible {
  background: #3478f6;
  color: #fff;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #6f7f86;
}
.dot.progress { background: #266954; }
.dot.review { background: #815f2c; }
.dot.done { background: #487857; }
.dot.muted { background: #9b9f9c; }
.dot.blocked { background: #a64232; }
.title {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 610;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.state, .more, .empty {
  color: #68706c;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
}
button:hover .state, button:focus-visible .state {
  color: rgba(255, 255, 255, 0.86);
}
.more {
  padding: 5px 8px 0 27px;
}
.empty {
  padding: 14px 4px 5px;
}
</style>
</head>
<body>
  <main class="menu">
    ${tasks.length > 0 ? `<ul>${taskItems}</ul>` : taskItems}
    ${more}
  </main>
  <script>
    const bridge = window.workshopDesktop;
    document.body.addEventListener("mouseenter", () => {
      void bridge?.keepTaskPreview?.();
    });
    document.body.addEventListener("mouseleave", () => {
      void bridge?.hideTaskPreview?.();
    });
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-task-id]") : null;
      if (!target) {
        return;
      }
      const projectId = Number(target.getAttribute("data-project-id"));
      const taskId = Number(target.getAttribute("data-task-id"));
      if (Number.isFinite(projectId) && Number.isFinite(taskId)) {
        void bridge?.openSticky?.({ projectId, taskId });
      }
    });
  </script>
</body>
</html>`;
}

function createTaskPreviewWindow() {
  const win = new BrowserWindow({
    width: 320,
    height: 120,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    focusable: true,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: "#00000000",
    title: "Workshop Todo Preview",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.on("closed", () => {
    taskPreviewWindowRef = null;
  });

  win.on("blur", () => {
    setTimeout(() => {
      if (windowRef?.isFocused() || win.isFocused()) {
        return;
      }
      scheduleTaskPreviewHide(160);
      hideTrayAndPreviewIfUnfocused();
    }, 140);
  });

  return win;
}

function cancelTaskPreviewHide() {
  if (taskPreviewHideTimer) {
    clearTimeout(taskPreviewHideTimer);
    taskPreviewHideTimer = null;
  }
}

function scheduleTaskPreviewHide(delay = 180) {
  cancelTaskPreviewHide();
  taskPreviewHideTimer = setTimeout(() => {
    taskPreviewHideTimer = null;
    hideTaskPreviewWindow();
  }, delay);
}

function hideTaskPreviewWindow() {
  cancelTaskPreviewHide();
  taskPreviewWindowRef?.hide();
}

function showTaskPreviewWindow(request: TaskPreviewRequest) {
  if (!windowRef || !windowRef.isVisible()) {
    return;
  }

  cancelTaskPreviewHide();

  const maxTasks = Math.min(Math.max(request.tasks.length, 1), 8);
  const width = 320;
  const height = Math.min(284, 16 + maxTasks * 32 + (request.count > maxTasks ? 22 : 0));
  const parentBounds = windowRef.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: parentBounds.x + request.anchor.x + request.anchor.width,
    y: parentBounds.y + request.anchor.y
  });
  const workArea = display.workArea;
  const rightX = parentBounds.x + request.anchor.x + request.anchor.width + 8;
  const leftX = parentBounds.x - width - 8;
  const x =
    rightX + width <= workArea.x + workArea.width - 8
      ? rightX
      : clamp(leftX, workArea.x + 8, workArea.x + workArea.width - width - 8);
  const y = clamp(
    Math.round(parentBounds.y + request.anchor.y),
    workArea.y + 8,
    workArea.y + workArea.height - height - 8
  );

  if (!taskPreviewWindowRef) {
    taskPreviewWindowRef = createTaskPreviewWindow();
  }

  taskPreviewWindowRef.setBounds({ x: Math.round(x), y: Math.round(y), width, height }, false);
  void taskPreviewWindowRef.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderTaskPreviewHtml(request))}`);
  taskPreviewWindowRef.showInactive();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function fitWindowContent(win: BrowserWindow, request?: WindowFitRequest) {
  if (!request || typeof request !== "object") {
    return;
  }

  const bounds = win.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const maxAvailableWidth = Math.max(160, workArea.width - 16);
  const maxAvailableHeight = Math.max(56, workArea.height - 16);
  const minWidth = Math.min(Math.max(Math.round(finiteNumber(request.minWidth, bounds.width)), 160), maxAvailableWidth);
  const minHeight = Math.min(Math.max(Math.round(finiteNumber(request.minHeight, 56)), 56), maxAvailableHeight);
  const maxWidth = Math.min(Math.max(Math.round(finiteNumber(request.maxWidth, maxAvailableWidth)), minWidth), maxAvailableWidth);
  const maxHeight = Math.min(Math.max(Math.round(finiteNumber(request.maxHeight, maxAvailableHeight)), minHeight), maxAvailableHeight);
  const width = clamp(Math.round(finiteNumber(request.width, bounds.width)), minWidth, maxWidth);
  const height = clamp(Math.round(finiteNumber(request.height, bounds.height)), minHeight, maxHeight);

  win.setMaximumSize(maxAvailableWidth, maxAvailableHeight);
  win.setMinimumSize(minWidth, minHeight);
  win.setMaximumSize(maxWidth, maxHeight);
  const x = clamp(bounds.x, workArea.x + 8, workArea.x + workArea.width - width - 8);
  const y = clamp(bounds.y, workArea.y + 8, workArea.y + workArea.height - height - 8);

  if (bounds.x !== x || bounds.y !== y || bounds.width !== width || bounds.height !== height) {
    win.setBounds({ x, y, width, height }, false);
  }
}

type WindowOpenSource = "tray" | "screen";

function positionWindowNearTray(win: BrowserWindow) {
  if (!tray) {
    return false;
  }

  const trayBounds = tray.getBounds();
  if (trayBounds.width <= 0 || trayBounds.height <= 0) {
    return false;
  }

  const windowBounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x + trayBounds.width / 2,
    y: trayBounds.y + trayBounds.height / 2
  });
  const workArea = display.workArea;

  const x = clamp(
    Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2),
    workArea.x + 8,
    workArea.x + workArea.width - windowBounds.width - 8
  );
  let y = Math.round(trayBounds.y + trayBounds.height + 8);

  if (process.platform !== "darwin" || y + windowBounds.height > workArea.y + workArea.height) {
    y = Math.round(trayBounds.y - windowBounds.height - 8);
  }

  y = clamp(y, workArea.y + 8, workArea.y + workArea.height - windowBounds.height - 8);
  win.setPosition(x, y, false);
  return true;
}

function positionWindowOnScreen(win: BrowserWindow) {
  const windowBounds = win.getBounds();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = display.workArea;
  const x = clamp(
    Math.round(workArea.x + (workArea.width - windowBounds.width) / 2),
    workArea.x + 8,
    workArea.x + workArea.width - windowBounds.width - 8
  );
  const y = clamp(
    Math.round(workArea.y + (workArea.height - windowBounds.height) / 2),
    workArea.y + 8,
    workArea.y + workArea.height - windowBounds.height - 8
  );
  win.setPosition(x, y, false);
}

function showWindow(source: WindowOpenSource = "tray") {
  if (!windowRef) {
    return;
  }

  hideTaskPreviewWindow();
  if (source === "tray" && positionWindowNearTray(windowRef)) {
    windowRef.show();
    windowRef.focus();
    return;
  }

  positionWindowOnScreen(windowRef);
  windowRef.show();
  windowRef.focus();
}

function toggleWindow() {
  if (!windowRef) {
    return;
  }

  if (windowRef.isVisible()) {
    windowRef.hide();
  } else {
    showWindow();
  }
}

function buildAppEntryMenu(source: WindowOpenSource): MenuItemConstructorOptions[] {
  return [
    {
      label: "显示面板",
      accelerator: PANEL_SHORTCUT_ACCELERATOR,
      click: () => showWindow(source)
    },
    {
      label: "任务便签",
      click: () => void showStickyWindow()
    },
    {
      label: "个人记录",
      click: () => void showPersonalRecordWindow()
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => app.quit()
    }
  ];
}

function configureDockMenu() {
  if (process.platform !== "darwin") {
    return;
  }

  app.dock?.setMenu(Menu.buildFromTemplate(buildAppEntryMenu("screen")));
}

function buildApiUrl(config: AppConfig, request: ApiRequest) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const pathPart = request.path.startsWith("/") ? request.path : `/${request.path}`;
  const url = new URL(`${base}/${config.serviceName}/v1/${request.authLevel ?? "user"}${pathPart}`);

  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value === undefined || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function buildHeaders(config: AppConfig, hasBody: boolean) {
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  if (config.authMode === "nebula" || config.authMode === "bearer") {
    if (config.accessToken.trim()) {
      headers.Authorization = `Bearer ${config.accessToken.trim()}`;
    }
  } else {
    headers["X-User-ID"] = config.userId.trim();
    headers["X-User-Username"] = config.username.trim();
    headers["X-User-AppID"] = config.appId.trim();
    if (config.sessionId.trim()) {
      headers["X-User-SessionID"] = config.sessionId.trim();
    }
  }

  return headers;
}

function tokenExpiresSoon(config: AppConfig) {
  if (!config.accessTokenExpiresAt) {
    return false;
  }

  return config.accessTokenExpiresAt - Date.now() < 5 * 60_000;
}

function refreshTokenExpired(config: AppConfig) {
  return Boolean(config.refreshTokenExpiresAt && config.refreshTokenExpiresAt <= Date.now());
}

function buildServiceUrl(config: AppConfig, serviceName: string, authLevel: string, pathPart: string) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const normalizedPath = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  return new URL(`${base}/${serviceName}/v1/${authLevel}${normalizedPath}`);
}

async function serviceRequest<T>(
  config: AppConfig,
  serviceName: string,
  authLevel: string,
  pathPart: string,
  method: "GET" | "POST",
  body?: unknown,
  authorization?: string
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(buildServiceUrl(config, serviceName, authLevel, pathPart), {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(authorization ? { Authorization: authorization } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : undefined;
    return {
      ok: response.ok && parsed?.success !== false && (!parsed?.code || parsed.code === "OK"),
      status: response.status,
      body: parsed
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "请求失败"
    };
  }
}

function applyNebulaTokens(config: AppConfig, tokens: AuthTokens): AppConfig {
  const issuedAt = Date.now();
  const accessTokenExpiresAt =
    Number(tokens.access_token_expires_at) || (tokens.expires_in ? issuedAt + Number(tokens.expires_in) * 1000 : 0);
  const refreshTokenExpiresAt =
    Number(tokens.refresh_token_expires_at) ||
    (tokens.refresh_expires_in ? issuedAt + Number(tokens.refresh_expires_in) * 1000 : 0);

  return {
    ...config,
    authMode: "nebula",
    accessToken: tokens.access_token || "",
    refreshToken: tokens.refresh_token || "",
    tokenType: "Bearer",
    accessTokenExpiresAt,
    refreshTokenExpiresAt
  };
}

function extractAuthTokens(payload: unknown): AuthTokens | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybe = payload as Partial<AuthTokens> & { tokens?: AuthTokens };
  const tokens = maybe.tokens ?? maybe;
  return tokens.access_token && tokens.refresh_token ? (tokens as AuthTokens) : null;
}

async function sendVerification(request: VerificationRequest): Promise<ApiResponse<{ message?: string }>> {
  const config = await readConfig();
  return serviceRequest(config, "auth-server", "public", "/send_verification", "POST", {
    code_type: request.codeType,
    target: request.target,
    purpose: "login"
  });
}

async function loginWithCode(request: LoginRequest): Promise<ApiResponse<LoginPayload>> {
  const config = await readConfig();
  const body =
    request.codeType === "email"
      ? {
          email: request.target,
          code: request.code,
          code_type: "email",
          purpose: "login"
        }
      : {
          phone: request.target,
          code: request.code,
          code_type: "sms",
          purpose: "login"
        };
  const response = await serviceRequest<LoginPayload>(config, "auth-server", "public", "/login", "POST", body);

  const payload = response.body?.data;
  const tokens = extractAuthTokens(payload?.tokens);
  if (response.ok && payload && tokens) {
    const user = payload.user;
    await saveConfig({
      ...applyNebulaTokens(config, tokens),
      username: user?.username || user?.email || user?.phone || ""
    });
  }

  return response;
}

async function refreshNebulaToken(config: AppConfig): Promise<AppConfig> {
  if (!config.refreshToken.trim() || refreshTokenExpired(config)) {
    throw new Error("登录已过期，请重新登录");
  }

  if (!tokenRefreshInProgress) {
    tokenRefreshInProgress = serviceRequest<AuthTokens>(config, "auth-server", "public", "/refresh_token", "POST", {
      refresh_token: config.refreshToken.trim()
    })
      .then((response) => {
        const tokens = extractAuthTokens(response.body?.data);
        if (!response.ok || !tokens) {
          throw new Error(response.error || response.body?.error?.message || "刷新 token 失败");
        }
        return saveConfig(applyNebulaTokens(config, tokens));
      })
      .finally(() => {
        tokenRefreshInProgress = null;
      });
  }

  return tokenRefreshInProgress;
}

async function logoutAuth() {
  return saveConfig({
    accessToken: "",
    refreshToken: "",
    accessTokenExpiresAt: 0,
    refreshTokenExpiresAt: 0,
    username: ""
  });
}

function parseRefreshTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return { hours: 9, minutes: 0 };
  }

  const hours = clamp(Number(match[1]), 0, 23);
  const minutes = clamp(Number(match[2]), 0, 59);
  return { hours, minutes };
}

function millisecondsUntilNextDailyRun(time: string) {
  const { hours, minutes } = parseRefreshTime(time);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

function notifyRefresh(reason: "manual" | "schedule") {
  windowRef?.webContents.send("workshop:refresh", { reason });
  for (const win of stickyWindows) {
    win.webContents.send("workshop:refresh", { reason });
  }
}

function scheduleDailyRefresh(config: AppConfig) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  if (!config.dailyRefreshEnabled) {
    return;
  }

  refreshTimer = setTimeout(async () => {
    notifyRefresh("schedule");
    scheduleDailyRefresh(await readConfig());
  }, millisecondsUntilNextDailyRun(config.dailyRefreshTime));
}

async function performApiRequest<T>(request: ApiRequest): Promise<ApiResponse<T>> {
  let config = await readConfig();

  if (config.authMode === "nebula" && tokenExpiresSoon(config)) {
    try {
      config = await refreshNebulaToken(config);
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : "刷新 token 失败"
      };
    }
  }

  if ((config.authMode === "nebula" || config.authMode === "bearer") && !config.accessToken.trim()) {
    return { ok: false, status: 0, error: "请先登录或填写访问令牌" };
  }

  if (config.authMode === "debugHeaders" && !config.userId.trim()) {
    return { ok: false, status: 0, error: "请先填写本地调试用户 UUID" };
  }

  try {
    const hasBody = request.body !== undefined;
    let response = await fetch(buildApiUrl(config, request), {
      method: request.method,
      headers: buildHeaders(config, hasBody),
      body: hasBody ? JSON.stringify(request.body) : undefined
    });

    if (response.status === 401 && config.authMode === "nebula" && config.refreshToken.trim()) {
      config = await refreshNebulaToken(config);
      response = await fetch(buildApiUrl(config, request), {
        method: request.method,
        headers: buildHeaders(config, hasBody),
        body: hasBody ? JSON.stringify(request.body) : undefined
      });
    }

    const text = await response.text();
    const body = text ? JSON.parse(text) : undefined;

    return {
      ok: response.ok && body?.success !== false && (!body?.code || body.code === "OK"),
      status: response.status,
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "请求失败"
    };
  }
}

function registerIpc() {
  ipcMain.handle("config:get", () => readConfig());
  ipcMain.handle("config:save", (_event, config: Partial<AppConfig>) => saveConfig(config));
  ipcMain.handle("auth:sendVerification", (_event, request: VerificationRequest) => sendVerification(request));
  ipcMain.handle("auth:loginWithCode", (_event, request: LoginRequest) => loginWithCode(request));
  ipcMain.handle("auth:logout", () => logoutAuth());
  ipcMain.handle("api:request", (_event, request: ApiRequest) => performApiRequest(request));
  ipcMain.handle("shell:openExternal", (_event, url: string) => shell.openExternal(url));
  ipcMain.handle("sticky:open", (_event, target?: StickyTarget | number) => showStickyWindow(target));
  ipcMain.handle("record:open", (_event, target?: PersonalRecordTarget) => showPersonalRecordWindow(target));
  ipcMain.handle("record:list", () => listPersonalRecords());
  ipcMain.handle("record:get", (_event, id: string) => getPersonalRecord(id));
  ipcMain.handle("record:save", (_event, record: SavePersonalRecordRequest) => savePersonalRecord(record));
  ipcMain.handle("record:delete", (_event, id: string) => deletePersonalRecord(id));
  ipcMain.handle("taskPreview:show", (_event, request: TaskPreviewRequest) => showTaskPreviewWindow(request));
  ipcMain.handle("taskPreview:keep", () => cancelTaskPreviewHide());
  ipcMain.handle("taskPreview:hide", () => scheduleTaskPreviewHide());
  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle("sticky:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle("window:fitContent", (event, request: WindowFitRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      fitWindowContent(win, request);
    }
  });
  ipcMain.handle("sticky:setAlwaysOnTop", async (_event, enabled: boolean) => {
    for (const win of stickyWindows) {
      win.setAlwaysOnTop(enabled);
    }
    for (const win of recordWindows) {
      win.setAlwaysOnTop(enabled);
    }
    return saveConfig({ stickyAlwaysOnTop: enabled });
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  showWindow("screen");
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  unregisterPanelShortcut();
});

app.on("activate", () => {
  showWindow("screen");
});

app.whenReady().then(async () => {
  registerIpc();
  const config = await readConfig();
  applyDockVisibility(config);
  configureDockMenu();
  registerPanelShortcut(config);

  windowRef = createWindow();
  tray = new Tray(createTrayIcon());
  tray.setToolTip("Workshop Todo");
  tray.on("click", toggleWindow);
  tray.on("double-click", () => showWindow("tray"));
  tray.on("right-click", () => {
    const menu = Menu.buildFromTemplate([
      {
        label: "刷新",
        click: () => notifyRefresh("manual")
      },
      { type: "separator" },
      ...buildAppEntryMenu("tray")
    ]);
    tray?.popUpContextMenu(menu);
  });

  scheduleDailyRefresh(config);
  if (!hasValidLogin(config)) {
    setTimeout(() => showWindow("screen"), 400);
  }
});

app.on("window-all-closed", () => {
  // Keep the tray process alive after the hidden popover window closes.
});
