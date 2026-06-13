import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
  type MenuItemConstructorOptions,
  type WebContents
} from "electron";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import * as http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { CodexAppServerClient } from "./codexAppServer";
import { buildCodexUserInput } from "./codexPrompt";
import { PersonalRecordStore, normalizeRecordScope } from "./recordStore";
import { AppUpdateService } from "./updateService";
import { WorkshopApiService } from "./workshopApiService";
import type {
  ApiResponse,
  AppUpdateStatus,
  AppConfig,
  CodexRunBackend,
  CodexRunMeta,
  CreateTaskRequest,
  ListProjectsRequest,
  ListTasksRequest,
  LoginRequest,
  Organization,
  OrganizationsPayload,
  PersonalRecord,
  PersonalRecordChangeNotice,
  PersonalRecordMeta,
  PersonalRecordScope,
  PersonalRecordStatus,
  PersonalRecordTarget,
  Project,
  ProjectsPayload,
  SavePersonalRecordRequest,
  SendToCodexRequest,
  SendToCodexResponse,
  StickyTarget,
  Task,
  TaskPreviewRequest,
  TaskStateChangeNotice,
  TaskState,
  TemporaryConfirmationRequest,
  TemporaryConfirmationResult,
  TasksPayload,
  UpdateTaskRequest,
  VerificationRequest,
  WorkshopRefreshEvent,
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
  globalShortcutEnabled: true,
  lastSeenManualRevision: "",
  projectLocalDirectories: {}
};

const PANEL_SHORTCUT_ACCELERATOR = "CommandOrControl+Alt+W";
const NEW_PERSONAL_RECORD_SHORTCUT_ACCELERATOR = "CommandOrControl+Alt+N";
const NOTE_ARRANGE_WIDTH = 360;
const NOTE_ARRANGE_MARGIN = 12;
const NOTE_ARRANGE_GAP = 12;
const NOTE_ARRANGE_LIST_MIN_HEIGHT = 180;
const NOTE_ARRANGE_LIST_COLLAPSED_HEIGHT = 56;
const customUserDataPath = process.env.WORKSHOP_DESKTOP_USER_DATA?.trim();

if (customUserDataPath) {
  app.setPath("userData", customUserDataPath);
}

let tray: Tray | null = null;
let windowRef: BrowserWindow | null = null;
const stickyWindows = new Set<BrowserWindow>();
const stickyWindowTargets = new Map<BrowserWindow, NormalizedStickyTarget>();
const recordWindows = new Set<BrowserWindow>();
const recordWindowTargets = new Map<BrowserWindow, NormalizedRecordTarget>();
let settingsWindowRef: BrowserWindow | null = null;
let manualWindowRef: BrowserWindow | null = null;
let updateWindowRef: BrowserWindow | null = null;
let taskPreviewWindowRef: BrowserWindow | null = null;
let taskPreviewHideTimer: NodeJS.Timeout | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let isQuitting = false;
let registeredPanelShortcut = false;
let registeredNewPersonalRecordShortcut = false;
let appServer: http.Server | null = null;
let appServerInfo: { port: number; token: string; agentToken: string } | null = null;
let appUpdateService: AppUpdateService | null = null;
const temporaryConfirmationWindows = new Map<
  number,
  {
    win: BrowserWindow;
    settle: (result: TemporaryConfirmationResult) => void;
  }
>();

const configPath = () => path.join(app.getPath("userData"), "config.json");
const appServerConnectionPath = () => path.join(app.getPath("userData"), "app-server.json");
const personalRecordStore = new PersonalRecordStore(() => app.getPath("userData"));
const workshopApiService = new WorkshopApiService({ readConfig, saveConfig });

function getAppUpdateService() {
  if (!appUpdateService) {
    appUpdateService = new AppUpdateService(
      sendAppUpdateStatus,
      () => {
        isQuitting = true;
      },
      () => {
        isQuitting = false;
      }
    );
  }
  return appUpdateService;
}

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
    registerGlobalShortcuts(merged);
    scheduleDailyRefresh(merged);
    sendConfigChanged(merged);
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
    globalShortcutEnabled: config.globalShortcutEnabled !== false,
    lastSeenManualRevision: typeof config.lastSeenManualRevision === "string" ? config.lastSeenManualRevision : "",
    projectLocalDirectories: sanitizeProjectLocalDirectories(config.projectLocalDirectories)
  };
}

function sanitizeProjectLocalDirectories(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const directories: Record<string, string> = {};
  for (const [projectId, directory] of Object.entries(value)) {
    if (!/^\d+$/.test(projectId) || typeof directory !== "string") {
      continue;
    }
    const trimmed = directory.trim();
    if (trimmed) {
      directories[projectId] = trimmed;
    }
  }
  return directories;
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

function unregisterGlobalShortcuts() {
  if (registeredPanelShortcut) {
    globalShortcut.unregister(PANEL_SHORTCUT_ACCELERATOR);
    registeredPanelShortcut = false;
  }

  if (registeredNewPersonalRecordShortcut) {
    globalShortcut.unregister(NEW_PERSONAL_RECORD_SHORTCUT_ACCELERATOR);
    registeredNewPersonalRecordShortcut = false;
  }
}

function registerGlobalShortcuts(config: AppConfig) {
  if (!app.isReady()) {
    return;
  }

  unregisterGlobalShortcuts();
  if (!config.globalShortcutEnabled) {
    return;
  }

  registeredPanelShortcut = globalShortcut.register(PANEL_SHORTCUT_ACCELERATOR, () => {
    showWindow("screen");
  });

  if (!registeredPanelShortcut) {
    console.warn(`Unable to register global shortcut: ${PANEL_SHORTCUT_ACCELERATOR}`);
  }

  registeredNewPersonalRecordShortcut = globalShortcut.register(NEW_PERSONAL_RECORD_SHORTCUT_ACCELERATOR, () => {
    void showNewPersonalRecordWindow();
  });

  if (!registeredNewPersonalRecordShortcut) {
    console.warn(`Unable to register global shortcut: ${NEW_PERSONAL_RECORD_SHORTCUT_ACCELERATOR}`);
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
  surface: "tray" | "sticky" | "record" | "settings" | "manual" | "update";
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

interface AppServerRpcRequest {
  method: string;
  params?: unknown;
}

interface CreateRecordParams {
  title?: string | null;
  bodyMarkdown: string;
  scopeType?: PersonalRecordScope;
  projectId?: number;
  projectName?: string;
  taskId?: number;
  taskTitle?: string;
  open?: boolean;
}

interface ListRecordsParams {
  scopeType?: PersonalRecordScope;
  status?: PersonalRecordStatus;
  projectId?: number;
  taskId?: number;
  query?: string;
  limit?: number;
  includeBody?: boolean;
}

interface NormalizedSendToCodexParams {
  kind: "task" | "record";
  backend: CodexRunBackend;
  projectId: number;
  projectName?: string;
  title: string;
  bodyMarkdown?: string;
  taskId?: number;
  recordId?: string;
}

function writeAppServerJson(response: http.ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readAppServerJson(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  let totalLength = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buffer.length;
    if (totalLength > 1024 * 1024) {
      throw new Error("请求体过大");
    }
    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  return body ? JSON.parse(body) : {};
}

function getAppServerBearer(request: http.IncomingMessage) {
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  const tokenHeader = request.headers["x-workshop-desktop-token"];
  return typeof tokenHeader === "string" ? tokenHeader.trim() : "";
}

function normalizeAppServerRecordParams(params: unknown): CreateRecordParams {
  const value = isPlainObject(params) ? params : {};
  const title = safeWindowText(value.title, 200);
  const rawBody = typeof value.bodyMarkdown === "string" ? value.bodyMarkdown : typeof value.body === "string" ? value.body : "";
  const bodyMarkdown = title && !/^#{1,6}\s/.test(rawBody.trim()) ? `# ${title}\n\n${rawBody.trim()}`.trimEnd() : rawBody;
  const scopeType = normalizeRecordScope(value.scopeType);
  const projectId = typeof value.projectId === "number" && Number.isFinite(value.projectId) ? value.projectId : undefined;
  const taskId = typeof value.taskId === "number" && Number.isFinite(value.taskId) ? value.taskId : undefined;

  return {
    title,
    bodyMarkdown: bodyMarkdown.trim() || (title ? `# ${title}` : ""),
    scopeType,
    projectId,
    projectName: safeWindowText(value.projectName) ?? undefined,
    taskId,
    taskTitle: safeWindowText(value.taskTitle) ?? undefined,
    open: value.open === true
  };
}

function normalizePositiveNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} 无效`);
  }
  return Math.trunc(value);
}

function normalizeOptionalPositiveNumber(value: unknown, label: string) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined;
}

function normalizeAppServerRecordListParams(params: unknown): ListRecordsParams {
  const value = isPlainObject(params) ? params : {};
  const scopeType = normalizeRecordScope(value.scopeType ?? value.scope);
  const status =
    value.status === "active" || value.status === "completed" || value.status === "promoted" || value.status === "archived"
      ? value.status
      : undefined;
  const rawLimit = typeof value.limit === "number" && Number.isFinite(value.limit) ? Math.trunc(value.limit) : undefined;

  return {
    ...(value.scopeType || value.scope ? { scopeType } : {}),
    ...(status ? { status } : {}),
    projectId: normalizeOptionalPositiveNumber(value.projectId, "项目 ID"),
    taskId: normalizeOptionalPositiveNumber(value.taskId, "任务 ID"),
    query: safeWindowText(value.query, 200) ?? undefined,
    limit: rawLimit ? clamp(rawLimit, 1, 500) : undefined,
    includeBody: value.includeBody === true
  };
}

function normalizeAppServerRecordGetParams(params: unknown) {
  const value = isPlainObject(params) ? params : {};
  const id = safeWindowText(value.id, 120);
  if (!id) {
    throw new Error("record.get 需要 id");
  }
  return { id };
}

function normalizeTemporaryConfirmationParams(params: unknown): Required<TemporaryConfirmationRequest> {
  const value = isPlainObject(params) ? params : {};
  const html = typeof value.html === "string" ? value.html : "";
  if (!html.trim()) {
    throw new Error("confirmation.open 需要 html");
  }

  return {
    title: safeWindowText(value.title, 120) ?? "确认变更",
    html,
    width: typeof value.width === "number" && Number.isFinite(value.width) ? clamp(Math.trunc(value.width), 420, 1100) : 760,
    height: typeof value.height === "number" && Number.isFinite(value.height) ? clamp(Math.trunc(value.height), 320, 900) : 620
  };
}

function normalizeAppServerListProjectsParams(params: unknown): ListProjectsRequest {
  const value = isPlainObject(params) ? params : {};
  return {
    organizationId: normalizeOptionalPositiveNumber(value.organizationId, "组织 ID"),
    pageSize: normalizeOptionalPositiveNumber(value.pageSize, "pageSize")
  };
}

function normalizeAppServerListTasksParams(params: unknown): ListTasksRequest {
  const value = isPlainObject(params) ? params : {};
  const rawStates = Array.isArray(value.states) ? value.states.filter(isTaskState) : undefined;
  return {
    projectId: normalizePositiveNumber(value.projectId, "项目 ID"),
    states: rawStates && rawStates.length > 0 ? rawStates : undefined,
    pageSize: normalizeOptionalPositiveNumber(value.pageSize, "pageSize")
  };
}

function getApiResponseData<T>(response: ApiResponse<T>): T {
  if (!response.ok) {
    throw new Error(response.error || response.body?.error?.message || `HTTP ${response.status || 0}`);
  }
  return response.body?.data as T;
}

function extractPayloadList<T>(payload: unknown, key: string): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (isPlainObject(payload) && Array.isArray(payload[key])) {
    return payload[key] as T[];
  }
  return [];
}

function extractPayloadTotal(payload: unknown, fallback: number) {
  return isPlainObject(payload) && typeof payload.total === "number" && Number.isFinite(payload.total) ? payload.total : fallback;
}

function mergeProjectsForAppServer(projectGroups: Project[][]) {
  const byId = new Map<number, Project>();
  for (const project of projectGroups.flat()) {
    byId.set(project.id, project);
  }
  return [...byId.values()];
}

function normalizeSendToCodexParams(params: unknown): NormalizedSendToCodexParams {
  const value = isPlainObject(params) ? params : {};
  const projectId = typeof value.projectId === "number" && Number.isFinite(value.projectId) ? value.projectId : NaN;
  const kind = value.kind === "record" ? "record" : value.kind === "task" ? "task" : null;
  const title = safeWindowText(value.title, 300);
  const bodyMarkdown = typeof value.bodyMarkdown === "string" ? value.bodyMarkdown.slice(0, 24_000) : undefined;
  const taskId = typeof value.taskId === "number" && Number.isFinite(value.taskId) ? value.taskId : undefined;
  const recordId = safeWindowText(value.recordId, 120) ?? undefined;

  if (!kind) {
    throw new Error("codex.send 需要 kind 为 task 或 record");
  }
  if (!Number.isFinite(projectId)) {
    throw new Error("codex.send 需要 projectId");
  }
  if (!title && !bodyMarkdown?.trim()) {
    throw new Error("codex.send 需要 title 或 bodyMarkdown");
  }

  return {
    kind,
    backend: value.backend === "exec" ? "exec" : "app-server",
    projectId,
    projectName: safeWindowText(value.projectName) ?? undefined,
    title: title ?? (kind === "task" ? "Workshop 任务" : "Workshop 记录"),
    bodyMarkdown,
    taskId,
    recordId
  };
}

async function getProjectLocalDirectory(projectId: number) {
  const config = await readConfig();
  const directory = config.projectLocalDirectories[String(projectId)]?.trim();
  if (!directory) {
    throw new Error("请先绑定本地目录");
  }

  const stat = await fs.stat(directory).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error("本地目录不存在，请重新绑定");
  }

  return directory;
}

async function resolveCodexExecutable() {
  const candidates = [
    process.env.WORKSHOP_DESKTOP_CODEX_BIN?.trim(),
    "/Applications/Codex.app/Contents/Resources/codex",
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "codex"
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) {
      return candidate;
    }
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return "codex";
}

function codexEnvironment(): NodeJS.ProcessEnv {
  const existingPath = process.env.PATH || "";
  const commonPaths = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
  const pathEntries = new Set([...commonPaths, ...existingPath.split(path.delimiter).filter(Boolean)]);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: [...pathEntries].join(path.delimiter)
  };
  if (appServerInfo) {
    // 受限 token：被派发的 agent 只能回写记录，不能再触发 codex.send。
    env.WORKSHOP_DESKTOP_SERVER_PORT = String(appServerInfo.port);
    env.WORKSHOP_DESKTOP_SERVER_TOKEN = appServerInfo.agentToken;
  }
  return env;
}

const CODEX_RUNS_LIMIT = 100;
let codexRunsQueue: Promise<unknown> = Promise.resolve();
let codexClient: CodexAppServerClient | null = null;

const codexRunsDirPath = () => path.join(app.getPath("userData"), "codex-runs");
const codexRunsIndexPath = () => path.join(codexRunsDirPath(), "index.json");

async function readCodexRuns(): Promise<CodexRunMeta[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(codexRunsIndexPath(), "utf8"));
    return Array.isArray(parsed) ? (parsed as CodexRunMeta[]) : [];
  } catch {
    return [];
  }
}

function notifyCodexRunsChanged(runs: CodexRunMeta[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("codexRuns:changed", runs);
    }
  }
}

function mutateCodexRuns(mutate: (runs: CodexRunMeta[]) => CodexRunMeta[]): Promise<CodexRunMeta[]> {
  const next = codexRunsQueue.then(async () => {
    const runs = mutate(await readCodexRuns()).slice(0, CODEX_RUNS_LIMIT);
    await fs.mkdir(codexRunsDirPath(), { recursive: true });
    const tempPath = `${codexRunsIndexPath()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(runs, null, 2), "utf8");
    await fs.rename(tempPath, codexRunsIndexPath());
    notifyCodexRunsChanged(runs);
    return runs;
  });
  codexRunsQueue = next.catch(() => undefined);
  return next;
}

function upsertCodexRun(run: CodexRunMeta) {
  return mutateCodexRuns((runs) => [run, ...runs.filter((existing) => existing.runId !== run.runId)]);
}

function updateCodexRun(runId: string, patch: Partial<CodexRunMeta>) {
  return mutateCodexRuns((runs) => runs.map((run) => (run.runId === runId ? { ...run, ...patch } : run)));
}

// 应用上次退出时仍在运行的 run 已无法追踪，标记为中断。
function reconcileCodexRunsOnStartup() {
  return mutateCodexRuns((runs) => runs.map((run) => (run.status === "running" ? { ...run, status: "interrupted" } : run)));
}

function getCodexClient() {
  if (!codexClient) {
    codexClient = new CodexAppServerClient({
      resolveExecutable: resolveCodexExecutable,
      buildEnvironment: codexEnvironment,
      clientVersion: app.getVersion(),
      log: (message) => console.warn(`[codex] ${message}`)
    });
  }
  return codexClient;
}

async function sendToCodex(params: unknown): Promise<SendToCodexResponse> {
  const request = normalizeSendToCodexParams(params);
  const localDirectory = await getProjectLocalDirectory(request.projectId);
  const userInput = buildCodexUserInput(request);
  const run: CodexRunMeta = {
    runId: `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
    backend: request.backend,
    kind: request.kind,
    title: request.title,
    projectId: request.projectId,
    projectName: request.projectName,
    taskId: request.taskId,
    recordId: request.recordId,
    cwd: localDirectory,
    status: "running",
    startedAt: new Date().toISOString()
  };

  return request.backend === "exec" ? sendToCodexExec(run, userInput) : sendToCodexAppServer(run, userInput);
}

async function sendToCodexAppServer(run: CodexRunMeta, prompt: string): Promise<SendToCodexResponse> {
  await upsertCodexRun(run);
  let pendingLastMessage = "";
  let lastMessageFlushTimer: NodeJS.Timeout | null = null;
  const flushLastMessage = () => {
    lastMessageFlushTimer = null;
    if (pendingLastMessage) {
      void updateCodexRun(run.runId, { lastMessage: pendingLastMessage.slice(0, 600) });
    }
  };
  const queueLastMessage = (text: string) => {
    pendingLastMessage = text;
    if (!lastMessageFlushTimer) {
      lastMessageFlushTimer = setTimeout(flushLastMessage, 500);
    }
  };
  const takeLastMessage = (detail?: string) => {
    if (lastMessageFlushTimer) {
      clearTimeout(lastMessageFlushTimer);
      lastMessageFlushTimer = null;
    }
    return (detail || pendingLastMessage).slice(0, 600);
  };

  try {
    const { threadId, turnId } = await getCodexClient().startTurn({
      cwd: run.cwd,
      prompt,
      events: {
        onAgentMessage: (text) => {
          queueLastMessage(text);
        },
        onCompleted: (status, detail) => {
          const lastMessage = takeLastMessage(detail);
          void updateCodexRun(run.runId, {
            status,
            completedAt: new Date().toISOString(),
            ...(lastMessage ? { lastMessage } : {})
          });
        }
      }
    });
    await updateCodexRun(run.runId, { threadId, turnId });
    return { localDirectory: run.cwd, runId: run.runId, backend: "app-server", threadId };
  } catch (error) {
    const lastMessage = takeLastMessage(error instanceof Error ? error.message : "codex 启动失败");
    await updateCodexRun(run.runId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      lastMessage
    });
    throw error;
  }
}

async function sendToCodexExec(run: CodexRunMeta, prompt: string): Promise<SendToCodexResponse> {
  const codexBin = await resolveCodexExecutable();
  const outputPath = path.join(codexRunsDirPath(), `${run.runId}.md`);
  await fs.mkdir(codexRunsDirPath(), { recursive: true });
  await upsertCodexRun({ ...run, outputPath });

  const child = spawn(codexBin, ["exec", "-C", run.cwd, "-o", outputPath, prompt], {
    cwd: run.cwd,
    detached: true,
    env: codexEnvironment(),
    stdio: "ignore"
  });
  child.on("exit", (code) => {
    void finalizeCodexExecRun(run.runId, outputPath, code);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => resolve());
      child.once("error", (error) => reject(error));
    });
  } catch (error) {
    await updateCodexRun(run.runId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      lastMessage: error instanceof Error ? error.message : "codex 启动失败"
    });
    throw error;
  }

  child.unref();
  return { localDirectory: run.cwd, runId: run.runId, backend: "exec" };
}

async function finalizeCodexExecRun(runId: string, outputPath: string, code: number | null) {
  let lastMessage = "";
  if (code === 0) {
    const output = await fs.readFile(outputPath, "utf8").catch(() => "");
    lastMessage = output.trim().slice(-600);
  } else {
    lastMessage = `codex exec 退出码 ${String(code)}`;
  }
  await updateCodexRun(runId, {
    status: code === 0 ? "completed" : "failed",
    completedAt: new Date().toISOString(),
    ...(lastMessage ? { lastMessage } : {})
  });
}

type AppServerScope = "full" | "agent";

async function handleAppServerRpc(payload: unknown, scope: AppServerScope) {
  const rpc = isPlainObject(payload) ? (payload as Partial<AppServerRpcRequest>) : {};
  if (rpc.method === "confirmation.open") {
    if (scope !== "full") {
      throw new Error("当前 token 只允许 record.create，不能调用 confirmation.open");
    }
    return openTemporaryConfirmationWindow(rpc.params);
  }

  if (rpc.method === "codex.send") {
    if (scope !== "full") {
      throw new Error("当前 token 只允许 record.create，不能调用 codex.send");
    }
    return sendToCodex(rpc.params);
  }

  if (rpc.method === "record.create") {
    const params = normalizeAppServerRecordParams(rpc.params);
    if (!params.bodyMarkdown.trim()) {
      throw new Error("record.create 需要 title 或 bodyMarkdown");
    }

    const record = await savePersonalRecord({
      bodyMarkdown: params.bodyMarkdown,
      scopeType: params.scopeType ?? "none",
      origin: "agent",
      projectId: params.projectId,
      projectName: params.projectName,
      taskId: params.taskId,
      taskTitle: params.taskTitle
    });

    if (params.open) {
      await showPersonalRecordWindow({ noteId: record.id });
    }

    return { record };
  }

  if (rpc.method === "record.list") {
    if (scope !== "full") {
      throw new Error("当前 token 只允许 record.create，不能调用 record.list");
    }
    return listRecordsForAppServer(rpc.params);
  }

  if (rpc.method === "record.get") {
    if (scope !== "full") {
      throw new Error("当前 token 只允许 record.create，不能调用 record.get");
    }
    return getRecordForAppServer(rpc.params);
  }

  if (rpc.method === "project.list") {
    if (scope !== "full") {
      throw new Error("当前 token 只允许 record.create，不能调用 project.list");
    }
    return listProjectsForAppServer(rpc.params);
  }

  if (rpc.method === "task.list") {
    if (scope !== "full") {
      throw new Error("当前 token 只允许 record.create，不能调用 task.list");
    }
    return listTasksForAppServer(rpc.params);
  }

  throw new Error(`不支持的 app server 方法：${String(rpc.method ?? "")}`);
}

async function startAppServer() {
  if (appServer) {
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const agentToken = crypto.randomBytes(32).toString("hex");
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        writeAppServerJson(response, 200, { ok: true, app: "workshop-desktop" });
        return;
      }

      if (request.method !== "POST" || request.url !== "/rpc") {
        writeAppServerJson(response, 404, { ok: false, error: "not_found" });
        return;
      }

      const bearer = getAppServerBearer(request);
      const scope: AppServerScope | null = bearer === token ? "full" : bearer === agentToken ? "agent" : null;
      if (!scope) {
        writeAppServerJson(response, 401, { ok: false, error: "unauthorized" });
        return;
      }

      const payload = await readAppServerJson(request);
      const result = await handleAppServerRpc(payload, scope);
      writeAppServerJson(response, 200, { ok: true, result });
    } catch (error) {
      writeAppServerJson(response, 400, { ok: false, error: error instanceof Error ? error.message : "app server request failed" });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo | null;
  if (!address?.port) {
    server.close();
    throw new Error("app server failed to bind a local port");
  }

  appServer = server;
  appServerInfo = { port: address.port, token, agentToken };
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(
    appServerConnectionPath(),
    JSON.stringify(
      {
        version: 1,
        host: "127.0.0.1",
        port: address.port,
        token,
        pid: process.pid,
        startedAt: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );
  await fs.chmod(appServerConnectionPath(), 0o600).catch(() => undefined);
}

function stopAppServer() {
  appServer?.close();
  appServer = null;
  appServerInfo = null;
  void fs.unlink(appServerConnectionPath()).catch(() => undefined);
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

function inlineScriptString(value: string) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function renderTemporaryConfirmationHtml(request: Required<TemporaryConfirmationRequest>) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title></title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #1f2428;
        background: #f6f6f2;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr auto;
        background: #f6f6f2;
      }
      header {
        padding: 14px 18px 10px;
        border-bottom: 1px solid rgba(31, 36, 40, 0.1);
        background: rgba(255, 255, 255, 0.76);
      }
      h1 {
        margin: 0;
        font-size: 15px;
        line-height: 1.35;
        font-weight: 650;
      }
      main {
        min-height: 0;
        padding: 12px;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: 1px solid rgba(31, 36, 40, 0.12);
        border-radius: 8px;
        background: #ffffff;
      }
      footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 14px 14px;
        border-top: 1px solid rgba(31, 36, 40, 0.1);
        background: rgba(255, 255, 255, 0.82);
      }
      button {
        min-width: 84px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid rgba(31, 36, 40, 0.16);
        background: #ffffff;
        color: #1f2428;
        font: inherit;
        font-size: 13px;
        font-weight: 560;
        cursor: pointer;
      }
      button:hover {
        background: #f0f1ee;
      }
      .primary {
        border-color: #1f6f5b;
        background: #1f6f5b;
        color: #ffffff;
      }
      .primary:hover {
        background: #185945;
      }
    </style>
  </head>
  <body>
    <header><h1 data-title></h1></header>
    <main><iframe id="content" sandbox></iframe></main>
    <footer>
      <button type="button" data-cancel>取消</button>
      <button type="button" class="primary" data-confirm>确认</button>
    </footer>
    <script>
      const title = ${inlineScriptString(request.title)};
      const html = ${inlineScriptString(request.html)};
      document.title = title;
      document.querySelector("[data-title]").textContent = title;
      document.getElementById("content").srcdoc = html;
      document.querySelector("[data-confirm]").addEventListener("click", () => {
        window.workshopConfirmation.confirm();
      });
      document.querySelector("[data-cancel]").addEventListener("click", () => {
        window.workshopConfirmation.cancel();
      });
    </script>
  </body>
</html>`;
}

function resolveTemporaryConfirmation(sender: WebContents, result: TemporaryConfirmationResult) {
  const state = temporaryConfirmationWindows.get(sender.id);
  if (!state) {
    return result;
  }

  state.settle(result);
  return result;
}

function openTemporaryConfirmationWindow(params: unknown): Promise<TemporaryConfirmationResult> {
  const request = normalizeTemporaryConfirmationParams(params);
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: request.width,
      height: request.height,
      minWidth: 420,
      minHeight: 320,
      show: false,
      frame: true,
      resizable: true,
      movable: true,
      fullscreenable: false,
      skipTaskbar: false,
      title: request.title,
      backgroundColor: "#f6f6f2",
      ...windowIconOption(),
      webPreferences: {
        preload: path.join(__dirname, "confirmationPreload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    const webContentsId = win.webContents.id;
    let settled = false;
    const settle = (result: TemporaryConfirmationResult) => {
      if (settled) {
        return;
      }
      settled = true;
      temporaryConfirmationWindows.delete(webContentsId);
      if (!win.isDestroyed()) {
        win.close();
      }
      resolve(result);
    };

    temporaryConfirmationWindows.set(webContentsId, { win, settle });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.on("closed", () => settle({ confirmed: false, reason: "closed" }));
    win.once("ready-to-show", () => showInCurrentWorkspace(win));
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderTemporaryConfirmationHtml(request))}`).catch(() => {
      settle({ confirmed: false, reason: "closed" });
    });
  });
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

function isSameStickyTarget(a: NormalizedStickyTarget, b: NormalizedStickyTarget) {
  if (a.taskId !== null || b.taskId !== null) {
    return (
      a.taskId !== null &&
      b.taskId !== null &&
      a.taskId === b.taskId &&
      (a.projectId === b.projectId || a.projectId === null || b.projectId === null)
    );
  }

  return a.projectId === b.projectId;
}

function getCursorDisplay() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function getTargetDisplay(x: number | null, y: number | null) {
  return x !== null && y !== null ? screen.getDisplayNearestPoint({ x, y }) : getCursorDisplay();
}

function isWindowOnDisplay(win: BrowserWindow, displayId: number) {
  return screen.getDisplayMatching(win.getBounds()).id === displayId;
}

function showInCurrentWorkspace(win: BrowserWindow) {
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.show();
    win.focus();
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.setVisibleOnAllWorkspaces(false);
      }
    }, 80);
    return;
  }

  win.show();
  win.focus();
}

function findExistingStickyWindow(target: NormalizedStickyTarget, displayId?: number) {
  for (const win of stickyWindows) {
    const windowTarget = stickyWindowTargets.get(win);
    if (!win.isDestroyed() && windowTarget && isSameStickyTarget(windowTarget, target) && (!displayId || isWindowOnDisplay(win, displayId))) {
      return win;
    }
  }

  return null;
}

function pulseWindowFocus(win: BrowserWindow) {
  if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send("window:focusPulse");
  }
}

function focusExistingNoteWindow(win: BrowserWindow) {
  hideTaskPreviewWindow();
  windowRef?.hide();
  if (win.isMinimized()) {
    win.restore();
  }
  showInCurrentWorkspace(win);
  pulseWindowFocus(win);
}

async function showStickyWindow(target?: StickyTarget | number) {
  const nextTarget = normalizeStickyTarget(target);
  const display = getTargetDisplay(nextTarget.x, nextTarget.y);
  const existingWin = findExistingStickyWindow(nextTarget, display.id);
  if (existingWin) {
    focusExistingNoteWindow(existingWin);
    return;
  }

  const win = await createStickyWindow(nextTarget);
  if (nextTarget.x !== null && nextTarget.y !== null) {
    const bounds = win.getBounds();
    const workArea = display.workArea;
    win.setPosition(
      clamp(Math.round(nextTarget.x - 24), workArea.x + 8, workArea.x + workArea.width - bounds.width - 8),
      clamp(Math.round(nextTarget.y - 24), workArea.y + 8, workArea.y + workArea.height - bounds.height - 8),
      false
    );
  } else {
    const bounds = win.getBounds();
    const workArea = display.workArea;
    const offset = (stickyWindows.size % 6) * 22;
    win.setPosition(
      clamp(Math.round(workArea.x + (workArea.width - bounds.width) / 2 + offset), workArea.x + 8, workArea.x + workArea.width - bounds.width - 8),
      clamp(Math.round(workArea.y + (workArea.height - bounds.height) / 2 + offset), workArea.y + 8, workArea.y + workArea.height - bounds.height - 8),
      false
    );
  }

  hideTaskPreviewWindow();
  windowRef?.hide();
  showInCurrentWorkspace(win);
}

async function listPersonalRecords() {
  return personalRecordStore.listVisible();
}

async function listRecordsForAppServer(params: unknown) {
  const options = normalizeAppServerRecordListParams(params);
  const query = options.query?.toLowerCase();
  let records: PersonalRecordMeta[] = await listPersonalRecords();

  if (options.scopeType) {
    records = records.filter((record) => record.scopeType === options.scopeType);
  }
  if (options.status) {
    records = records.filter((record) => record.status === options.status);
  }
  if (options.projectId !== undefined) {
    records = records.filter((record) => record.projectId === options.projectId);
  }
  if (options.taskId !== undefined) {
    records = records.filter((record) => record.taskId === options.taskId);
  }
  if (query) {
    records = records.filter((record) =>
      [record.title, record.projectName, record.taskTitle, record.status, record.scopeType]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }

  const limitedRecords = options.limit ? records.slice(0, options.limit) : records;
  if (!options.includeBody) {
    return { records: limitedRecords, total: records.length };
  }

  const recordsWithBody = await Promise.all(limitedRecords.map((record) => getPersonalRecord(record.id)));
  return { records: recordsWithBody.filter((record): record is PersonalRecord => Boolean(record)), total: records.length };
}

async function getRecordForAppServer(params: unknown) {
  const { id } = normalizeAppServerRecordGetParams(params);
  return { record: await getPersonalRecord(id) };
}

async function listProjectsForAppServer(params: unknown) {
  const request = normalizeAppServerListProjectsParams(params);
  const standalonePayload = getApiResponseData<ProjectsPayload | Project[]>(await workshopApiService.listProjects(request));
  const standaloneProjects = extractPayloadList<Project>(standalonePayload, "projects");

  if (request.organizationId) {
    return { projects: standaloneProjects, total: extractPayloadTotal(standalonePayload, standaloneProjects.length) };
  }

  const organizationsPayload = getApiResponseData<OrganizationsPayload | Organization[]>(await workshopApiService.listOrganizations());
  const organizations = extractPayloadList<Organization>(organizationsPayload, "organizations");
  const organizationProjectGroups = await Promise.all(
    organizations.map(async (organization) => {
      const payload = getApiResponseData<ProjectsPayload | Project[]>(
        await workshopApiService.listProjects({ ...request, organizationId: organization.id })
      );
      return extractPayloadList<Project>(payload, "projects").map((project) => ({
        ...project,
        organization_id: organization.id,
        organizationName: organization.name
      }));
    })
  );
  const projects = mergeProjectsForAppServer([standaloneProjects, ...organizationProjectGroups]);
  return { projects, total: projects.length };
}

async function listTasksForAppServer(params: unknown) {
  const payload = getApiResponseData<TasksPayload | Task[]>(
    await workshopApiService.listTasks(normalizeAppServerListTasksParams(params))
  );
  const tasks = extractPayloadList<Task>(payload, "tasks");
  return { tasks, total: extractPayloadTotal(payload, tasks.length) };
}

function notifyRecordsChanged(notice: PersonalRecordChangeNotice | null = null) {
  if (windowRef && !windowRef.isDestroyed()) {
    windowRef.webContents.send("record:changed", notice);
  }
  for (const win of stickyWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send("record:changed", notice);
    }
  }
  for (const win of recordWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send("record:changed", notice);
    }
  }
}

async function getPersonalRecord(id: string): Promise<PersonalRecord | null> {
  return personalRecordStore.get(id);
}

async function savePersonalRecord(request: SavePersonalRecordRequest): Promise<PersonalRecord> {
  const record = await personalRecordStore.save(request);
  notifyRecordsChanged({ id: record.id, status: record.status, updatedAt: record.updatedAt });
  return record;
}

async function deletePersonalRecord(id: string) {
  const deletedId = await personalRecordStore.delete(id);
  notifyRecordsChanged({ id: deletedId, deleted: true });
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

function isRecordListTarget(target: NormalizedRecordTarget) {
  return !target.noteId && !target.draft && target.scopeType !== "task";
}

function isSameRecordListTarget(a: NormalizedRecordTarget, b: NormalizedRecordTarget) {
  if (!isRecordListTarget(a) || !isRecordListTarget(b) || a.scopeType !== b.scopeType) {
    return false;
  }

  if (a.scopeType === "none") {
    return true;
  }

  if (a.projectId !== null || b.projectId !== null) {
    return a.projectId === b.projectId;
  }

  return Boolean(a.projectName && b.projectName && a.projectName === b.projectName);
}

function findExistingRecordListWindow(target: NormalizedRecordTarget) {
  if (!isRecordListTarget(target)) {
    return null;
  }

  for (const win of recordWindows) {
    const windowTarget = recordWindowTargets.get(win);
    if (!win.isDestroyed() && windowTarget && isSameRecordListTarget(windowTarget, target)) {
      return win;
    }
  }

  return null;
}

function isSameRecordTarget(a: NormalizedRecordTarget, b: NormalizedRecordTarget) {
  if (a.noteId || b.noteId) {
    return Boolean(a.noteId && b.noteId && a.noteId === b.noteId);
  }

  return isSameRecordListTarget(a, b);
}

function findExistingRecordWindow(target: NormalizedRecordTarget, displayId?: number) {
  if (target.draft) {
    return null;
  }

  for (const win of recordWindows) {
    const windowTarget = recordWindowTargets.get(win);
    if (!win.isDestroyed() && windowTarget && isSameRecordTarget(windowTarget, target) && (!displayId || isWindowOnDisplay(win, displayId))) {
      return win;
    }
  }

  return null;
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
    recordWindowTargets.delete(win);
  });

  recordWindows.add(win);
  recordWindowTargets.set(win, target);
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

function createSettingsWindow() {
  const win = new BrowserWindow({
    width: 460,
    height: 660,
    minWidth: 420,
    minHeight: 520,
    show: false,
    frame: true,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    title: "设置",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
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
    if (settingsWindowRef === win) {
      settingsWindowRef = null;
    }
  });

  loadRenderer(win, { surface: "settings" });
  return win;
}

function createManualWindow() {
  const win = new BrowserWindow({
    width: 820,
    height: 640,
    minWidth: 640,
    minHeight: 500,
    show: false,
    frame: true,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    title: "使用手册",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
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
    if (manualWindowRef === win) {
      manualWindowRef = null;
    }
  });

  loadRenderer(win, { surface: "manual" });
  return win;
}

function createUpdateWindow() {
  const win = new BrowserWindow({
    width: 640,
    height: 300,
    minWidth: 560,
    minHeight: 260,
    show: false,
    frame: true,
    resizable: false,
    movable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    title: "检查更新",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
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
    if (updateWindowRef === win) {
      updateWindowRef = null;
    }
  });

  loadRenderer(win, { surface: "update" });
  return win;
}

function showSettingsWindow() {
  if (!settingsWindowRef || settingsWindowRef.isDestroyed()) {
    settingsWindowRef = createSettingsWindow();
  }

  hideTaskPreviewWindow();
  positionWindowOnScreen(settingsWindowRef);
  showInCurrentWorkspace(settingsWindowRef);
}

function showManualWindow() {
  if (!manualWindowRef || manualWindowRef.isDestroyed()) {
    manualWindowRef = createManualWindow();
  }

  hideTaskPreviewWindow();
  positionWindowOnScreen(manualWindowRef);
  showInCurrentWorkspace(manualWindowRef);
}

function shouldCheckFromMenu(status: AppUpdateStatus) {
  return status.phase !== "checking" && status.phase !== "downloading" && status.phase !== "downloaded";
}

function sendCurrentUpdateStatusToWindow(win: BrowserWindow) {
  if (win.isDestroyed()) {
    return;
  }
  win.webContents.send("appUpdate:status", getAppUpdateService().getStatus());
}

function showUpdateWindow(options: { checkNow?: boolean } = {}) {
  if (!updateWindowRef || updateWindowRef.isDestroyed()) {
    updateWindowRef = createUpdateWindow();
  }

  hideTaskPreviewWindow();
  positionWindowOnScreen(updateWindowRef);
  showInCurrentWorkspace(updateWindowRef);

  const win = updateWindowRef;
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", () => sendCurrentUpdateStatusToWindow(win));
  } else {
    sendCurrentUpdateStatusToWindow(win);
  }

  const currentStatus = getAppUpdateService().getStatus();
  if (options.checkNow && shouldCheckFromMenu(currentStatus)) {
    void getAppUpdateService().checkForUpdates();
  }
}

async function showPersonalRecordWindow(target?: PersonalRecordTarget) {
  const nextTarget = normalizeRecordTarget(target);
  const display = getTargetDisplay(nextTarget.x, nextTarget.y);
  if (nextTarget.scopeType === "task" && nextTarget.projectId !== null && nextTarget.taskId !== null) {
    await showStickyWindow({
      projectId: nextTarget.projectId,
      taskId: nextTarget.taskId,
      x: nextTarget.x ?? undefined,
      y: nextTarget.y ?? undefined
    });
    return;
  }

  const existingWin = findExistingRecordWindow(nextTarget, display.id);
  if (existingWin) {
    focusExistingNoteWindow(existingWin);
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
    const workArea = display.workArea;
    win.setPosition(
      clamp(Math.round(nextTarget.x - 24), workArea.x + 8, workArea.x + workArea.width - bounds.width - 8),
      clamp(Math.round(nextTarget.y - 24), workArea.y + 8, workArea.y + workArea.height - bounds.height - 8),
      false
    );
  } else {
    const bounds = win.getBounds();
    const workArea = display.workArea;
    const offset = (recordWindows.size % 6) * 22;
    win.setPosition(
      clamp(Math.round(workArea.x + (workArea.width - bounds.width) / 2 + offset), workArea.x + 8, workArea.x + workArea.width - bounds.width - 8),
      clamp(Math.round(workArea.y + (workArea.height - bounds.height) / 2 + offset), workArea.y + 8, workArea.y + workArea.height - bounds.height - 8),
      false
    );
  }

  hideTaskPreviewWindow();
  windowRef?.hide();
  showInCurrentWorkspace(win);
}

function syncRecordWindowTarget(sender: WebContents, record: PersonalRecord) {
  if (record.status === "archived") {
    return;
  }

  const win = BrowserWindow.fromWebContents(sender);
  if (!win || win.isDestroyed() || !recordWindows.has(win)) {
    return;
  }

  recordWindowTargets.set(win, {
    noteId: record.id,
    draft: false,
    scopeType: record.scopeType,
    projectId: typeof record.projectId === "number" && Number.isFinite(record.projectId) ? record.projectId : null,
    projectName: safeWindowText(record.projectName),
    taskId: typeof record.taskId === "number" && Number.isFinite(record.taskId) ? record.taskId : null,
    taskTitle: safeWindowText(record.taskTitle),
    x: null,
    y: null
  });
}

async function showNewPersonalRecordWindow() {
  await showPersonalRecordWindow({ draft: true });
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
      : `<div class="empty">无任务</div>`;
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
    const bridge = window.workshopTaskPreview;
    document.body.addEventListener("mouseenter", () => {
      void bridge?.keep?.();
    });
    document.body.addEventListener("mouseleave", () => {
      void bridge?.hide?.();
    });
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-task-id]") : null;
      if (!target) {
        return;
      }
      const projectId = Number(target.getAttribute("data-project-id"));
      const taskId = Number(target.getAttribute("data-task-id"));
      if (Number.isFinite(projectId) && Number.isFinite(taskId)) {
        void bridge?.openTask?.(projectId, taskId);
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
      preload: path.join(__dirname, "taskPreviewPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
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

type ArrangeColumn = "task" | "project-record" | "personal-record";
type ArrangeRole = "list" | "detail";

interface ArrangeItem {
  win: BrowserWindow;
  column: ArrangeColumn;
  role: ArrangeRole;
  projectId: number | null;
  sourceOrder: number;
  bounds: Electron.Rectangle;
  minHeight: number;
  collapsedHeight?: number;
}

function compareArrangeItems(a: ArrangeItem, b: ArrangeItem) {
  if (a.role !== b.role) {
    return a.role === "list" ? -1 : 1;
  }

  if (a.bounds.y !== b.bounds.y) {
    return a.bounds.y - b.bounds.y;
  }

  return a.bounds.x - b.bounds.x;
}

function getCurrentWindowMinHeight(win: BrowserWindow, fallback: number) {
  const [, minHeight] = win.getMinimumSize();
  return Number.isFinite(minHeight) && minHeight > 0 ? Math.max(56, Math.round(minHeight)) : fallback;
}

function getStickyArrangeItem(win: BrowserWindow, sourceOrder: number): ArrangeItem | null {
  const target = stickyWindowTargets.get(win);
  if (!target) {
    return null;
  }

  const role: ArrangeRole = target.taskId === null ? "list" : "detail";
  return {
    win,
    column: "task",
    role,
    projectId: target.projectId,
    sourceOrder,
    bounds: win.getBounds(),
    minHeight: role === "list" ? NOTE_ARRANGE_LIST_MIN_HEIGHT : getCurrentWindowMinHeight(win, 132),
    collapsedHeight: role === "list" ? NOTE_ARRANGE_LIST_COLLAPSED_HEIGHT : undefined
  };
}

async function getRecordArrangeItem(win: BrowserWindow, sourceOrder: number): Promise<ArrangeItem | null> {
  const target = recordWindowTargets.get(win);
  if (!target) {
    return null;
  }

  const record = target.noteId ? await getPersonalRecord(target.noteId).catch(() => null) : null;
  const scopeType = record?.scopeType ?? target.scopeType;
  const projectId = typeof record?.projectId === "number" ? record.projectId : target.projectId;
  const role: ArrangeRole = isRecordListTarget(target) ? "list" : "detail";
  const column: ArrangeColumn = scopeType === "project" ? "project-record" : scopeType === "task" ? "task" : "personal-record";

  return {
    win,
    column,
    role,
    projectId: column === "personal-record" ? null : projectId,
    sourceOrder,
    bounds: win.getBounds(),
    minHeight: role === "list" ? NOTE_ARRANGE_LIST_MIN_HEIGHT : getCurrentWindowMinHeight(win, column === "task" ? 132 : 188),
    collapsedHeight: role === "list" ? NOTE_ARRANGE_LIST_COLLAPSED_HEIGHT : undefined
  };
}

async function getArrangeableNoteItems(sourceWin: BrowserWindow, displayId: number) {
  const stickyItems = [...stickyWindows]
    .filter((win) => !win.isDestroyed() && !win.isMinimized() && win.isVisible() && isWindowOnDisplay(win, displayId))
    .map((win, index) => getStickyArrangeItem(win, index))
    .filter((item): item is ArrangeItem => Boolean(item));
  const recordItems = (
    await Promise.all(
      [...recordWindows]
        .filter((win) => !win.isDestroyed() && !win.isMinimized() && win.isVisible() && isWindowOnDisplay(win, displayId))
        .map((win, index) => getRecordArrangeItem(win, stickyItems.length + index))
    )
  ).filter((item): item is ArrangeItem => Boolean(item));
  const items = [...stickyItems, ...recordItems];
  const sourceItem = items.find((item) => item.win === sourceWin) ?? null;

  if (sourceItem?.column === "personal-record") {
    return items.filter((item) => item.column === "personal-record");
  }

  if (sourceItem?.projectId !== null && sourceItem?.projectId !== undefined) {
    return items.filter((item) => item.column === "personal-record" || item.projectId === sourceItem.projectId);
  }

  return items;
}

function fitColumnHeights(items: ArrangeItem[], availableHeight: number) {
  const heights = new Map<BrowserWindow, number>();
  const collapsedLists = new Set<BrowserWindow>();
  for (const item of items) {
    heights.set(item.win, clamp(item.bounds.height, item.role === "list" ? item.collapsedHeight ?? item.minHeight : item.minHeight, availableHeight));
  }

  const totalHeight = () => items.reduce((sum, item) => sum + (heights.get(item.win) ?? item.minHeight), 0) + Math.max(0, items.length - 1) * NOTE_ARRANGE_GAP;
  let overflow = totalHeight() - availableHeight;
  const listItems = items.filter((item) => item.role === "list");
  const detailItems = items.filter((item) => item.role === "detail");

  for (const item of listItems) {
    if (overflow <= 0) {
      break;
    }

    const height = heights.get(item.win) ?? item.minHeight;
    const shrink = Math.min(Math.max(0, height - item.minHeight), overflow);
    if (shrink > 0) {
      heights.set(item.win, height - shrink);
      overflow -= shrink;
    }
  }

  while (overflow > 0) {
    const shrinkableItems = detailItems.filter((item) => (heights.get(item.win) ?? item.minHeight) > item.minHeight);
    if (shrinkableItems.length === 0) {
      break;
    }

    const shrinkStep = Math.max(1, Math.ceil(overflow / shrinkableItems.length));
    for (const item of shrinkableItems) {
      const height = heights.get(item.win) ?? item.minHeight;
      const shrink = Math.min(height - item.minHeight, shrinkStep, overflow);
      heights.set(item.win, height - shrink);
      overflow -= shrink;
      if (overflow <= 0) {
        break;
      }
    }
  }

  for (const item of listItems) {
    if (overflow <= 0) {
      break;
    }

    const collapsedHeight = item.collapsedHeight ?? item.minHeight;
    const height = heights.get(item.win) ?? item.minHeight;
    const shrink = Math.min(Math.max(0, height - collapsedHeight), overflow);
    if (shrink > 0) {
      heights.set(item.win, height - shrink);
      collapsedLists.add(item.win);
      overflow -= shrink;
    }
  }

  return { heights, collapsedLists };
}

async function arrangeStickyWindows(sourceWin: BrowserWindow | null) {
  if (!sourceWin || sourceWin.isDestroyed()) {
    return { count: 0 };
  }

  hideTaskPreviewWindow();
  const display = screen.getDisplayMatching(sourceWin.getBounds());
  const workArea = display.workArea;
  const noteItems = await getArrangeableNoteItems(sourceWin, display.id);
  if (noteItems.length === 0) {
    return { count: 0 };
  }

  const columnOrder: ArrangeColumn[] = ["task", "project-record", "personal-record"];
  const activeColumns = columnOrder.filter((column) => noteItems.some((item) => item.column === column));
  const maxWidth = Math.max(160, Math.floor((workArea.width - NOTE_ARRANGE_MARGIN * 2 - NOTE_ARRANGE_GAP * Math.max(0, activeColumns.length - 1)) / activeColumns.length));
  const width = Math.min(NOTE_ARRANGE_WIDTH, maxWidth);
  const minX = workArea.x + NOTE_ARRANGE_MARGIN;
  const maxX = workArea.x + workArea.width - width - NOTE_ARRANGE_MARGIN;
  const minY = workArea.y + NOTE_ARRANGE_MARGIN;
  const availableHeight = Math.max(56, workArea.height - NOTE_ARRANGE_MARGIN * 2);

  for (const [columnIndex, column] of activeColumns.entries()) {
    const columnItems = noteItems.filter((item) => item.column === column).sort(compareArrangeItems);
    const { heights, collapsedLists } = fitColumnHeights(columnItems, availableHeight);
    const x = clamp(maxX - columnIndex * (width + NOTE_ARRANGE_GAP), minX, Math.max(minX, maxX));
    let nextY = minY;

    for (const item of columnItems) {
      const height = heights.get(item.win) ?? item.minHeight;
      const shouldCollapseList = item.role === "list" && collapsedLists.has(item.win);
      item.win.webContents.send("window:arrangement", {
        compactList: shouldCollapseList,
        maxHeight: height
      });
      if (item.role === "list") {
        item.win.setMinimumSize(width, shouldCollapseList ? NOTE_ARRANGE_LIST_COLLAPSED_HEIGHT : NOTE_ARRANGE_LIST_MIN_HEIGHT);
      }

      const y = clamp(nextY, minY, workArea.y + workArea.height - height - NOTE_ARRANGE_MARGIN);
      item.win.setBounds({ x, y, width, height }, false);
      pulseWindowFocus(item.win);
      nextY += height + NOTE_ARRANGE_GAP;
    }
  }

  return { count: noteItems.length };
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
    showInCurrentWorkspace(windowRef);
    return;
  }

  positionWindowOnScreen(windowRef);
  showInCurrentWorkspace(windowRef);
}

function toggleWindow() {
  if (!windowRef) {
    return;
  }

  if (windowRef.isFocused()) {
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
      label: "使用手册",
      click: () => showManualWindow()
    },
    {
      label: "设置",
      click: () => showSettingsWindow()
    },
    {
      label: "任务便签",
      click: () => void showStickyWindow()
    },
    {
      label: "新建个人记录",
      accelerator: NEW_PERSONAL_RECORD_SHORTCUT_ACCELERATOR,
      click: () => void showNewPersonalRecordWindow()
    },
    {
      label: "个人记录",
      click: () => void showPersonalRecordWindow()
    },
    {
      label: "检查更新...",
      click: () => showUpdateWindow({ checkNow: true })
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => app.quit()
    }
  ];
}

function configureApplicationMenu() {
  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: "检查更新...",
    click: () => showUpdateWindow({ checkNow: true })
  };
  const editMenu: MenuItemConstructorOptions = {
    label: "编辑",
    submenu: [
      { role: "undo", label: "撤销" },
      { role: "redo", label: "重做" },
      { type: "separator" },
      { role: "cut", label: "剪切" },
      { role: "copy", label: "复制" },
      { role: "paste", label: "粘贴" },
      { role: "selectAll", label: "全选" }
    ]
  };
  const windowMenu: MenuItemConstructorOptions = {
    label: "窗口",
    submenu: [
      { role: "minimize", label: "最小化" },
      { role: "close", label: "关闭窗口" }
    ]
  };
  const helpMenu: MenuItemConstructorOptions = {
    label: "帮助",
    submenu: [
      {
        label: "使用手册",
        accelerator: "CommandOrControl+/",
        click: () => showManualWindow()
      }
    ]
  };

  if (process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: "about", label: `关于 ${app.name}` },
            { type: "separator" },
            {
              label: "设置...",
              accelerator: "CommandOrControl+,",
              click: () => showSettingsWindow()
            },
            { type: "separator" },
            checkForUpdatesItem,
            { type: "separator" },
            { role: "services", label: "服务", submenu: [] },
            { type: "separator" },
            { role: "hide", label: `隐藏 ${app.name}` },
            { role: "hideOthers", label: "隐藏其他" },
            { role: "unhide", label: "全部显示" },
            { type: "separator" },
            { role: "quit", label: `退出 ${app.name}` }
          ]
        },
        editMenu,
        windowMenu,
        helpMenu
      ])
    );
    return;
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "应用",
        submenu: [
          {
            label: "设置...",
            accelerator: "CommandOrControl+,",
            click: () => showSettingsWindow()
          },
          checkForUpdatesItem,
          { type: "separator" },
          { role: "quit", label: "退出" }
        ]
      },
      editMenu,
      windowMenu,
      helpMenu
    ])
  );
}

function configureDockMenu() {
  if (process.platform !== "darwin") {
    return;
  }

  app.dock?.setMenu(Menu.buildFromTemplate(buildAppEntryMenu("screen")));
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

function isTaskState(value: unknown): value is TaskState {
  return (
    value === "pending" ||
    value === "in_progress" ||
    value === "pending_review" ||
    value === "completed" ||
    value === "accepted" ||
    value === "cancelled" ||
    value === "blocked"
  );
}

function normalizeTaskStateChangeNotice(value: unknown): TaskStateChangeNotice | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = value.id;
  const projectId = value.projectId;
  const state = value.state;
  if (typeof id !== "number" || !Number.isFinite(id) || typeof projectId !== "number" || !Number.isFinite(projectId) || !isTaskState(state)) {
    return null;
  }

  return {
    id,
    projectId,
    state,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    completionAt: typeof value.completionAt === "string" ? value.completionAt : null
  };
}

function sendWorkshopRefresh(event: WorkshopRefreshEvent, sender?: WebContents) {
  if (windowRef && !windowRef.isDestroyed() && windowRef.webContents !== sender) {
    windowRef.webContents.send("workshop:refresh", event);
  }
  for (const win of stickyWindows) {
    if (!win.isDestroyed() && win.webContents !== sender) {
      win.webContents.send("workshop:refresh", event);
    }
  }
}

function sendConfigChanged(config: AppConfig) {
  const windows = [windowRef, settingsWindowRef, manualWindowRef, updateWindowRef, ...stickyWindows, ...recordWindows];
  for (const win of windows) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("config:changed", config);
    }
  }
}

function sendAppUpdateStatus(status: AppUpdateStatus) {
  if (windowRef && !windowRef.isDestroyed()) {
    windowRef.webContents.send("appUpdate:status", status);
  }
  if (settingsWindowRef && !settingsWindowRef.isDestroyed()) {
    settingsWindowRef.webContents.send("appUpdate:status", status);
  }
  if (updateWindowRef && !updateWindowRef.isDestroyed()) {
    updateWindowRef.webContents.send("appUpdate:status", status);
  }
  for (const win of stickyWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send("appUpdate:status", status);
    }
  }
  for (const win of recordWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send("appUpdate:status", status);
    }
  }
}

function notifyRefresh(reason: "manual" | "schedule") {
  sendWorkshopRefresh({ reason });
}

function notifyTaskChanged(notice: TaskStateChangeNotice, sender?: WebContents) {
  hideTaskPreviewWindow();
  sendWorkshopRefresh({ reason: "task-state", task: notice }, sender);
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

async function bindProjectLocalDirectory(projectId: number, owner?: BrowserWindow | null) {
  if (!Number.isFinite(projectId)) {
    throw new Error("项目 ID 无效");
  }

  const result = owner
    ? await dialog.showOpenDialog(owner, {
        properties: ["openDirectory", "createDirectory"],
        title: "绑定本地目录"
      })
    : await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        title: "绑定本地目录"
      });
  const [directory] = result.filePaths;
  if (result.canceled || !directory) {
    return null;
  }

  const config = await readConfig();
  return saveConfig({
    projectLocalDirectories: {
      ...config.projectLocalDirectories,
      [String(projectId)]: directory
    }
  });
}

async function openProjectLocalDirectory(projectId: number) {
  if (!Number.isFinite(projectId)) {
    throw new Error("项目 ID 无效");
  }

  const config = await readConfig();
  const directory = config.projectLocalDirectories[String(projectId)]?.trim();
  if (!directory) {
    throw new Error("请先绑定本地目录");
  }

  const error = await shell.openPath(directory);
  if (error) {
    throw new Error(error);
  }
}

function registerIpc() {
  ipcMain.handle("confirmation:confirm", (event, payload?: unknown) =>
    resolveTemporaryConfirmation(event.sender, { confirmed: true, reason: "confirmed", payload })
  );
  ipcMain.handle("confirmation:cancel", (event, payload?: unknown) =>
    resolveTemporaryConfirmation(event.sender, { confirmed: false, reason: "cancelled", payload })
  );
  ipcMain.handle("config:get", () => readConfig());
  ipcMain.handle("config:save", (_event, config: Partial<AppConfig>) => saveConfig(config));
  ipcMain.handle("auth:sendVerification", (_event, request: VerificationRequest) =>
    workshopApiService.sendVerification(request)
  );
  ipcMain.handle("auth:loginWithCode", (_event, request: LoginRequest) => workshopApiService.loginWithCode(request));
  ipcMain.handle("auth:logout", () => workshopApiService.logoutAuth());
  ipcMain.handle("workshop:getCurrentUser", () => workshopApiService.getCurrentUser());
  ipcMain.handle("workshop:listProjects", (_event, request?: ListProjectsRequest) =>
    workshopApiService.listProjects(request)
  );
  ipcMain.handle("workshop:listOrganizations", () => workshopApiService.listOrganizations());
  ipcMain.handle("workshop:listTasks", (_event, request: ListTasksRequest) => workshopApiService.listTasks(request));
  ipcMain.handle("workshop:createTask", (_event, request: CreateTaskRequest) =>
    workshopApiService.createTask(request)
  );
  ipcMain.handle("workshop:updateTask", (_event, request: UpdateTaskRequest) =>
    workshopApiService.updateTask(request)
  );
  ipcMain.handle("shell:openExternal", (_event, url: string) => shell.openExternal(url));
  ipcMain.handle("settings:open", () => showSettingsWindow());
  ipcMain.handle("manual:open", () => showManualWindow());
  ipcMain.handle("sticky:open", (_event, target?: StickyTarget | number) => showStickyWindow(target));
  ipcMain.handle("record:open", (_event, target?: PersonalRecordTarget) => showPersonalRecordWindow(target));
  ipcMain.handle("record:list", () => listPersonalRecords());
  ipcMain.handle("record:get", (_event, id: string) => getPersonalRecord(id));
  ipcMain.handle("record:save", async (event, record: SavePersonalRecordRequest) => {
    const saved = await savePersonalRecord(record);
    syncRecordWindowTarget(event.sender, saved);
    return saved;
  });
  ipcMain.handle("record:delete", (_event, id: string) => deletePersonalRecord(id));
  ipcMain.handle("taskPreview:show", (_event, request: TaskPreviewRequest) => showTaskPreviewWindow(request));
  ipcMain.handle("taskPreview:keep", () => cancelTaskPreviewHide());
  ipcMain.handle("taskPreview:hide", () => scheduleTaskPreviewHide());
  ipcMain.handle("task:changed", (event, notice: unknown) => {
    const normalizedNotice = normalizeTaskStateChangeNotice(notice);
    if (normalizedNotice) {
      notifyTaskChanged(normalizedNotice, event.sender);
    }
  });
  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle("sticky:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle("sticky:arrange", (event) => arrangeStickyWindows(BrowserWindow.fromWebContents(event.sender)));
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
  ipcMain.handle("projectDirectory:bind", (event, projectId: number) =>
    bindProjectLocalDirectory(projectId, BrowserWindow.fromWebContents(event.sender))
  );
  ipcMain.handle("projectDirectory:open", (_event, projectId: number) => openProjectLocalDirectory(projectId));
  ipcMain.handle("codex:send", (_event, request: SendToCodexRequest) => sendToCodex(request));
  ipcMain.handle("codexRuns:list", () => readCodexRuns());
  ipcMain.handle("appUpdate:getStatus", () => getAppUpdateService().getStatus());
  ipcMain.handle("appUpdate:check", () => getAppUpdateService().checkForUpdates());
  ipcMain.handle("appUpdate:install", () => getAppUpdateService().installDownloadedUpdate());
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
  codexClient?.stop();
  stopAppServer();
  unregisterGlobalShortcuts();
});

app.on("activate", () => {
  showWindow("screen");
});

app.whenReady().then(async () => {
  registerIpc();
  const config = await readConfig();
  await startAppServer().catch((error) => {
    console.warn(error instanceof Error ? error.message : "app server failed to start");
  });
  await reconcileCodexRunsOnStartup().catch(() => undefined);
  applyDockVisibility(config);
  configureApplicationMenu();
  configureDockMenu();
  registerGlobalShortcuts(config);

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
  await getAppUpdateService().initialize();
  setTimeout(() => {
    void getAppUpdateService().checkForUpdates();
  }, 3000);
  if (!hasValidLogin(config)) {
    setTimeout(() => showWindow("screen"), 400);
  }
});

app.on("window-all-closed", () => {
  // Keep the tray process alive after the hidden popover window closes.
});
