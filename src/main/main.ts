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
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { ensureWorkshopCliInstalled } from "./cliInstaller";
import { CodexAppServerClient } from "./codexAppServer";
import { buildCodexUserInput } from "./codexPrompt";
import {
  findLocalProjectByDirectory,
  findWorkshopProjectDirectoryId,
  getLocalProjectDirectoryForWorkshopProject,
  safeLinkedWorkshopProjectId,
  safeLocalProjectId,
  safeLocalProjectText,
  sanitizeLocalProjects,
  sanitizeProjectLocalDirectories
} from "./localProjectMigration";
import { PersonalRecordStore, normalizeRecordScope, normalizeRecordStatus } from "./recordStore";
import { getWorkshopCodexSkillStatus, installWorkshopCodexSkill } from "./skillInstaller";
import { AppUpdateService } from "./updateService";
import { WorkshopApiService } from "./workshopApiService";
import { normalizeCodexFailureMessage } from "../shared/codexErrors";
import type {
  AnnotatePersonalRecordRequest,
  ApiResponse,
  AppUpdateStatus,
  AsyncConfirmationMeta,
  AsyncConfirmationRequest,
  AppConfig,
  CodexRunBackend,
  CodexRunMeta,
  CodexRunStatus,
  ConfirmationAction,
  CreateLocalProjectRequest,
  CreateTaskRequest,
  LinkLocalProjectWorkshopProjectRequest,
  ListProjectTagsRequest,
  ListProjectsRequest,
  ListTasksRequest,
  LoginRequest,
  LocalProject,
  Organization,
  OrganizationsPayload,
  PersonalRecord,
  PersonalRecordChangeNotice,
  PersonalRecordMeta,
  PersonalRecordScope,
  PersonalRecordStatus,
  PersonalRecordStatusChangeTarget,
  PersonalRecordTarget,
  Project,
  ProjectTag,
  ProjectsPayload,
  RecordSearchLogEntry,
  RenameLocalProjectRequest,
  SavePersonalRecordRequest,
  SendToCodexRequest,
  SendToCodexResponse,
  StickyTarget,
  Task,
  TaskComposerTarget,
  TaskCreationContext,
  TaskPreviewRequest,
  TaskStateChangeNotice,
  TaskState,
  TemporaryConfirmationRequest,
  TemporaryConfirmationResult,
  TasksPayload,
  UpdateTaskRequest,
  VerificationRequest,
  WorkshopCurrentContext,
  WorkshopRefreshEvent,
  WindowArrangementResult,
  WindowArrangementState,
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
  stickyAlwaysOnTop: true,
  showDockIcon: true,
  globalShortcutEnabled: true,
  lastSeenManualRevision: "",
  lastSeenSkillInstallPromptVersion: "",
  projectLocalDirectories: {},
  localProjects: []
};

const PANEL_SHORTCUT_ACCELERATOR = "CommandOrControl+Alt+W";
const NEW_PERSONAL_RECORD_SHORTCUT_ACCELERATOR = "CommandOrControl+Alt+N";
const NOTE_ARRANGE_WIDTH = 360;
const NOTE_ARRANGE_MARGIN = 12;
const NOTE_ARRANGE_GAP = 12;
const NOTE_ARRANGE_LIST_MIN_HEIGHT = 180;
const NOTE_ARRANGE_LIST_COLLAPSED_HEIGHT = 56;
const PROJECT_WORKSPACE_COLLAPSED_HEIGHT = 140;
const DARWIN_ON_SCREEN_WINDOW_IDS_TIMEOUT_MS = 1200;
const CURRENT_CONTEXT_STALE_MS = 5 * 60 * 1000;
const CONFIRMATION_REQUESTS_LIMIT = 100;
const USER_DATA_DIR_NAME = "workshop-desktop";
const LEGACY_DEV_USER_DATA_DIR_NAME = "Electron";
const customUserDataPath = process.env.WORKSHOP_DESKTOP_USER_DATA?.trim();
const activeUserDataPath = customUserDataPath || defaultUserDataPath(USER_DATA_DIR_NAME);

app.setPath("userData", activeUserDataPath);

function defaultUserDataPath(dirName: string) {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", dirName);
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), dirName);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), dirName);
}

let tray: Tray | null = null;
let windowRef: BrowserWindow | null = null;
let homeWindowRef: BrowserWindow | null = null;
let mainWindowHasBeenShown = false;
const stickyWindows = new Set<BrowserWindow>();
const stickyWindowTargets = new Map<BrowserWindow, NormalizedStickyTarget>();
const recordWindows = new Set<BrowserWindow>();
const recordWindowTargets = new Map<BrowserWindow, NormalizedRecordTarget>();
const windowArrangementStates = new Map<BrowserWindow, WindowArrangementState>();
const arrangedWindowMaxHeights = new Map<BrowserWindow, number>();
const userResizedWindowHeights = new Map<BrowserWindow, number>();
const noteWindowFocusOrder = new Map<BrowserWindow, number>();
let nextNoteWindowFocusOrder = 1;
let settingsWindowRef: BrowserWindow | null = null;
let manualWindowRef: BrowserWindow | null = null;
let updateWindowRef: BrowserWindow | null = null;
let taskComposerWindowRef: BrowserWindow | null = null;
let taskPreviewWindowRef: BrowserWindow | null = null;
let taskPreviewHideTimer: NodeJS.Timeout | null = null;
let isQuitting = false;
let registeredPanelShortcut = false;
let registeredNewPersonalRecordShortcut = false;
let appServer: http.Server | null = null;
let appServerInfo: { port: number; token: string; agentToken: string } | null = null;
const agentProjectScopeCounts = new Map<number, number>();
const agentScopedRuns = new Map<string, number>();
let appUpdateService: AppUpdateService | null = null;
let currentWorkshopContext: WorkshopCurrentContext = { kind: "none" };
let confirmationRequestsQueue: Promise<unknown> = Promise.resolve();
let selectedNoteWindowId: number | null = null;
const temporaryConfirmationWindows = new Map<
  number,
  {
    win: BrowserWindow;
    settle: (result: TemporaryConfirmationResult) => void;
  }
>();

const configPath = () => path.join(app.getPath("userData"), "config.json");
const appServerConnectionPath = () => path.join(app.getPath("userData"), "app-server.json");
const confirmationRequestsDirPath = () => path.join(app.getPath("userData"), "confirmation-requests");
const confirmationRequestsIndexPath = () => path.join(confirmationRequestsDirPath(), "index.json");
const personalRecordStore = new PersonalRecordStore(() => app.getPath("userData"));
const workshopApiService = new WorkshopApiService({ readConfig, saveConfig });

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyFileIfMissing(sourcePath: string, targetPath: string) {
  if (!(await fileExists(sourcePath)) || (await fileExists(targetPath))) {
    return false;
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
  return true;
}

async function readRecordMetaIndex(recordsDir: string): Promise<PersonalRecordMeta[]> {
  try {
    const raw = await fs.readFile(path.join(recordsDir, "index.json"), "utf8");
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
      : [];
  } catch {
    return [];
  }
}

async function writeRecordMetaIndex(recordsDir: string, records: PersonalRecordMeta[]) {
  const sorted = [...records].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  await fs.mkdir(recordsDir, { recursive: true });
  const indexPath = path.join(recordsDir, "index.json");
  const tempPath = `${indexPath}.${process.pid}.${Date.now().toString(36)}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify({ records: sorted }, null, 2), "utf8");
  await fs.rename(tempPath, indexPath);
}

async function migrateLegacyPersonalRecords(sourceUserDataPath: string, targetUserDataPath: string) {
  const sourceRecordsDir = path.join(sourceUserDataPath, "personal-records");
  const targetRecordsDir = path.join(targetUserDataPath, "personal-records");
  const sourceRecords = await readRecordMetaIndex(sourceRecordsDir);
  if (sourceRecords.length === 0) {
    return 0;
  }

  const targetRecords = await readRecordMetaIndex(targetRecordsDir);
  const existingRecordIds = new Set(targetRecords.map((record) => record.id));
  const migratedRecords: PersonalRecordMeta[] = [];

  for (const record of sourceRecords) {
    if (existingRecordIds.has(record.id)) {
      continue;
    }

    await copyFileIfMissing(path.join(sourceRecordsDir, `${record.id}.md`), path.join(targetRecordsDir, `${record.id}.md`));
    migratedRecords.push(record);
    existingRecordIds.add(record.id);
  }

  if (migratedRecords.length > 0) {
    await writeRecordMetaIndex(targetRecordsDir, [...migratedRecords, ...targetRecords]);
  }
  return migratedRecords.length;
}

async function migrateLegacyUserDataIfNeeded() {
  if (customUserDataPath) {
    return;
  }

  const targetUserDataPath = app.getPath("userData");
  const legacyUserDataPath = defaultUserDataPath(LEGACY_DEV_USER_DATA_DIR_NAME);
  if (path.resolve(legacyUserDataPath) === path.resolve(targetUserDataPath) || !(await fileExists(legacyUserDataPath))) {
    return;
  }

  const copiedConfig = await copyFileIfMissing(path.join(legacyUserDataPath, "config.json"), configPath());
  const migratedRecordCount = await migrateLegacyPersonalRecords(legacyUserDataPath, targetUserDataPath);
  if (copiedConfig || migratedRecordCount > 0) {
    console.info(
      `Migrated legacy dev userData from ${legacyUserDataPath} to ${targetUserDataPath}: ` +
        `${migratedRecordCount} record(s)${copiedConfig ? ", config copied" : ""}.`
    );
  }
}

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

function bundledCliScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "cli", "workshop-desktop-cli.mjs")
    : path.join(process.cwd(), "scripts", "workshop-desktop-cli.mjs");
}

function bundledWorkshopCodexSkillPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "skills", "workshop-codex-collaboration")
    : path.join(process.cwd(), "resources", "skills", "workshop-codex-collaboration");
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
    return sanitizeConfig(defaultConfig);
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
    sendConfigChanged(merged);
  }
  return merged;
}

function sanitizeConfig(config: AppConfig): AppConfig {
  const authMode = ["nebula", "bearer", "debugHeaders"].includes(config.authMode)
    ? config.authMode
    : "nebula";
  const projectLocalDirectories = sanitizeProjectLocalDirectories(config.projectLocalDirectories);
  const localProjects = sanitizeLocalProjects(config.localProjects, projectLocalDirectories);
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
    lastSeenSkillInstallPromptVersion:
      typeof config.lastSeenSkillInstallPromptVersion === "string" ? config.lastSeenSkillInstallPromptVersion : "",
    projectLocalDirectories,
    localProjects
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
    showHomeWindow();
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

  win.on("focus", () => {
    markCurrentWorkshopContext({ kind: "tray", surface: "tray" });
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

function createHomeWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 760,
    minHeight: 540,
    show: false,
    frame: true,
    resizable: true,
    movable: true,
    fullscreenable: true,
    skipTaskbar: false,
    alwaysOnTop: false,
    title: "Workshop Desktop",
    backgroundColor: "#f3f2ec",
    ...windowIconOption(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.on("focus", () => {
    markCurrentWorkshopContext({ kind: "home", surface: "home" });
  });

  win.on("closed", () => {
    homeWindowRef = null;
    clearCurrentWorkshopContextIfMatches({ kind: "home", surface: "home" });
  });

  loadRenderer(win, { surface: "home" });

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
  surface: "tray" | "home" | "sticky" | "record" | "task-composer" | "settings" | "manual" | "update";
  projectId?: number | null;
  taskId?: number | null;
  noteId?: string | null;
  draft?: string | null;
  scopeType?: PersonalRecordScope | null;
  localProjectId?: string | null;
  projectName?: string | null;
  taskTitle?: string | null;
  initialContent?: string | null;
  sourceRecordId?: string | null;
  lockProject?: boolean;
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
  if (options.localProjectId) {
    searchParams.set("local_project_id", options.localProjectId);
  }
  if (options.projectName) {
    searchParams.set("project_name", options.projectName);
  }
  if (options.taskTitle) {
    searchParams.set("task_title", options.taskTitle);
  }
  if (options.initialContent) {
    searchParams.set("initial_content", options.initialContent);
  }
  if (options.sourceRecordId) {
    searchParams.set("source_record_id", options.sourceRecordId);
  }
  if (options.lockProject) {
    searchParams.set("lock_project", "1");
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

function markCurrentWorkshopContext(context: Omit<WorkshopCurrentContext, "focusedAt" | "stale">) {
  currentWorkshopContext = {
    ...context,
    focusedAt: new Date().toISOString()
  };
}

function getCurrentWorkshopContext(): WorkshopCurrentContext {
  if (!currentWorkshopContext.focusedAt || currentWorkshopContext.kind === "none") {
    return currentWorkshopContext;
  }

  const focusedAt = new Date(currentWorkshopContext.focusedAt).getTime();
  const stale = Number.isNaN(focusedAt) || Date.now() - focusedAt > CURRENT_CONTEXT_STALE_MS;
  return { ...currentWorkshopContext, stale };
}

function contextMatchesCurrent(context: Omit<WorkshopCurrentContext, "focusedAt" | "stale">) {
  if (currentWorkshopContext.kind !== context.kind || currentWorkshopContext.surface !== context.surface) {
    return false;
  }

  if (context.recordId && currentWorkshopContext.recordId !== context.recordId) {
    return false;
  }

  if (context.taskId !== undefined && currentWorkshopContext.taskId !== context.taskId) {
    return false;
  }

  if (context.projectId !== undefined && currentWorkshopContext.projectId !== context.projectId) {
    return false;
  }

  return true;
}

function markFallbackContextAfterSurfaceClose() {
  if (homeWindowRef && !homeWindowRef.isDestroyed() && homeWindowRef.isVisible()) {
    markCurrentWorkshopContext({ kind: "home", surface: "home" });
    return;
  }

  if (windowRef && !windowRef.isDestroyed() && windowRef.isVisible()) {
    markCurrentWorkshopContext({ kind: "tray", surface: "tray" });
    return;
  }

  currentWorkshopContext = { kind: "none" };
}

function clearCurrentWorkshopContextIfMatches(context: Omit<WorkshopCurrentContext, "focusedAt" | "stale">) {
  if (contextMatchesCurrent(context)) {
    markFallbackContextAfterSurfaceClose();
  }
}

function stickyTargetContext(target: NormalizedStickyTarget): Omit<WorkshopCurrentContext, "focusedAt" | "stale"> {
  if (target.taskId !== null) {
    return {
      kind: "task",
      surface: "sticky",
      ...(target.projectId !== null ? { projectId: target.projectId } : {}),
      taskId: target.taskId
    };
  }

  if (target.projectId !== null) {
    return {
      kind: "project",
      surface: "sticky",
      projectId: target.projectId
    };
  }

  return { kind: "none", surface: "sticky" };
}

function recordTargetContext(target: NormalizedRecordTarget): Omit<WorkshopCurrentContext, "focusedAt" | "stale"> {
  if (target.noteId) {
    return {
      kind: "record",
      surface: "record",
      recordId: target.noteId,
      ...(target.localProjectId ? { localProjectId: target.localProjectId } : {}),
      ...(target.projectId !== null ? { projectId: target.projectId } : {}),
      ...(target.projectName ? { projectName: target.projectName } : {}),
      ...(target.taskId !== null ? { taskId: target.taskId } : {}),
      ...(target.taskTitle ? { taskTitle: target.taskTitle } : {})
    };
  }

  if (target.draft) {
    return {
      kind: "record-draft",
      surface: "record",
      ...(target.localProjectId ? { localProjectId: target.localProjectId } : {}),
      ...(target.projectId !== null ? { projectId: target.projectId } : {}),
      ...(target.projectName ? { projectName: target.projectName } : {}),
      ...(target.taskId !== null ? { taskId: target.taskId } : {}),
      ...(target.taskTitle ? { taskTitle: target.taskTitle } : {})
    };
  }

  if (target.scopeType === "project" || target.projectId !== null) {
    return {
      kind: "project",
      surface: "record",
      ...(target.localProjectId ? { localProjectId: target.localProjectId } : {}),
      ...(target.projectId !== null ? { projectId: target.projectId } : {}),
      ...(target.projectName ? { projectName: target.projectName } : {})
    };
  }

  return { kind: "none", surface: "record" };
}

function markStickyWindowContext(win: BrowserWindow) {
  const target = stickyWindowTargets.get(win);
  if (target) {
    markCurrentWorkshopContext(stickyTargetContext(target));
  }
  selectNoteWindow(win);
}

function markRecordWindowContext(win: BrowserWindow) {
  const target = recordWindowTargets.get(win);
  if (target) {
    markCurrentWorkshopContext(recordTargetContext(target));
  }
  selectNoteWindow(win);
}

function sendNoteWindowFocusState(win: BrowserWindow, selected: boolean) {
  if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send("window:focusState", { selected });
  }
}

function broadcastSelectedNoteWindow() {
  for (const win of [...stickyWindows, ...recordWindows]) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) {
      continue;
    }
    sendNoteWindowFocusState(win, win.webContents.id === selectedNoteWindowId);
  }
}

function selectNoteWindow(win: BrowserWindow) {
  if (win.isDestroyed() || win.webContents.isDestroyed()) {
    return;
  }
  noteWindowFocusOrder.set(win, nextNoteWindowFocusOrder);
  nextNoteWindowFocusOrder += 1;
  selectedNoteWindowId = win.webContents.id;
  broadcastSelectedNoteWindow();
}

function releaseWindowArrangement(win: BrowserWindow, notify = true) {
  const hadArrangement = arrangedWindowMaxHeights.delete(win);
  if (hadArrangement && notify && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send("window:arrangement", { released: true });
  }
}

function registerWindowArrangementLifecycle(win: BrowserWindow) {
  windowArrangementStates.set(win, { protected: false });
  win.on("will-move", () => releaseWindowArrangement(win));
  win.on("will-resize", (_event, newBounds) => {
    userResizedWindowHeights.set(win, Math.round(newBounds.height));
    releaseWindowArrangement(win);
  });
}

function clearWindowArrangementLifecycle(win: BrowserWindow) {
  windowArrangementStates.delete(win);
  arrangedWindowMaxHeights.delete(win);
  userResizedWindowHeights.delete(win);
  noteWindowFocusOrder.delete(win);
}

function clearSelectedNoteWindow(win: BrowserWindow) {
  if (win.isDestroyed() || win.webContents.isDestroyed()) {
    return;
  }
  clearSelectedNoteWindowById(win.webContents.id);
}

function clearSelectedNoteWindowById(webContentsId: number) {
  if (selectedNoteWindowId !== webContentsId) {
    return;
  }
  selectedNoteWindowId = null;
  broadcastSelectedNoteWindow();
}

interface AppServerRpcRequest {
  method: string;
  params?: unknown;
}

interface CreateRecordParams {
  title?: string | null;
  bodyMarkdown: string;
  scopeType?: PersonalRecordScope;
  localProjectId?: string;
  projectId?: number;
  projectName?: string;
  taskId?: number;
  taskTitle?: string;
  open?: boolean;
}

interface ListRecordsParams {
  scopeType?: PersonalRecordScope;
  status?: PersonalRecordStatus;
  localProjectId?: string;
  projectId?: number;
  taskId?: number;
  query?: string;
  limit?: number;
  includeBody?: boolean;
}

interface RecordLifecycleRequest {
  projectId: number;
  recordIds: string[];
  reason?: string;
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
  const localProjectId = safeLocalProjectId(value.localProjectId);
  const projectId = typeof value.projectId === "number" && Number.isFinite(value.projectId) ? value.projectId : undefined;
  const taskId = typeof value.taskId === "number" && Number.isFinite(value.taskId) ? value.taskId : undefined;

  return {
    title,
    bodyMarkdown: bodyMarkdown.trim() || (title ? `# ${title}` : ""),
    scopeType,
    localProjectId: localProjectId || undefined,
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

function normalizePositiveNumberList(value: unknown, label: string, maxItems = 20) {
  if (!Array.isArray(value)) {
    return [];
  }
  const items = [...new Set(value.map((item) => normalizePositiveNumber(item, label)))];
  if (items.length > maxItems) {
    throw new Error(`${label} 最多选择 ${maxItems} 个`);
  }
  return items;
}

function normalizeTaskCreationRequest(value: unknown): CreateTaskRequest & { state: "pending" } {
  const request = isPlainObject(value) ? value : {};
  const content = safeWindowText(request.content, 2000);
  if (!content) {
    throw new Error("任务内容不能为空");
  }
  const tagIds = normalizePositiveNumberList(request.tagIds, "标签 ID");
  const state = request.state === undefined ? "pending" : request.state;
  if (state !== "pending") {
    throw new Error("新建待办的初始状态必须为 pending");
  }
  return {
    projectId: normalizePositiveNumber(request.projectId, "项目 ID"),
    content,
    executorId: normalizePositiveNumber(request.executorId, "负责人"),
    tagIds,
    state
  };
}

function normalizeAppServerRecordListParams(params: unknown): ListRecordsParams {
  const value = isPlainObject(params) ? params : {};
  const scopeType = value.scopeType || value.scope ? normalizeRecordScope(value.scopeType ?? value.scope) : undefined;
  const status =
    value.status === "active" || value.status === "completed" || value.status === "promoted" || value.status === "archived"
      ? value.status
      : undefined;
  const rawLimit = typeof value.limit === "number" && Number.isFinite(value.limit) ? Math.trunc(value.limit) : undefined;

  return {
    ...(value.scopeType || value.scope ? { scopeType } : {}),
    ...(status ? { status } : {}),
    localProjectId: safeLocalProjectId(value.localProjectId) || undefined,
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

function normalizeRecordStatusChangeTargets(value: unknown): PersonalRecordStatusChangeTarget[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new Error("记录状态变更每次需要选择 1-50 条记录");
  }
  const records = value.map((raw) => {
    const target = isPlainObject(raw) ? raw : {};
    const id = safeWindowText(target.id, 120);
    const expectedUpdatedAt = safeWindowText(target.expectedUpdatedAt, 40);
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error("记录状态变更包含无效记录 ID");
    }
    if (!expectedUpdatedAt || Number.isNaN(new Date(expectedUpdatedAt).getTime())) {
      throw new Error(`记录状态变更缺少有效的 expectedUpdatedAt：${id}`);
    }
    return { id, expectedUpdatedAt };
  });
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new Error("记录状态变更不能包含重复 ID");
  }
  return records;
}

function normalizeRecordLifecycleRequest(params: unknown): RecordLifecycleRequest {
  const value = isPlainObject(params) ? params : {};
  const rawIds = Array.isArray(value.recordIds) ? value.recordIds : Array.isArray(value.ids) ? value.ids : [];
  if (rawIds.length === 0 || rawIds.length > 50) {
    throw new Error("记录归档或恢复每次需要选择 1-50 条记录");
  }
  const recordIds = rawIds.map((rawId) => {
    const id = safeWindowText(rawId, 120);
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error("记录归档或恢复包含无效记录 ID");
    }
    return id;
  });
  if (new Set(recordIds).size !== recordIds.length) {
    throw new Error("记录归档或恢复不能包含重复 ID");
  }
  return {
    projectId: normalizePositiveNumber(value.projectId, "项目 ID"),
    recordIds,
    reason: safeWindowText(value.reason, 300) ?? undefined
  };
}

function normalizeAnnotationConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 1) : undefined;
}

const recordAnnotationIntents = ["task", "question", "discussion", "principle", "execution_summary", "note"] as const;
const recordAnnotationRetentions = ["temp", "keep", "candidate", "archived"] as const;
const recordAnnotationResolutions = ["open", "answered", "decided", "converted", "obsolete"] as const;

function normalizeAnnotationEnum<T extends string>(value: unknown, allowed: readonly T[]) {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : undefined;
}

function normalizeAnnotationTextList(value: unknown, maxItems: number, maxItemLength: number) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  for (const item of value) {
    const text = safeWindowText(item, maxItemLength);
    if (text) {
      seen.add(text);
    }
    if (seen.size >= maxItems) {
      break;
    }
  }

  const items = [...seen];
  return items.length > 0 ? items : undefined;
}

function normalizeAnnotationRecordIds(value: unknown) {
  const ids = normalizeAnnotationTextList(value, 50, 120)?.filter((id) => /^[a-zA-Z0-9_-]+$/.test(id));
  return ids && ids.length > 0 ? ids : undefined;
}

function normalizeAppServerRecordAnnotationItem(value: unknown): AnnotatePersonalRecordRequest {
  const item = isPlainObject(value) ? value : {};
  const id = safeWindowText(item.id, 120);
  const rawAnnotation = isPlainObject(item.annotation) ? item.annotation : item;
  const namespace = safeWindowText(rawAnnotation.namespace, 80);
  if (!id) {
    throw new Error("record.annotate 需要 id");
  }
  if (!namespace) {
    throw new Error("record.annotate 需要 annotation.namespace");
  }

  const intent = normalizeAnnotationEnum(rawAnnotation.intent, recordAnnotationIntents);
  const retention = normalizeAnnotationEnum(rawAnnotation.retention, recordAnnotationRetentions);
  const resolution = normalizeAnnotationEnum(rawAnnotation.resolution, recordAnnotationResolutions);
  const tags = normalizeAnnotationTextList(rawAnnotation.tags, 20, 50);
  const relatedRecordIds = normalizeAnnotationRecordIds(rawAnnotation.relatedRecordIds);
  const relatedTaskId = normalizeOptionalPositiveNumber(rawAnnotation.relatedTaskId, "关联任务 ID");
  const aiTitle = safeWindowText(rawAnnotation.aiTitle, 160) ?? undefined;
  const type = safeWindowText(rawAnnotation.type, 80) ?? undefined;
  const summary = safeWindowText(rawAnnotation.summary, 800) ?? undefined;
  const status = safeWindowText(rawAnnotation.status, 80) ?? undefined;
  const confidence = normalizeAnnotationConfidence(rawAnnotation.confidence);

  return {
    id,
    annotation: {
      namespace,
      ...(intent ? { intent } : {}),
      ...(retention ? { retention } : {}),
      ...(resolution ? { resolution } : {}),
      ...(tags ? { tags } : {}),
      ...(relatedRecordIds ? { relatedRecordIds } : {}),
      ...(relatedTaskId !== undefined ? { relatedTaskId } : {}),
      ...(aiTitle ? { aiTitle } : {}),
      ...(type ? { type } : {}),
      ...(summary ? { summary } : {}),
      ...(status ? { status } : {}),
      ...(confidence !== undefined ? { confidence } : {})
    }
  };
}

function normalizeAppServerRecordAnnotateParams(params: unknown) {
  const value = isPlainObject(params) ? params : {};
  const rawAnnotations = Array.isArray(value.annotations) ? value.annotations : [value];
  const annotations = rawAnnotations.map(normalizeAppServerRecordAnnotationItem);
  if (annotations.length === 0) {
    throw new Error("record.annotate 需要 annotations");
  }
  return { annotations };
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

function normalizeConfirmationAction(value: unknown): ConfirmationAction | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  switch (value.type) {
    case "record.updateBody": {
      const recordId = safeWindowText(value.recordId, 120);
      if (!recordId) {
        throw new Error("record.updateBody 需要 recordId");
      }
      if (typeof value.bodyMarkdown !== "string") {
        throw new Error("record.updateBody 需要 bodyMarkdown");
      }
      return { type: "record.updateBody", recordId, bodyMarkdown: value.bodyMarkdown };
    }
    case "record.appendBody": {
      const recordId = safeWindowText(value.recordId, 120);
      const markdown = typeof value.markdown === "string" ? value.markdown.trim() : "";
      if (!recordId) {
        throw new Error("record.appendBody 需要 recordId");
      }
      if (!markdown) {
        throw new Error("record.appendBody 需要 markdown");
      }
      return { type: "record.appendBody", recordId, markdown };
    }
    case "record.create": {
      const params = normalizeAppServerRecordParams(value.record);
      if (!params.bodyMarkdown.trim()) {
        throw new Error("record.create 需要 title 或 bodyMarkdown");
      }
      return {
        type: "record.create",
        record: {
          ...(params.title ? { title: params.title } : {}),
          bodyMarkdown: params.bodyMarkdown,
          scopeType: params.scopeType,
          projectId: params.projectId,
          projectName: params.projectName,
          taskId: params.taskId,
          taskTitle: params.taskTitle,
          open: params.open
        }
      };
    }
    case "record.annotate": {
      const { annotations } = normalizeAppServerRecordAnnotateParams({ annotations: value.annotations });
      return { type: "record.annotate", annotations };
    }
    case "record.archive":
    case "record.restore": {
      return {
        type: value.type,
        projectId: normalizePositiveNumber(value.projectId, "项目 ID"),
        records: normalizeRecordStatusChangeTargets(value.records)
      };
    }
    case "task.create": {
      return { type: "task.create", ...normalizeTaskCreationRequest(value) };
    }
    case "task.updateState": {
      const taskId = normalizePositiveNumber(value.taskId, "任务 ID");
      const projectId = normalizePositiveNumber(value.projectId, "项目 ID");
      if (!isTaskState(value.state)) {
        throw new Error("task.updateState 需要有效 state");
      }
      return { type: "task.updateState", taskId, projectId, state: value.state };
    }
    default:
      throw new Error("不支持的确认动作");
  }
}

function normalizeAsyncConfirmationParams(params: unknown): Required<TemporaryConfirmationRequest> & Pick<AsyncConfirmationRequest, "action"> {
  const value = isPlainObject(params) ? params : {};
  return {
    ...normalizeTemporaryConfirmationParams(value),
    action: normalizeConfirmationAction(value.action)
  };
}

function normalizeConfirmationStatusParams(params: unknown) {
  const value = isPlainObject(params) ? params : {};
  const requestId = safeWindowText(value.requestId ?? value.id, 120) ?? undefined;
  const rawLimit = typeof value.limit === "number" && Number.isFinite(value.limit) ? Math.trunc(value.limit) : undefined;
  return {
    requestId,
    limit: rawLimit ? clamp(rawLimit, 1, CONFIRMATION_REQUESTS_LIMIT) : 20
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
    query: safeWindowText(value.query ?? value.search, 200) ?? undefined,
    executorIds: normalizePositiveNumberList(value.executorIds, "负责人 ID", 50),
    tagIds: normalizePositiveNumberList(value.tagIds, "标签 ID", 50),
    pageSize: normalizeOptionalPositiveNumber(value.pageSize, "pageSize")
  };
}

function normalizeAppServerTaskGetParams(params: unknown) {
  const value = isPlainObject(params) ? params : {};
  return {
    projectId: normalizePositiveNumber(value.projectId, "项目 ID"),
    taskId: normalizePositiveNumber(value.taskId ?? value.id, "任务 ID")
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
  const directory = getLocalProjectDirectoryForWorkshopProject(config, projectId);
  if (!directory) {
    throw new Error("请先绑定本地目录");
  }

  const stat = await fs.stat(directory).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error("本地目录不存在，请重新绑定");
  }

  return directory;
}

async function normalizeLocalDirectoryForStorage(directory: string) {
  const trimmed = directory.trim();
  if (!trimmed) {
    return "";
  }
  return fs.realpath(trimmed).catch(() => trimmed);
}

function getDuplicateLocalProjectDirectoryError(projectName: string) {
  return `该目录已绑定到本地项目「${projectName}」，请先解除原绑定或选择其他目录。`;
}

function getDuplicateWorkshopProjectDirectoryError(projectId: number) {
  return `该目录已绑定到 Workshop 项目 ${projectId}，请先处理原绑定或选择其他目录。`;
}

function getDuplicateLinkedWorkshopProjectError(projectName: string) {
  return `该远端任务源已关联到本地项目「${projectName}」，请先解除原关联。`;
}

function findLocalProjectByWorkshopProject(projects: LocalProject[], workshopProjectId: number, exceptProjectId?: string) {
  return projects.find(
    (project) => project.id !== exceptProjectId && project.linkedWorkshopProjectId === workshopProjectId
  );
}

async function listLocalProjects() {
  const config = await readConfig();
  return config.localProjects;
}

function normalizeCreateLocalProjectRequest(request: CreateLocalProjectRequest): CreateLocalProjectRequest {
  if (!isPlainObject(request)) {
    throw new Error("创建本地项目参数无效");
  }

  const localDirectory = safeLocalProjectText(request.localDirectory, "", 500);
  if (!localDirectory) {
    throw new Error("新建本地项目需要先选择本地目录");
  }

  const directoryName = localDirectory ? safeLocalProjectText(path.basename(localDirectory), "", 80) : "";
  const name = safeLocalProjectText(request.name, "", 80) || directoryName;
  if (!name) {
    throw new Error("本地项目需要名称");
  }

  return {
    name,
    ...(localDirectory ? { localDirectory } : {}),
    ...(safeLinkedWorkshopProjectId(request.linkedWorkshopProjectId)
      ? { linkedWorkshopProjectId: safeLinkedWorkshopProjectId(request.linkedWorkshopProjectId) }
      : {}),
    ...(safeLocalProjectText(request.linkedWorkshopProjectName)
      ? { linkedWorkshopProjectName: safeLocalProjectText(request.linkedWorkshopProjectName) }
      : {})
  };
}

async function createLocalProject(request: CreateLocalProjectRequest) {
  const normalized = normalizeCreateLocalProjectRequest(request);
  const config = await readConfig();
  const now = new Date().toISOString();
  const localDirectory = normalized.localDirectory
    ? await normalizeLocalDirectoryForStorage(normalized.localDirectory)
    : undefined;
  let linkedWorkshopProjectId = normalized.linkedWorkshopProjectId;

  if (linkedWorkshopProjectId) {
    const duplicateLinkedProject = findLocalProjectByWorkshopProject(config.localProjects, linkedWorkshopProjectId);
    if (duplicateLinkedProject) {
      throw new Error(getDuplicateLinkedWorkshopProjectError(duplicateLinkedProject.name));
    }
  }

  if (localDirectory) {
    const duplicateLocalProject = findLocalProjectByDirectory(config.localProjects, localDirectory);
    if (duplicateLocalProject) {
      throw new Error(getDuplicateLocalProjectDirectoryError(duplicateLocalProject.name));
    }

    const legacyWorkshopProjectId = findWorkshopProjectDirectoryId(config.projectLocalDirectories, localDirectory);
    if (legacyWorkshopProjectId && linkedWorkshopProjectId && legacyWorkshopProjectId !== linkedWorkshopProjectId) {
      throw new Error(getDuplicateWorkshopProjectDirectoryError(legacyWorkshopProjectId));
    }
    if (legacyWorkshopProjectId && !linkedWorkshopProjectId) {
      const duplicateLinkedProject = findLocalProjectByWorkshopProject(config.localProjects, legacyWorkshopProjectId);
      if (duplicateLinkedProject) {
        throw new Error(getDuplicateLinkedWorkshopProjectError(duplicateLinkedProject.name));
      }
      linkedWorkshopProjectId = legacyWorkshopProjectId;
    }
  }

  const project: LocalProject = {
    id: `local-${crypto.randomUUID().slice(0, 8)}`,
    name: normalized.name,
    ...(localDirectory ? { localDirectory } : {}),
    ...(linkedWorkshopProjectId ? { linkedWorkshopProjectId } : {}),
    ...(normalized.linkedWorkshopProjectName ? { linkedWorkshopProjectName: normalized.linkedWorkshopProjectName } : {}),
    createdAt: now,
    updatedAt: now
  };
  await saveConfig({ localProjects: [project, ...config.localProjects] });
  return project;
}

function normalizeRenameLocalProjectRequest(request: RenameLocalProjectRequest): RenameLocalProjectRequest {
  if (!isPlainObject(request)) {
    throw new Error("重命名本地项目参数无效");
  }

  const id = normalizeLocalProjectId(request.id);
  const name = safeLocalProjectText(request.name, "", 80);
  if (!name) {
    throw new Error("本地项目需要名称");
  }

  return { id, name };
}

async function renameLocalProject(request: RenameLocalProjectRequest) {
  const normalized = normalizeRenameLocalProjectRequest(request);
  const config = await readConfig();
  const currentProject = config.localProjects.find((project) => project.id === normalized.id);
  if (!currentProject) {
    throw new Error("本地项目不存在");
  }

  if (currentProject.name === normalized.name) {
    return currentProject;
  }

  const now = new Date().toISOString();
  const localProjects = config.localProjects.map((project) =>
    project.id === normalized.id
      ? {
          ...project,
          name: normalized.name,
          updatedAt: now
        }
      : project
  );
  await saveConfig({ localProjects });
  return localProjects.find((project) => project.id === normalized.id) as LocalProject;
}

function normalizeLinkLocalProjectWorkshopProjectRequest(
  request: LinkLocalProjectWorkshopProjectRequest
): LinkLocalProjectWorkshopProjectRequest {
  if (!isPlainObject(request)) {
    throw new Error("关联远端任务源参数无效");
  }

  const localProjectId = normalizeLocalProjectId(request.localProjectId);
  const workshopProjectId = safeLinkedWorkshopProjectId(request.workshopProjectId);
  if (!workshopProjectId) {
    throw new Error("远端任务源 ID 无效");
  }

  const workshopProjectName = safeLocalProjectText(request.workshopProjectName, "", 120);
  return {
    localProjectId,
    workshopProjectId,
    ...(workshopProjectName ? { workshopProjectName } : {})
  };
}

async function linkLocalProjectWorkshopProject(request: LinkLocalProjectWorkshopProjectRequest) {
  const normalized = normalizeLinkLocalProjectWorkshopProjectRequest(request);
  const config = await readConfig();
  const currentProject = config.localProjects.find((project) => project.id === normalized.localProjectId);
  if (!currentProject) {
    throw new Error("本地项目不存在");
  }

  const duplicateLinkedProject = findLocalProjectByWorkshopProject(
    config.localProjects,
    normalized.workshopProjectId,
    normalized.localProjectId
  );
  if (duplicateLinkedProject) {
    throw new Error(getDuplicateLinkedWorkshopProjectError(duplicateLinkedProject.name));
  }

  const now = new Date().toISOString();
  const localProjects = config.localProjects.map((project) =>
    project.id === normalized.localProjectId
      ? {
          ...project,
          linkedWorkshopProjectId: normalized.workshopProjectId,
          ...(normalized.workshopProjectName ? { linkedWorkshopProjectName: normalized.workshopProjectName } : {}),
          updatedAt: now
        }
      : project
  );

  return saveConfig({ localProjects });
}

async function unlinkLocalProjectWorkshopProject(localProjectId: string) {
  const safeId = normalizeLocalProjectId(localProjectId);
  const config = await readConfig();
  const currentProject = config.localProjects.find((project) => project.id === safeId);
  if (!currentProject) {
    throw new Error("本地项目不存在");
  }

  const now = new Date().toISOString();
  const localProjects = config.localProjects.map((project) => {
    if (project.id !== safeId) {
      return project;
    }
    const rest: LocalProject = { ...project };
    delete rest.linkedWorkshopProjectId;
    delete rest.linkedWorkshopProjectName;
    return {
      ...rest,
      updatedAt: now
    };
  });

  return saveConfig({ localProjects });
}

function normalizeLocalProjectId(id: unknown) {
  const safeId = safeLocalProjectId(id);
  if (!safeId) {
    throw new Error("本地项目 ID 无效");
  }
  return safeId;
}

async function chooseLocalProjectDirectory(owner?: BrowserWindow | null) {
  const result = owner
    ? await dialog.showOpenDialog(owner, {
        properties: ["openDirectory", "createDirectory"],
        title: "选择项目目录"
      })
    : await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        title: "选择项目目录"
      });
  const [directory] = result.filePaths;
  if (result.canceled || !directory) {
    return null;
  }

  return normalizeLocalDirectoryForStorage(directory);
}

async function bindLocalProjectDirectory(localProjectId: string, owner?: BrowserWindow | null) {
  const safeId = normalizeLocalProjectId(localProjectId);
  const result = owner
    ? await dialog.showOpenDialog(owner, {
        properties: ["openDirectory", "createDirectory"],
        title: "绑定本地项目目录"
      })
    : await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        title: "绑定本地项目目录"
      });
  const [directory] = result.filePaths;
  if (result.canceled || !directory) {
    return null;
  }

  const localDirectory = await normalizeLocalDirectoryForStorage(directory);
  const config = await readConfig();
  const currentProject = config.localProjects.find((project) => project.id === safeId);
  if (!currentProject) {
    throw new Error("本地项目不存在");
  }

  const duplicateLocalProject = findLocalProjectByDirectory(config.localProjects, localDirectory, safeId);
  if (duplicateLocalProject) {
    throw new Error(getDuplicateLocalProjectDirectoryError(duplicateLocalProject.name));
  }

  const legacyWorkshopProjectId = findWorkshopProjectDirectoryId(config.projectLocalDirectories, localDirectory);
  if (
    legacyWorkshopProjectId &&
    currentProject.linkedWorkshopProjectId &&
    currentProject.linkedWorkshopProjectId !== legacyWorkshopProjectId
  ) {
    throw new Error(getDuplicateWorkshopProjectDirectoryError(legacyWorkshopProjectId));
  }
  if (legacyWorkshopProjectId && !currentProject.linkedWorkshopProjectId) {
    const duplicateLinkedProject = findLocalProjectByWorkshopProject(config.localProjects, legacyWorkshopProjectId, safeId);
    if (duplicateLinkedProject) {
      throw new Error(getDuplicateLinkedWorkshopProjectError(duplicateLinkedProject.name));
    }
  }

  const now = new Date().toISOString();
  const localProjects = config.localProjects.map((project) => {
    if (project.id !== safeId) {
      return project;
    }
    return {
      ...project,
      localDirectory,
      ...(legacyWorkshopProjectId && !project.linkedWorkshopProjectId ? { linkedWorkshopProjectId: legacyWorkshopProjectId } : {}),
      updatedAt: now
    };
  });
  return saveConfig({ localProjects });
}

async function openLocalProjectDirectory(localProjectId: string) {
  const safeId = normalizeLocalProjectId(localProjectId);
  const config = await readConfig();
  const project = config.localProjects.find((item) => item.id === safeId);
  const directory = project?.localDirectory?.trim();
  if (!directory) {
    throw new Error("请先绑定本地目录");
  }

  const error = await shell.openPath(directory);
  if (error) {
    throw new Error(error);
  }
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
    // 受限 token：被派发的 agent 只能使用显式开放的记录能力、项目范围提议和任务读取，不能再触发 codex.send。
    env.WORKSHOP_DESKTOP_SERVER_PORT = String(appServerInfo.port);
    env.WORKSHOP_DESKTOP_SERVER_TOKEN = appServerInfo.agentToken;
  }
  return env;
}

function grantAgentProjectScope(run: CodexRunMeta) {
  if (agentScopedRuns.has(run.runId)) {
    return;
  }
  agentScopedRuns.set(run.runId, run.projectId);
  agentProjectScopeCounts.set(run.projectId, (agentProjectScopeCounts.get(run.projectId) ?? 0) + 1);
}

function revokeAgentProjectScope(runId: string) {
  const projectId = agentScopedRuns.get(runId);
  if (!projectId) {
    return;
  }
  agentScopedRuns.delete(runId);
  const nextCount = (agentProjectScopeCounts.get(projectId) ?? 1) - 1;
  if (nextCount <= 0) {
    agentProjectScopeCounts.delete(projectId);
  } else {
    agentProjectScopeCounts.set(projectId, nextCount);
  }
}

function assertAgentProjectScope(scope: AppServerScope, projectId: number) {
  if (scope === "agent" && !agentProjectScopeCounts.has(projectId)) {
    throw new Error(`当前 AI 运行无权访问项目：${projectId}`);
  }
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

// ===== 取用日志（pull 路径遥测：编程工具主动检索记录池）=====
// 独立于 codex-runs 运行表；D-009 约束运行表只记 Codex turn，取用是 Agent 主动 search 的行为。
const RECORD_SEARCHES_LIMIT = 100;
let recordSearchesQueue: Promise<unknown> = Promise.resolve();

const recordSearchesDirPath = () => path.join(app.getPath("userData"), "record-searches");
const recordSearchesIndexPath = () => path.join(recordSearchesDirPath(), "index.json");

async function readRecordSearches(): Promise<RecordSearchLogEntry[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(recordSearchesIndexPath(), "utf8"));
    return Array.isArray(parsed) ? (parsed as RecordSearchLogEntry[]) : [];
  } catch {
    return [];
  }
}

function mutateRecordSearches(mutate: (entries: RecordSearchLogEntry[]) => RecordSearchLogEntry[]): Promise<RecordSearchLogEntry[]> {
  const next = recordSearchesQueue.then(async () => {
    const entries = mutate(await readRecordSearches()).slice(0, RECORD_SEARCHES_LIMIT);
    await fs.mkdir(recordSearchesDirPath(), { recursive: true });
    const tempPath = `${recordSearchesIndexPath()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(entries, null, 2), "utf8");
    await fs.rename(tempPath, recordSearchesIndexPath());
    return entries;
  });
  recordSearchesQueue = next.catch(() => undefined);
  return next;
}

function appendRecordSearch(entry: RecordSearchLogEntry) {
  return mutateRecordSearches((entries) => [entry, ...entries]);
}

async function readConfirmationRequests(): Promise<AsyncConfirmationMeta[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(confirmationRequestsIndexPath(), "utf8"));
    return Array.isArray(parsed) ? (parsed as AsyncConfirmationMeta[]) : [];
  } catch {
    return [];
  }
}

function mutateConfirmationRequests(mutate: (requests: AsyncConfirmationMeta[]) => AsyncConfirmationMeta[]): Promise<AsyncConfirmationMeta[]> {
  const next = confirmationRequestsQueue.then(async () => {
    const requests = mutate(await readConfirmationRequests()).slice(0, CONFIRMATION_REQUESTS_LIMIT);
    await fs.mkdir(confirmationRequestsDirPath(), { recursive: true });
    const tempPath = `${confirmationRequestsIndexPath()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(requests, null, 2), "utf8");
    await fs.rename(tempPath, confirmationRequestsIndexPath());
    return requests;
  });
  confirmationRequestsQueue = next.catch(() => undefined);
  return next;
}

function upsertConfirmationRequest(request: AsyncConfirmationMeta) {
  return mutateConfirmationRequests((requests) => [request, ...requests.filter((existing) => existing.requestId !== request.requestId)]);
}

async function updateConfirmationRequest(requestId: string, patch: Partial<AsyncConfirmationMeta>) {
  let updated: AsyncConfirmationMeta | null = null;
  await mutateConfirmationRequests((requests) =>
    requests.map((request) => {
      if (request.requestId !== requestId) {
        return request;
      }
      updated = { ...request, ...patch };
      return updated;
    })
  );
  return updated;
}

async function listConfirmationRequestsForAppServer(params: unknown) {
  const { requestId, limit } = normalizeConfirmationStatusParams(params);
  const requests = await readConfirmationRequests();
  if (requestId) {
    return { request: requests.find((request) => request.requestId === requestId) ?? null };
  }
  return { requests: requests.slice(0, limit), total: requests.length };
}

function buildRecordSaveRequest(record: PersonalRecord, bodyMarkdown: string): SavePersonalRecordRequest {
  return {
    id: record.id,
    bodyMarkdown,
    scopeType: record.scopeType,
    status: record.status,
    origin: record.origin,
    localProjectId: record.localProjectId,
    projectId: record.projectId,
    projectName: record.projectName,
    taskId: record.taskId,
    taskTitle: record.taskTitle,
    promotedTaskId: record.promotedTaskId
  };
}

function assertRecordWindowsNotProtected(recordIds: string[]) {
  const targetIds = new Set(recordIds);
  const protectedIds = new Set<string>();
  for (const win of recordWindows) {
    const target = recordWindowTargets.get(win);
    if (!win.isDestroyed() && target?.noteId && targetIds.has(target.noteId) && windowArrangementStates.get(win)?.protected === true) {
      protectedIds.add(target.noteId);
    }
  }
  if (protectedIds.size > 0) {
    throw new Error(`以下记录正在编辑，请先保存或取消编辑：${[...protectedIds].join(", ")}`);
  }
}

function closeRecordDetailWindows(recordIds: string[]) {
  const targetIds = new Set(recordIds);
  for (const win of [...recordWindows]) {
    const target = recordWindowTargets.get(win);
    if (!win.isDestroyed() && target?.noteId && targetIds.has(target.noteId)) {
      win.close();
    }
  }
}

async function changeProjectRecordArchiveStatus(
  projectId: number,
  targets: PersonalRecordStatusChangeTarget[],
  mode: "archive" | "restore"
) {
  assertRecordWindowsNotProtected(targets.map((target) => target.id));
  const records =
    mode === "archive"
      ? await personalRecordStore.archiveProjectRecords(projectId, targets)
      : await personalRecordStore.restoreProjectRecords(projectId, targets);
  for (const record of records) {
    notifyRecordsChanged({ id: record.id, status: record.status, updatedAt: record.updatedAt });
  }
  if (mode === "archive") {
    closeRecordDetailWindows(records.map((record) => record.id));
  }
  return { records, total: records.length };
}

async function executeConfirmationAction(action?: ConfirmationAction): Promise<unknown> {
  if (!action) {
    return null;
  }

  if (action.type === "record.updateBody") {
    const record = await getPersonalRecord(action.recordId);
    if (!record) {
      throw new Error(`记录不存在：${action.recordId}`);
    }
    return { record: await savePersonalRecord(buildRecordSaveRequest(record, action.bodyMarkdown)) };
  }

  if (action.type === "record.appendBody") {
    const record = await getPersonalRecord(action.recordId);
    if (!record) {
      throw new Error(`记录不存在：${action.recordId}`);
    }
    const bodyMarkdown = [record.bodyMarkdown.trimEnd(), action.markdown.trim()].filter(Boolean).join("\n\n");
    return { record: await savePersonalRecord(buildRecordSaveRequest(record, bodyMarkdown)) };
  }

  if (action.type === "record.create") {
    const params = normalizeAppServerRecordParams(action.record);
    const record = await savePersonalRecord({
      bodyMarkdown: params.bodyMarkdown,
      scopeType: params.scopeType ?? "none",
      origin: "agent",
      localProjectId: params.localProjectId,
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

  if (action.type === "record.annotate") {
    return annotateRecordsForAppServer({ annotations: action.annotations });
  }

  if (action.type === "record.archive" || action.type === "record.restore") {
    return changeProjectRecordArchiveStatus(
      action.projectId,
      action.records,
      action.type === "record.archive" ? "archive" : "restore"
    );
  }

  if (action.type === "task.create") {
    const task = getApiResponseData<Task>(await createTaskForDesktop(action));
    return { task };
  }

  const task = getApiResponseData<Task>(await workshopApiService.updateTask({ taskId: action.taskId, state: action.state }));
  notifyTaskChanged({
    id: action.taskId,
    projectId: action.projectId,
    state: action.state,
    updatedAt: task.updated_at,
    completionAt: task.completion_at ?? null
  });
  return { task };
}

async function finalizeAsyncConfirmationRequest(
  requestId: string,
  result: TemporaryConfirmationResult,
  action?: ConfirmationAction
) {
  if (!result.confirmed) {
    await updateConfirmationRequest(requestId, {
      status: result.reason,
      result,
      completedAt: new Date().toISOString()
    });
    return;
  }

  try {
    const actionResult = await executeConfirmationAction(action);
    await updateConfirmationRequest(requestId, {
      status: "confirmed",
      result: actionResult ?? result,
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    await updateConfirmationRequest(requestId, {
      status: "failed",
      result,
      error: error instanceof Error ? error.message : "确认动作执行失败",
      completedAt: new Date().toISOString()
    });
  }
}

function closeTemporaryConfirmationWindows() {
  for (const state of [...temporaryConfirmationWindows.values()]) {
    state.settle({ confirmed: false, reason: "closed" });
  }
}

// 应用退出时可能来不及等待窗口关闭回写；启动时把遗留 pending 确认请求收尾。
function reconcileConfirmationRequestsOnStartup() {
  const completedAt = new Date().toISOString();
  return mutateConfirmationRequests((requests) =>
    requests.map((request) =>
      request.status === "pending"
        ? {
            ...request,
            status: "closed",
            result: { confirmed: false, reason: "closed" },
            completedAt
          }
        : request
    )
  );
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

  grantAgentProjectScope(run);
  try {
    return await (request.backend === "exec" ? sendToCodexExec(run, userInput) : sendToCodexAppServer(run, userInput));
  } catch (error) {
    revokeAgentProjectScope(run.runId);
    throw error;
  }
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
  const takeLastMessage = (detail?: string, status?: CodexRunStatus) => {
    if (lastMessageFlushTimer) {
      clearTimeout(lastMessageFlushTimer);
      lastMessageFlushTimer = null;
    }
    const message = detail || pendingLastMessage;
    return (status === "failed" ? normalizeCodexFailureMessage(message) : message).slice(0, 600);
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
          const lastMessage = takeLastMessage(detail, status);
          void updateCodexRun(run.runId, {
            status,
            completedAt: new Date().toISOString(),
            ...(lastMessage ? { lastMessage } : {})
          });
          revokeAgentProjectScope(run.runId);
        }
      }
    });
    await updateCodexRun(run.runId, { threadId, turnId });
    return { localDirectory: run.cwd, runId: run.runId, backend: "app-server", threadId };
  } catch (error) {
    revokeAgentProjectScope(run.runId);
    const lastMessage = takeLastMessage(error instanceof Error ? error.message : "codex 启动失败", "failed");
    await updateCodexRun(run.runId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      lastMessage
    });
    throw new Error(lastMessage);
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
    revokeAgentProjectScope(run.runId);
    void finalizeCodexExecRun(run.runId, outputPath, code);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => resolve());
      child.once("error", (error) => reject(error));
    });
  } catch (error) {
    revokeAgentProjectScope(run.runId);
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
  if (rpc.method === "context.current") {
    if (scope !== "full") {
      throw new Error("当前受限 token 无权调用 context.current");
    }
    return { context: getCurrentWorkshopContext() };
  }

  if (rpc.method === "confirmation.open") {
    if (scope !== "full") {
      throw new Error("当前受限 token 无权调用 confirmation.open");
    }
    return openTemporaryConfirmationWindow(rpc.params);
  }

  if (rpc.method === "confirmation.request") {
    if (scope !== "full") {
      throw new Error("当前受限 token 无权调用 confirmation.request");
    }
    return requestAsyncConfirmationWindow(rpc.params);
  }

  if (rpc.method === "confirmation.status") {
    if (scope !== "full") {
      throw new Error("当前受限 token 无权调用 confirmation.status");
    }
    return listConfirmationRequestsForAppServer(rpc.params);
  }

  if (rpc.method === "codex.send") {
    if (scope !== "full") {
      throw new Error("当前受限 token 无权调用 codex.send");
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
      throw new Error("当前受限 token 无权调用 record.list");
    }
    return listRecordsForAppServer(rpc.params);
  }

  if (rpc.method === "record.get") {
    if (scope !== "full") {
      throw new Error("当前受限 token 无权调用 record.get");
    }
    return getRecordForAppServer(rpc.params);
  }

  if (rpc.method === "record.open") {
    if (scope !== "full") {
      throw new Error("当前受限 token 无权调用 record.open");
    }
    return openRecordForAppServer(rpc.params);
  }

  if (rpc.method === "record.annotate") {
    if (scope !== "full") {
      throw new Error("当前受限 token 无权调用 record.annotate");
    }
    return annotateRecordsForAppServer(rpc.params);
  }

  if (rpc.method === "record.archive.request" || rpc.method === "record.restore.request") {
    const request = normalizeRecordLifecycleRequest(rpc.params);
    assertAgentProjectScope(scope, request.projectId);
    return requestRecordLifecycleForAppServer(request, rpc.method === "record.archive.request" ? "archive" : "restore");
  }

  if (rpc.method === "record.search") {
    // 读开放：受限 token（agent）也可以调用 record.search
    // 这是 pull 路径：编程工具执行任务前主动检索记录池
    return searchRecordsForAppServer(rpc.params, scope);
  }

  if (rpc.method === "project.list") {
    if (scope !== "full") {
      throw new Error("当前受限 token 无权调用 project.list");
    }
    return listProjectsForAppServer(rpc.params);
  }

  if (rpc.method === "task.creationContext") {
    const value = isPlainObject(rpc.params) ? rpc.params : {};
    const projectId = normalizePositiveNumber(value.projectId, "项目 ID");
    assertAgentProjectScope(scope, projectId);
    return getTaskCreationContextForAppServer(projectId);
  }

  if (rpc.method === "task.list") {
    const request = normalizeAppServerListTasksParams(rpc.params);
    assertAgentProjectScope(scope, request.projectId);
    return listTasksForAppServer(request);
  }

  if (rpc.method === "task.get") {
    const request = normalizeAppServerTaskGetParams(rpc.params);
    assertAgentProjectScope(scope, request.projectId);
    return getTaskForAppServer(request);
  }

  if (rpc.method === "task.create.request") {
    const request = normalizeTaskCreationRequest(rpc.params);
    assertAgentProjectScope(scope, request.projectId);
    return requestTaskCreationForAppServer(request);
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
  agentProjectScopeCounts.clear();
  agentScopedRuns.clear();
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

function openTemporaryConfirmationWindowWithHandler(
  request: Required<TemporaryConfirmationRequest>,
  onSettled: (result: TemporaryConfirmationResult) => void
) {
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
    onSettled(result);
  };

  temporaryConfirmationWindows.set(webContentsId, { win, settle });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("closed", () => settle({ confirmed: false, reason: "closed" }));
  win.once("ready-to-show", () => showInCurrentWorkspace(win));
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderTemporaryConfirmationHtml(request))}`).catch(() => {
    settle({ confirmed: false, reason: "closed" });
  });
  return win;
}

function openTemporaryConfirmationWindow(params: unknown): Promise<TemporaryConfirmationResult> {
  const request = normalizeTemporaryConfirmationParams(params);
  return new Promise((resolve) => {
    openTemporaryConfirmationWindowWithHandler(request, resolve);
  });
}

async function requestAsyncConfirmationWindow(params: unknown) {
  const request = normalizeAsyncConfirmationParams(params);
  const now = new Date().toISOString();
  const meta: AsyncConfirmationMeta = {
    requestId: `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
    title: request.title,
    status: "pending",
    ...(request.action ? { actionType: request.action.type } : {}),
    createdAt: now
  };
  await upsertConfirmationRequest(meta);
  try {
    openTemporaryConfirmationWindowWithHandler(request, (result) => {
      void finalizeAsyncConfirmationRequest(meta.requestId, result, request.action);
    });
  } catch (error) {
    await updateConfirmationRequest(meta.requestId, {
      status: "failed",
      error: error instanceof Error ? error.message : "确认窗口创建失败",
      completedAt: new Date().toISOString()
    });
    throw error;
  }
  return { request: meta };
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
    transparent: true,
    roundedCorners: true,
    hasShadow: true,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: config.stickyAlwaysOnTop,
    title: "Workshop Desktop Note",
    backgroundColor: "#00000000",
    ...windowIconOption(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const webContentsId = win.webContents.id;
  const context = stickyTargetContext(target);
  win.on("closed", () => {
    stickyWindows.delete(win);
    stickyWindowTargets.delete(win);
    clearWindowArrangementLifecycle(win);
    clearSelectedNoteWindowById(webContentsId);
    clearCurrentWorkshopContextIfMatches(context);
  });

  stickyWindows.add(win);
  stickyWindowTargets.set(win, target);
  registerWindowArrangementLifecycle(win);
  win.on("focus", () => markStickyWindowContext(win));
  win.webContents.once("did-finish-load", () => {
    sendNoteWindowFocusState(win, win.webContents.id === selectedNoteWindowId);
  });
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

function getWindowMediaSourceWindowId(win: BrowserWindow) {
  const match = /^window:(\d+):/.exec(win.getMediaSourceId());
  return match?.[1] ?? null;
}

function getDarwinOnScreenWindowIds() {
  if (process.platform !== "darwin") {
    return Promise.resolve<Set<string> | null>(null);
  }

  const script = `
ObjC.import("CoreGraphics");
const ref = $.CGWindowListCopyWindowInfo(1, 0);
const list = ObjC.castRefToObject(ref);
const count = Number(list.count);
const ids = [];
for (let i = 0; i < count; i += 1) {
  const window = list.objectAtIndex(i);
  const id = ObjC.unwrap(window.objectForKey("kCGWindowNumber"));
  if (id !== undefined && id !== null) {
    ids.push(String(id));
  }
}
console.log(JSON.stringify(ids));
`;

  return new Promise<Set<string> | null>((resolve) => {
    const child = spawn("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
      stdio: ["ignore", "pipe", "ignore"]
    });
    let output = "";
    let settled = false;

    const finish = (ids: Set<string> | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(ids);
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish(null);
    }, DARWIN_ON_SCREEN_WINDOW_IDS_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(null);
        return;
      }

      try {
        const parsed = JSON.parse(output) as unknown;
        if (!Array.isArray(parsed)) {
          finish(null);
          return;
        }

        const ids = new Set(
          parsed
            .filter((id): id is string | number => typeof id === "string" || typeof id === "number")
            .map((id) => String(id))
        );
        finish(ids.size > 0 ? ids : null);
      } catch {
        finish(null);
      }
    });
  });
}

function isWindowInCurrentWorkspace(win: BrowserWindow, currentWorkspaceWindowIds: Set<string> | null) {
  if (!currentWorkspaceWindowIds) {
    return true;
  }

  const windowId = getWindowMediaSourceWindowId(win);
  return Boolean(windowId && currentWorkspaceWindowIds.has(windowId));
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

function hideTrayAfterNoteWindowShown(win: BrowserWindow) {
  const trayWindow = windowRef;
  if (!trayWindow || trayWindow.isDestroyed() || !trayWindow.isVisible()) {
    return;
  }

  setTimeout(() => {
    if (trayWindow.isDestroyed() || win.isDestroyed() || !trayWindow.isVisible()) {
      return;
    }
    trayWindow.hide();
  }, 120);
}

function focusExistingNoteWindow(win: BrowserWindow) {
  hideTaskPreviewWindow();
  if (win.isMinimized()) {
    win.restore();
  }
  showInCurrentWorkspace(win);
  pulseWindowFocus(win);
  hideTrayAfterNoteWindowShown(win);
}

function isNoteWindow(win: BrowserWindow | null | undefined): win is BrowserWindow {
  return Boolean(win && !win.isDestroyed() && (stickyWindows.has(win) || recordWindows.has(win)));
}

function positionNoteWindowNearSource(win: BrowserWindow, sourceWin: BrowserWindow) {
  const sourceBounds = sourceWin.getBounds();
  const bounds = win.getBounds();
  const workArea = screen.getDisplayMatching(sourceBounds).workArea;
  const siblingOffset = ([...stickyWindows, ...recordWindows].filter((candidate) => candidate !== win && !candidate.isDestroyed()).length % 4) * 18;
  const rightX = sourceBounds.x + sourceBounds.width + NOTE_ARRANGE_GAP;
  const leftX = sourceBounds.x - bounds.width - NOTE_ARRANGE_GAP;
  const x =
    rightX + bounds.width <= workArea.x + workArea.width - 8
      ? rightX
      : leftX >= workArea.x + 8
        ? leftX
        : clamp(sourceBounds.x + siblingOffset, workArea.x + 8, workArea.x + workArea.width - bounds.width - 8);
  const y = clamp(
    sourceBounds.y + siblingOffset,
    workArea.y + 8,
    workArea.y + workArea.height - bounds.height - 8
  );
  win.setPosition(Math.round(x), Math.round(y), false);
}

async function showStickyWindow(target?: StickyTarget | number, sourceWin?: BrowserWindow | null) {
  const nextTarget = normalizeStickyTarget(target);
  const display = isNoteWindow(sourceWin) ? screen.getDisplayMatching(sourceWin.getBounds()) : getTargetDisplay(nextTarget.x, nextTarget.y);
  const existingWin = findExistingStickyWindow(nextTarget, display.id);
  if (existingWin) {
    focusExistingNoteWindow(existingWin);
    markStickyWindowContext(existingWin);
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
  } else if (isNoteWindow(sourceWin)) {
    positionNoteWindowNearSource(win, sourceWin);
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
  showInCurrentWorkspace(win);
  markStickyWindowContext(win);
  hideTrayAfterNoteWindowShown(win);
}

async function listPersonalRecords() {
  return personalRecordStore.listVisible();
}

async function listAllPersonalRecords() {
  return personalRecordStore.listAll();
}

async function listRecordsForAppServer(params: unknown) {
  const options = normalizeAppServerRecordListParams(params);
  const query = options.query?.toLowerCase();
  let records: PersonalRecordMeta[] = options.status ? await listAllPersonalRecords() : await listPersonalRecords();

  if (options.scopeType) {
    records = records.filter((record) => record.scopeType === options.scopeType);
  }
  if (options.status) {
    records = records.filter((record) => record.status === options.status);
  }
  if (options.localProjectId) {
    records = records.filter((record) => record.localProjectId === options.localProjectId);
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

// record.search：搜 title + body 正文（pull 路径，编程工具主动检索记录池）
// 与 record.list 的区别：list 只搜 meta 字段；search 读 body 正文做关键词匹配。
// 读开放：agent token 也可以调用。读取归档记录时必须显式提供当前活跃项目作用域。
async function searchRecordsForAppServer(params: unknown, scope: AppServerScope) {
  const value = isPlainObject(params) ? params : {};
  const query = safeWindowText(value.query, 200);
  if (!query) {
    throw new Error("record.search 需要 query 参数");
  }
  const localProjectId = safeLocalProjectId(value.localProjectId) || undefined;
  const scopeType = value.scopeType || value.scope ? normalizeRecordScope(value.scopeType ?? value.scope) : undefined;
  const rawLimit = typeof value.limit === "number" && Number.isFinite(value.limit) ? Math.trunc(value.limit) : undefined;
  const limit = rawLimit ? clamp(rawLimit, 1, 50) : 20;
  const includeBody = value.includeBody === true;
  const includeArchived = value.includeArchived === true;
  const projectId = normalizeOptionalPositiveNumber(value.projectId, "项目 ID");
  if (includeArchived && scope === "agent" && projectId === undefined) {
    throw new Error("受限 token 检索归档记录时必须提供项目 ID");
  }
  if (projectId !== undefined) {
    assertAgentProjectScope(scope, projectId);
  }
  const caller = safeWindowText(value.caller, 80) ?? "unknown";
  const protocol: "rpc" | "mcp" = value.protocol === "mcp" ? "mcp" : "rpc";

  const lowerQuery = query.toLowerCase();
  let metas: PersonalRecordMeta[] = includeArchived
    ? (await listAllPersonalRecords()).filter((record) => record.status !== "promoted")
    : await listPersonalRecords();
  if (scopeType) {
    metas = metas.filter((r) => r.scopeType === scopeType);
  }
  if (localProjectId) {
    metas = metas.filter((r) => r.localProjectId === localProjectId);
  }
  if (projectId !== undefined) {
    metas = metas.filter((record) => record.projectId === projectId);
  }

  // 读 body 正文做关键词匹配
  const matched: PersonalRecord[] = [];
  for (const meta of metas) {
    const full = await getPersonalRecord(meta.id);
    if (!full) continue;
    const haystack = [full.title, full.bodyMarkdown, full.projectName, full.taskTitle]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    if (haystack.includes(lowerQuery)) {
      matched.push(full);
    }
    if (matched.length >= limit) break;
  }

  // 记取用日志（遥测，独立于 codex-runs）
  await appendRecordSearch({
    at: new Date().toISOString(),
    caller,
    protocol,
    query,
    matchedRecordIds: matched.map((r) => r.id),
    scope
  });

  const results = includeBody ? matched : matched.map(({ bodyMarkdown, ...meta }) => meta as PersonalRecordMeta);
  return { records: results, total: matched.length, query };
}

async function getRecordForAppServer(params: unknown) {
  const { id } = normalizeAppServerRecordGetParams(params);
  return { record: await getPersonalRecord(id) };
}

async function openRecordForAppServer(params: unknown) {
  const { id } = normalizeAppServerRecordGetParams(params);
  const record = await getPersonalRecord(id);
  if (!record) {
    throw new Error(`记录不存在：${id}`);
  }
  await showPersonalRecordWindow({ noteId: id });
  return { record };
}

async function annotateRecordsForAppServer(params: unknown) {
  const { annotations } = normalizeAppServerRecordAnnotateParams(params);
  const records: PersonalRecordMeta[] = [];
  for (const annotation of annotations) {
    records.push(await annotatePersonalRecord(annotation));
  }
  return { records, total: records.length };
}

function renderRecordLifecycleConfirmationBody(
  mode: "archive" | "restore",
  request: RecordLifecycleRequest,
  records: PersonalRecord[]
) {
  const actionLabel = mode === "archive" ? "归档" : "恢复";
  const rows = records
    .map(
      (record) =>
        `<li><strong>${escapeHtml(record.title)}</strong><br><span>${escapeHtml(record.id)} · ${escapeHtml(record.status)}</span></li>`
    )
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <style>
      body { margin: 0; padding: 22px; color: #1f2428; background: #fff; font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      h2 { margin: 0 0 8px; font-size: 17px; }
      p { margin: 8px 0; }
      ul { margin: 16px 0; padding-left: 22px; }
      li { margin: 0 0 10px; overflow-wrap: anywhere; }
      li span, .hint { color: #69716d; font-size: 12px; }
      .reason { white-space: pre-wrap; padding: 10px 12px; border-radius: 8px; background: #f5f6f3; }
    </style>
  </head>
  <body>
    <h2>确认${actionLabel} ${records.length} 条记录</h2>
    <p>项目 ID：${request.projectId}</p>
    ${request.reason ? `<p class="reason">原因：${escapeHtml(request.reason)}</p>` : ""}
    <ul>${rows}</ul>
    <p class="hint">${
      mode === "archive"
        ? "确认后记录将从当前列表隐藏；正文、标注和任务关联不会删除，可通过恢复命令找回。"
        : "确认后记录将恢复到归档前的 active 或 completed 状态。"
    } 任一记录在确认前发生变化时，本批次不会执行。</p>
  </body>
</html>`;
}

async function requestRecordLifecycleForAppServer(request: RecordLifecycleRequest, mode: "archive" | "restore") {
  const records: PersonalRecord[] = [];
  for (const id of request.recordIds) {
    const record = await getPersonalRecord(id);
    if (!record) {
      throw new Error(`记录不存在：${id}`);
    }
    if (record.projectId !== request.projectId) {
      throw new Error(`记录不属于项目 ${request.projectId}：${id}`);
    }
    if (mode === "archive" && record.status !== "active" && record.status !== "completed") {
      throw new Error(`记录当前不可归档：${record.title}（${record.status}）`);
    }
    if (mode === "restore" && record.status !== "archived") {
      throw new Error(`记录当前不可恢复：${record.title}（${record.status}）`);
    }
    records.push(record);
  }
  assertRecordWindowsNotProtected(records.map((record) => record.id));
  const action: ConfirmationAction = {
    type: mode === "archive" ? "record.archive" : "record.restore",
    projectId: request.projectId,
    records: records.map((record) => ({ id: record.id, expectedUpdatedAt: record.updatedAt }))
  };
  const result = await requestAsyncConfirmationWindow({
    title: mode === "archive" ? "确认归档记录" : "确认恢复记录",
    html: renderRecordLifecycleConfirmationBody(mode, request, records),
    width: 660,
    height: 600,
    action
  });
  return {
    ...result,
    proposal: {
      mode,
      projectId: request.projectId,
      reason: request.reason,
      records: records.map(({ bodyMarkdown: _bodyMarkdown, ...record }) => record)
    }
  };
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

function getProjectTagDisplayName(name: string) {
  const match = name.trim().match(/^\[([^\]]+)\]\(#[0-9a-fA-F]{6,8}\)$/);
  return match?.[1]?.trim() || name.trim();
}

async function getTaskCreationContextForAppServer(projectId: number): Promise<TaskCreationContext> {
  const projectResult = await listProjectsForAppServer({ pageSize: 500 });
  const project = projectResult.projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`项目不存在或当前用户无权访问：${projectId}`);
  }
  const tagsPayload = getApiResponseData<ProjectTag[]>(
    await workshopApiService.listProjectTags({ projectId, pageSize: 200 })
  );
  const tags = extractPayloadList<ProjectTag>(tagsPayload, "tags").filter((tag) => !tag.deleted_at);
  return {
    project,
    currentUserId: project.members?.find((member) => member.is_me)?.user_id,
    tags
  };
}

async function validateTaskCreationRequest(request: CreateTaskRequest) {
  const context = await getTaskCreationContextForAppServer(request.projectId);
  if (!context.project.members?.some((member) => member.user_id === request.executorId)) {
    throw new Error("负责人不是当前项目成员");
  }
  const availableTagIds = new Set(context.tags.map((tag) => tag.id));
  const invalidTagIds = request.tagIds.filter((tagId) => !availableTagIds.has(tagId));
  if (invalidTagIds.length > 0) {
    throw new Error(`标签不属于当前项目：${invalidTagIds.join(", ")}`);
  }
  return context;
}

async function createTaskForDesktop(value: unknown, sender?: WebContents) {
  const request = normalizeTaskCreationRequest(value);
  await validateTaskCreationRequest(request);
  const response = await workshopApiService.createTask(request);
  if (response.ok) {
    notifyTaskCreated(sender);
  }
  return response;
}

function renderTaskCreationConfirmationBody(request: CreateTaskRequest, context: TaskCreationContext) {
  const executor = context.project.members.find((member) => member.user_id === request.executorId);
  const tagNames = request.tagIds.map((tagId) => {
    const tag = context.tags.find((candidate) => candidate.id === tagId);
    return tag ? getProjectTagDisplayName(tag.name) : String(tagId);
  });
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <style>
      body { margin: 0; padding: 22px; color: #1f2428; background: #fff; font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      dl { display: grid; grid-template-columns: 84px 1fr; gap: 12px 16px; margin: 0; }
      dt { color: #69716d; font-weight: 650; }
      dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
      .content { white-space: pre-wrap; }
      .tag { display: inline-block; margin: 0 6px 6px 0; padding: 2px 8px; border-radius: 999px; background: #e8f1ed; color: #1f6f5b; }
      .hint { margin: 20px 0 0; color: #69716d; font-size: 12px; }
    </style>
  </head>
  <body>
    <dl>
      <dt>项目</dt><dd>${escapeHtml(context.project.name)}</dd>
      <dt>待办内容</dt><dd class="content">${escapeHtml(request.content)}</dd>
      <dt>负责人</dt><dd>${escapeHtml(executor?.username || String(request.executorId))}</dd>
      <dt>标签</dt><dd>${tagNames.length > 0 ? tagNames.map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join("") : "未设置"}</dd>
      <dt>初始状态</dt><dd>待办</dd>
    </dl>
    <p class="hint">确认后由 Workshop 创建待办；取消不会写入远端任务系统。</p>
  </body>
</html>`;
}

async function requestTaskCreationForAppServer(params: unknown) {
  const request = normalizeTaskCreationRequest(params);
  const context = await validateTaskCreationRequest(request);
  const result = await requestAsyncConfirmationWindow({
    title: "确认创建待办",
    html: renderTaskCreationConfirmationBody(request, context),
    width: 620,
    height: 520,
    action: { type: "task.create", ...request }
  });
  return { ...result, proposal: request };
}

async function listTasksForAppServer(params: unknown) {
  const request = normalizeAppServerListTasksParams(params);
  const payload = getApiResponseData<TasksPayload | Task[]>(await workshopApiService.listTasks(request));
  const tasks = extractPayloadList<Task>(payload, "tasks");
  let projectTags: ProjectTag[] = [];
  if (tasks.some((task) => Boolean(task.tags?.trim()))) {
    try {
      const tagsPayload = getApiResponseData<ProjectTag[]>(
        await workshopApiService.listProjectTags({ projectId: request.projectId, pageSize: 200 })
      );
      projectTags = extractPayloadList<ProjectTag>(tagsPayload, "tags").filter((tag) => !tag.deleted_at);
    } catch {
      // 标签详情属于展示增强；读取失败不能让已有任务列表一起丢失。
    }
  }
  const tagsById = new Map(projectTags.map((tag) => [tag.id, tag]));
  const enrichedTasks = tasks.map((task) => ({
    ...task,
    tagDetails: (task.tags ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value))
      .map((tagId) => tagsById.get(tagId))
      .filter((tag): tag is ProjectTag => Boolean(tag))
      .map((tag) => ({ ...tag, displayName: getProjectTagDisplayName(tag.name) }))
  }));
  return { tasks: enrichedTasks, total: extractPayloadTotal(payload, tasks.length) };
}

async function getTaskForAppServer(params: unknown) {
  const request = normalizeAppServerTaskGetParams(params);
  const result = await listTasksForAppServer({ projectId: request.projectId, pageSize: 500 });
  const task = result.tasks.find((candidate) => candidate.id === request.taskId) ?? null;
  return { task };
}

function notifyRecordsChanged(notice: PersonalRecordChangeNotice | null = null) {
  if (windowRef && !windowRef.isDestroyed()) {
    windowRef.webContents.send("record:changed", notice);
  }
  if (homeWindowRef && !homeWindowRef.isDestroyed()) {
    homeWindowRef.webContents.send("record:changed", notice);
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

async function annotatePersonalRecord(request: AnnotatePersonalRecordRequest): Promise<PersonalRecordMeta> {
  const record = await personalRecordStore.annotate(request);
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
  localProjectId: string | null;
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
  const localProjectId = safeLocalProjectId(nextTarget?.localProjectId);

  return {
    noteId: noteId && /^[a-zA-Z0-9_-]+$/.test(noteId) ? noteId : null,
    draft: nextTarget?.draft === true,
    scopeType: normalizeRecordScope(nextTarget?.scopeType),
    localProjectId: localProjectId || null,
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

  if (a.localProjectId !== null || b.localProjectId !== null) {
    return a.localProjectId === b.localProjectId;
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
  const opensProjectWorkspace = isRecordListTarget(target) && target.scopeType === "project";
  const opensRecordDetail = Boolean(target.noteId || target.scopeType === "project" || target.scopeType === "task");
  const win = new BrowserWindow({
    width: 360,
    height: opensRecordDetail ? 220 : 480,
    minWidth: 320,
    minHeight: opensRecordDetail ? 188 : 360,
    show: false,
    frame: false,
    transparent: true,
    roundedCorners: true,
    hasShadow: true,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: config.stickyAlwaysOnTop,
    title: opensProjectWorkspace ? "Workshop Project Workspace" : "Workshop Personal Record",
    backgroundColor: "#00000000",
    ...windowIconOption(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const webContentsId = win.webContents.id;
  const context = recordTargetContext(target);
  win.on("closed", () => {
    recordWindows.delete(win);
    recordWindowTargets.delete(win);
    clearWindowArrangementLifecycle(win);
    clearSelectedNoteWindowById(webContentsId);
    clearCurrentWorkshopContextIfMatches(context);
  });

  recordWindows.add(win);
  recordWindowTargets.set(win, target);
  registerWindowArrangementLifecycle(win);
  win.on("focus", () => markRecordWindowContext(win));
  win.webContents.once("did-finish-load", () => {
    sendNoteWindowFocusState(win, win.webContents.id === selectedNoteWindowId);
  });
  loadRenderer(win, {
    surface: "record",
    noteId: target.noteId,
    draft: target.draft ? "1" : null,
    scopeType: target.scopeType,
    localProjectId: target.localProjectId,
    projectId: target.projectId,
    projectName: target.projectName,
    taskId: target.taskId,
    taskTitle: target.taskTitle
  });
  return win;
}

function normalizeTaskComposerTarget(target?: TaskComposerTarget) {
  const value = isPlainObject(target) ? target : {};
  const sourceRecordId = safeWindowText(value.sourceRecordId, 80);
  return {
    projectId:
      typeof value.projectId === "number" && Number.isFinite(value.projectId) && value.projectId > 0
        ? Math.trunc(value.projectId)
        : null,
    initialContent: safeWindowText(value.initialContent, 2000),
    lockProject: value.lockProject === true,
    sourceRecordId:
      sourceRecordId && /^[a-zA-Z0-9_-]+$/.test(sourceRecordId) ? sourceRecordId : null
  };
}

async function createTaskComposerWindow(target: ReturnType<typeof normalizeTaskComposerTarget>) {
  const config = await readConfig();
  const win = new BrowserWindow({
    width: 560,
    height: 640,
    minWidth: 520,
    minHeight: 520,
    maxWidth: 680,
    maxHeight: 760,
    show: false,
    frame: false,
    transparent: true,
    roundedCorners: true,
    hasShadow: true,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: config.stickyAlwaysOnTop,
    title: "创建待办",
    backgroundColor: "#00000000",
    ...windowIconOption(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.on("closed", () => {
    if (taskComposerWindowRef === win) {
      taskComposerWindowRef = null;
    }
  });
  loadRenderer(win, {
    surface: "task-composer",
    projectId: target.projectId,
    initialContent: target.initialContent,
    sourceRecordId: target.sourceRecordId,
    lockProject: target.lockProject
  });
  return win;
}

async function showTaskComposerWindow(target?: TaskComposerTarget, sourceWin?: BrowserWindow | null) {
  if (taskComposerWindowRef && !taskComposerWindowRef.isDestroyed()) {
    if (taskComposerWindowRef.isMinimized()) {
      taskComposerWindowRef.restore();
    }
    showInCurrentWorkspace(taskComposerWindowRef);
    pulseWindowFocus(taskComposerWindowRef);
    return;
  }

  const win = await createTaskComposerWindow(normalizeTaskComposerTarget(target));
  taskComposerWindowRef = win;
  if (sourceWin && !sourceWin.isDestroyed()) {
    positionNoteWindowNearSource(win, sourceWin);
  } else {
    positionWindowOnScreen(win);
  }
  showInCurrentWorkspace(win);
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
  win.on("focus", () => {
    markCurrentWorkshopContext({ kind: "settings", surface: "settings" });
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
  win.on("focus", () => {
    markCurrentWorkshopContext({ kind: "manual", surface: "manual" });
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
  win.on("focus", () => {
    markCurrentWorkshopContext({ kind: "update", surface: "update" });
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

async function showPersonalRecordWindow(target?: PersonalRecordTarget, sourceWin?: BrowserWindow | null) {
  const nextTarget = normalizeRecordTarget(target);
  const display = isNoteWindow(sourceWin) ? screen.getDisplayMatching(sourceWin.getBounds()) : getTargetDisplay(nextTarget.x, nextTarget.y);
  if (nextTarget.scopeType === "task" && nextTarget.projectId !== null && nextTarget.taskId !== null) {
    await showStickyWindow({
      projectId: nextTarget.projectId,
      taskId: nextTarget.taskId,
      x: nextTarget.x ?? undefined,
      y: nextTarget.y ?? undefined
    }, sourceWin);
    return;
  }

  const existingWin = findExistingRecordWindow(nextTarget, display.id);
  if (existingWin) {
    focusExistingNoteWindow(existingWin);
    markRecordWindowContext(existingWin);
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
      }, sourceWin);
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
  } else if (isNoteWindow(sourceWin)) {
    positionNoteWindowNearSource(win, sourceWin);
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
  showInCurrentWorkspace(win);
  markRecordWindowContext(win);
  hideTrayAfterNoteWindowShown(win);
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
    localProjectId: safeLocalProjectId(record.localProjectId) || null,
    projectId: typeof record.projectId === "number" && Number.isFinite(record.projectId) ? record.projectId : null,
    projectName: safeWindowText(record.projectName),
    taskId: typeof record.taskId === "number" && Number.isFinite(record.taskId) ? record.taskId : null,
    taskTitle: safeWindowText(record.taskTitle),
    x: null,
    y: null
  });
  if (win.isFocused()) {
    markRecordWindowContext(win);
  }
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
  const maxWidth = Math.min(Math.max(Math.round(finiteNumber(request.maxWidth, maxAvailableWidth)), minWidth), maxAvailableWidth);
  const requestedMinHeight = Math.min(Math.max(Math.round(finiteNumber(request.minHeight, 56)), 56), maxAvailableHeight);
  const requestedMaxHeight = Math.min(
    Math.max(Math.round(finiteNumber(request.maxHeight, maxAvailableHeight)), requestedMinHeight),
    maxAvailableHeight
  );
  const arrangedMaxHeight = arrangedWindowMaxHeights.get(win);
  const maxHeight = arrangedMaxHeight ? Math.min(requestedMaxHeight, arrangedMaxHeight) : requestedMaxHeight;
  const minHeight = Math.min(requestedMinHeight, maxHeight);
  const width = clamp(Math.round(finiteNumber(request.width, bounds.width)), minWidth, maxWidth);
  const requestedHeight = Math.round(finiteNumber(request.height, bounds.height));
  const userHeight = request.preserveUserHeight ? userResizedWindowHeights.get(win) ?? 0 : 0;
  const height = clamp(Math.max(requestedHeight, userHeight), minHeight, maxHeight);

  win.setMaximumSize(maxAvailableWidth, maxAvailableHeight);
  win.setMinimumSize(minWidth, minHeight);
  win.setMaximumSize(maxWidth, maxHeight);
  const x = clamp(bounds.x, workArea.x + 8, workArea.x + workArea.width - width - 8);
  const y = clamp(bounds.y, workArea.y + 8, workArea.y + workArea.height - height - 8);

  if (bounds.x !== x || bounds.y !== y || bounds.width !== width || bounds.height !== height) {
    win.setBounds({ x, y, width, height }, false);
  }
}

type ArrangeScope = WindowArrangementResult["scope"];
type ArrangeRole = "anchor" | "detail";

interface ArrangeItem {
  win: BrowserWindow;
  groupKey: string;
  scope: ArrangeScope;
  role: ArrangeRole;
  anchorKind: "project-workspace" | "list" | null;
  sourceOrder: number;
  focusOrder: number;
  bounds: Electron.Rectangle;
  minWidth: number;
  minHeight: number;
  collapsedHeight?: number;
  protected: boolean;
}

interface ArrangeColumn {
  items: ArrangeItem[];
}

function compareArrangeItems(a: ArrangeItem, b: ArrangeItem, sourceWin: BrowserWindow) {
  if (a.role !== b.role) {
    return a.role === "anchor" ? -1 : 1;
  }

  if (a.win === sourceWin || b.win === sourceWin) {
    return a.win === sourceWin ? -1 : 1;
  }

  if (a.focusOrder !== b.focusOrder) {
    return b.focusOrder - a.focusOrder;
  }

  if (a.bounds.y !== b.bounds.y) {
    return a.bounds.y - b.bounds.y;
  }

  return a.bounds.x - b.bounds.x;
}

function getCurrentWindowMinWidth(win: BrowserWindow, fallback: number) {
  const [minWidth] = win.getMinimumSize();
  return Number.isFinite(minWidth) && minWidth > 0 ? Math.max(160, Math.round(minWidth)) : fallback;
}

function getCurrentWindowMinHeight(win: BrowserWindow, fallback: number) {
  const [, minHeight] = win.getMinimumSize();
  return Number.isFinite(minHeight) && minHeight > 0 ? Math.max(56, Math.round(minHeight)) : fallback;
}

function resolveProjectArrangeGroup(
  config: AppConfig,
  localProjectId: string | null | undefined,
  projectId: number | null | undefined,
  projectName?: string | null
) {
  const normalizedLocalProjectId = safeLocalProjectId(localProjectId);
  if (normalizedLocalProjectId) {
    return `local-project:${normalizedLocalProjectId}`;
  }

  if (typeof projectId === "number" && Number.isFinite(projectId)) {
    const localProject = config.localProjects.find((project) => project.linkedWorkshopProjectId === projectId);
    return localProject ? `local-project:${localProject.id}` : `workshop-project:${projectId}`;
  }

  const normalizedProjectName = (safeWindowText(projectName) ?? "").toLocaleLowerCase();
  return normalizedProjectName ? `legacy-project:${normalizedProjectName}` : null;
}

function getStickyArrangeItem(win: BrowserWindow, sourceOrder: number, config: AppConfig): ArrangeItem | null {
  const target = stickyWindowTargets.get(win);
  if (!target) {
    return null;
  }

  const projectGroupKey = resolveProjectArrangeGroup(config, null, target.projectId);
  const role: ArrangeRole = target.taskId === null ? "anchor" : "detail";
  return {
    win,
    groupKey: projectGroupKey ?? "tasks",
    scope: projectGroupKey ? "project" : "tasks",
    role,
    anchorKind: role === "anchor" ? "list" : null,
    sourceOrder,
    focusOrder: noteWindowFocusOrder.get(win) ?? 0,
    bounds: win.getBounds(),
    minWidth: getCurrentWindowMinWidth(win, 300),
    minHeight: role === "anchor" ? NOTE_ARRANGE_LIST_MIN_HEIGHT : getCurrentWindowMinHeight(win, 132),
    collapsedHeight: role === "anchor" ? NOTE_ARRANGE_LIST_COLLAPSED_HEIGHT : undefined,
    protected: windowArrangementStates.get(win)?.protected === true
  };
}

async function getRecordArrangeItem(win: BrowserWindow, sourceOrder: number, config: AppConfig): Promise<ArrangeItem | null> {
  const target = recordWindowTargets.get(win);
  if (!target) {
    return null;
  }

  const record = target.noteId ? await getPersonalRecord(target.noteId).catch(() => null) : null;
  const scopeType = record?.scopeType ?? target.scopeType;
  const localProjectId = record?.localProjectId ?? target.localProjectId;
  const projectId = typeof record?.projectId === "number" ? record.projectId : target.projectId;
  const projectName = record?.projectName ?? target.projectName;
  const projectGroupKey =
    scopeType === "project" || scopeType === "task"
      ? resolveProjectArrangeGroup(config, localProjectId, projectId, projectName)
      : null;
  const isProjectScoped = scopeType === "project" || scopeType === "task";
  const role: ArrangeRole = isRecordListTarget(target) ? "anchor" : "detail";
  const anchorKind = role === "anchor" ? (scopeType === "project" ? "project-workspace" : "list") : null;

  return {
    win,
    groupKey: projectGroupKey ?? (isProjectScoped ? `isolated-project:${win.webContents.id}` : "personal-records"),
    scope: isProjectScoped ? "project" : "personal-records",
    role,
    anchorKind,
    sourceOrder,
    focusOrder: noteWindowFocusOrder.get(win) ?? 0,
    bounds: win.getBounds(),
    minWidth: getCurrentWindowMinWidth(win, 320),
    minHeight: role === "anchor" ? NOTE_ARRANGE_LIST_MIN_HEIGHT : getCurrentWindowMinHeight(win, scopeType === "task" ? 132 : 188),
    collapsedHeight:
      role === "anchor"
        ? anchorKind === "project-workspace"
          ? PROJECT_WORKSPACE_COLLAPSED_HEIGHT
          : NOTE_ARRANGE_LIST_COLLAPSED_HEIGHT
        : undefined,
    protected: windowArrangementStates.get(win)?.protected === true
  };
}

async function getArrangeableNoteItems(sourceWin: BrowserWindow, displayId: number) {
  const config = await readConfig();
  const currentWorkspaceWindowIds = await getDarwinOnScreenWindowIds();
  const workspaceFilter = isWindowInCurrentWorkspace(sourceWin, currentWorkspaceWindowIds) ? currentWorkspaceWindowIds : null;
  const stickyItems = [...stickyWindows]
    .filter(
      (win) =>
        !win.isDestroyed() &&
        !win.isMinimized() &&
        win.isVisible() &&
        isWindowOnDisplay(win, displayId) &&
        isWindowInCurrentWorkspace(win, workspaceFilter)
    )
    .map((win, index) => getStickyArrangeItem(win, index, config))
    .filter((item): item is ArrangeItem => Boolean(item));
  const recordItems = (
    await Promise.all(
      [...recordWindows]
        .filter(
          (win) =>
            !win.isDestroyed() &&
            !win.isMinimized() &&
            win.isVisible() &&
            isWindowOnDisplay(win, displayId) &&
            isWindowInCurrentWorkspace(win, workspaceFilter)
        )
        .map((win, index) => getRecordArrangeItem(win, stickyItems.length + index, config))
    )
  ).filter((item): item is ArrangeItem => Boolean(item));
  const items = [...stickyItems, ...recordItems];
  const sourceItem = items.find((item) => item.win === sourceWin) ?? null;
  return {
    items: sourceItem ? items.filter((item) => item.groupKey === sourceItem.groupKey) : [],
    sourceItem
  };
}

function requestCloseNoteWindows(windows: BrowserWindow[]) {
  for (const win of windows) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send("window:closeRequested");
    }
  }
}

async function showProjectCloseMenu(sourceWin: BrowserWindow | null) {
  if (!sourceWin || sourceWin.isDestroyed() || !recordWindows.has(sourceWin)) {
    return;
  }

  const config = await readConfig();
  const stickyItems = [...stickyWindows]
    .filter((win) => !win.isDestroyed())
    .map((win, index) => getStickyArrangeItem(win, index, config))
    .filter((item): item is ArrangeItem => Boolean(item));
  const recordItems = (
    await Promise.all(
      [...recordWindows]
        .filter((win) => !win.isDestroyed())
        .map((win, index) => getRecordArrangeItem(win, stickyItems.length + index, config))
    )
  ).filter((item): item is ArrangeItem => Boolean(item));
  const sourceItem = recordItems.find((item) => item.win === sourceWin);
  if (!sourceItem || sourceItem.scope !== "project" || sourceItem.anchorKind !== "project-workspace") {
    return;
  }

  const projectItems = [...stickyItems, ...recordItems].filter((item) => item.groupKey === sourceItem.groupKey);
  const taskDetails = projectItems.filter((item) => item.role === "detail" && stickyWindows.has(item.win));
  const recordDetails = projectItems.filter((item) => item.role === "detail" && recordWindows.has(item.win));
  const menu = Menu.buildFromTemplate([
    {
      label: `关闭本项目任务详情（${taskDetails.length}）`,
      enabled: taskDetails.length > 0,
      click: () => requestCloseNoteWindows(taskDetails.map((item) => item.win))
    },
    {
      label: `关闭本项目记录详情（${recordDetails.length}）`,
      enabled: recordDetails.length > 0,
      click: () => requestCloseNoteWindows(recordDetails.map((item) => item.win))
    },
    { type: "separator" },
    {
      label: `关闭本项目全部相关窗口（${projectItems.length}）`,
      enabled: projectItems.length > 0,
      click: () => requestCloseNoteWindows(projectItems.map((item) => item.win))
    }
  ]);
  menu.popup({ window: sourceWin });
}

function fitColumnHeights(items: ArrangeItem[], availableHeight: number) {
  const heights = new Map<BrowserWindow, number>();
  const compactAnchors = new Set<BrowserWindow>();
  for (const item of items) {
    heights.set(item.win, clamp(item.bounds.height, item.minHeight, availableHeight));
  }

  const totalHeight = () => items.reduce((sum, item) => sum + (heights.get(item.win) ?? item.minHeight), 0) + Math.max(0, items.length - 1) * NOTE_ARRANGE_GAP;
  let overflow = totalHeight() - availableHeight;
  const anchorItems = items.filter((item) => item.role === "anchor");
  const detailItems = items.filter((item) => item.role === "detail");

  for (const item of anchorItems) {
    if (overflow <= 0) {
      break;
    }

    const height = heights.get(item.win) ?? item.minHeight;
    const shrink = Math.min(Math.max(0, height - item.minHeight), overflow);
    if (shrink > 0) {
      const nextHeight = height - shrink;
      heights.set(item.win, nextHeight);
      if (item.collapsedHeight && nextHeight <= item.collapsedHeight) {
        compactAnchors.add(item.win);
      }
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

  for (const item of anchorItems) {
    if (overflow <= 0) {
      break;
    }

    const collapsedHeight = item.collapsedHeight ?? item.minHeight;
    const height = heights.get(item.win) ?? item.minHeight;
    const shrink = Math.min(Math.max(0, height - collapsedHeight), overflow);
    if (shrink > 0) {
      heights.set(item.win, height - shrink);
      compactAnchors.add(item.win);
      overflow -= shrink;
    }
  }

  return { compactAnchors, heights, overflow };
}

function columnDesiredHeight(column: ArrangeColumn) {
  return (
    column.items.reduce((sum, item) => sum + Math.max(item.minHeight, item.bounds.height), 0) +
    Math.max(0, column.items.length - 1) * NOTE_ARRANGE_GAP
  );
}

function buildArrangeColumns(items: ArrangeItem[], availableHeight: number, maxColumnCount: number, sourceWin: BrowserWindow) {
  const sortedItems = [...items].sort((a, b) => compareArrangeItems(a, b, sourceWin));
  const anchors = sortedItems.filter((item) => item.role === "anchor");
  const details = sortedItems.filter((item) => item.role === "detail");
  const columns: ArrangeColumn[] = anchors.length > 0 ? [{ items: anchors }] : [];

  if (details.length === 0) {
    return columns;
  }

  if (columns.length >= maxColumnCount) {
    for (const detail of details) {
      const target = columns.reduce((shortest, column) =>
        columnDesiredHeight(column) < columnDesiredHeight(shortest) ? column : shortest
      );
      target.items.push(detail);
    }
    return columns;
  }

  const detailColumnLimit = Math.max(1, maxColumnCount - columns.length);
  const detailColumns: ArrangeColumn[] = [];
  for (const detail of details) {
    const currentColumn = detailColumns.at(-1);
    const nextHeight = currentColumn
      ? columnDesiredHeight(currentColumn) + NOTE_ARRANGE_GAP + Math.max(detail.minHeight, detail.bounds.height)
      : 0;
    if (!currentColumn || (nextHeight > availableHeight && detailColumns.length < detailColumnLimit)) {
      detailColumns.push({ items: [detail] });
      continue;
    }

    if (nextHeight <= availableHeight) {
      currentColumn.items.push(detail);
      continue;
    }

    const target = detailColumns.reduce((shortest, column) =>
      columnDesiredHeight(column) < columnDesiredHeight(shortest) ? column : shortest
    );
    target.items.push(detail);
  }

  return [...columns, ...detailColumns];
}

async function arrangeStickyWindows(sourceWin: BrowserWindow | null): Promise<WindowArrangementResult> {
  if (!sourceWin || sourceWin.isDestroyed()) {
    return { count: 0, scope: "none" };
  }

  hideTaskPreviewWindow();
  const display = screen.getDisplayMatching(sourceWin.getBounds());
  const workArea = display.workArea;
  const { items: noteItems, sourceItem } = await getArrangeableNoteItems(sourceWin, display.id);
  if (!sourceItem || noteItems.length === 0) {
    return { count: 0, scope: "none" };
  }

  const protectedItems = noteItems.filter((item) => item.protected);
  if (protectedItems.length > 0) {
    return {
      count: 0,
      blocked: true,
      protectedCount: protectedItems.length,
      scope: sourceItem.scope
    };
  }

  const availableWidth = Math.max(160, workArea.width - NOTE_ARRANGE_MARGIN * 2);
  const minX = workArea.x + NOTE_ARRANGE_MARGIN;
  const minY = workArea.y + NOTE_ARRANGE_MARGIN;
  const availableHeight = Math.max(56, workArea.height - NOTE_ARRANGE_MARGIN * 2);
  const maxColumnCount = Math.max(1, Math.floor((availableWidth + NOTE_ARRANGE_GAP) / (NOTE_ARRANGE_WIDTH + NOTE_ARRANGE_GAP)));
  const columns = buildArrangeColumns(noteItems, availableHeight, maxColumnCount, sourceWin);
  const columnGapWidth = NOTE_ARRANGE_GAP * Math.max(0, columns.length - 1);
  const equalColumnWidth = Math.max(160, Math.floor((availableWidth - columnGapWidth) / Math.max(1, columns.length)));
  const columnWidths = columns.map((column) =>
    Math.min(
      availableWidth,
      Math.max(
        ...column.items.map((item) => item.minWidth),
        Math.min(NOTE_ARRANGE_WIDTH, equalColumnWidth)
      )
    )
  );
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0) + columnGapWidth;
  let nextX = Math.max(minX, workArea.x + workArea.width - NOTE_ARRANGE_MARGIN - totalWidth);

  for (const [columnIndex, column] of columns.entries()) {
    const width = columnWidths[columnIndex] ?? NOTE_ARRANGE_WIDTH;
    const { compactAnchors, heights, overflow } = fitColumnHeights(column.items, availableHeight);
    const isCascaded = overflow > 0 && column.items.length > 1;
    const maxMinHeight = Math.max(...column.items.map((item) => item.minHeight));
    const cascadeStep = isCascaded
      ? Math.max(1, Math.floor((availableHeight - maxMinHeight) / Math.max(1, column.items.length - 1)))
      : 0;
    let nextY = minY;

    for (const [itemIndex, item] of column.items.entries()) {
      const plannedY = isCascaded ? minY + cascadeStep * itemIndex : nextY;
      const maxHeightAtPosition = Math.max(item.minHeight, workArea.y + workArea.height - NOTE_ARRANGE_MARGIN - plannedY);
      const height = Math.min(heights.get(item.win) ?? item.minHeight, maxHeightAtPosition);
      const shouldUseCompactMode = item.role === "anchor" && compactAnchors.has(item.win);
      arrangedWindowMaxHeights.set(item.win, height);
      item.win.webContents.send("window:arrangement", {
        compactMode: shouldUseCompactMode,
        maxHeight: height
      });
      item.win.setMinimumSize(Math.min(item.minWidth, width), Math.min(item.minHeight, height));
      const y = clamp(plannedY, minY, workArea.y + workArea.height - height - NOTE_ARRANGE_MARGIN);
      item.win.setBounds({ x: nextX, y, width, height }, false);
      if (!isCascaded) {
        nextY += height + NOTE_ARRANGE_GAP;
      }
    }

    nextX += width + NOTE_ARRANGE_GAP;
  }

  pulseWindowFocus(sourceWin);
  return { count: noteItems.length, scope: sourceItem.scope };
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

function showMainWindowInAssignedWorkspace(win: BrowserWindow) {
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

function showHomeWindow() {
  hideTaskPreviewWindow();

  if (!homeWindowRef || homeWindowRef.isDestroyed()) {
    homeWindowRef = createHomeWindow();
    positionWindowOnScreen(homeWindowRef);
  }

  if (homeWindowRef.isMinimized()) {
    homeWindowRef.restore();
  }

  showInCurrentWorkspace(homeWindowRef);
  markCurrentWorkshopContext({ kind: "home", surface: "home" });
}

function showWindow(source: WindowOpenSource = "tray") {
  if (!windowRef) {
    return;
  }

  hideTaskPreviewWindow();
  if (mainWindowHasBeenShown) {
    showMainWindowInAssignedWorkspace(windowRef);
    markCurrentWorkshopContext({ kind: "tray", surface: "tray" });
    return;
  }

  if (source === "tray" && positionWindowNearTray(windowRef)) {
    showInCurrentWorkspace(windowRef);
    mainWindowHasBeenShown = true;
    markCurrentWorkshopContext({ kind: "tray", surface: "tray" });
    return;
  }

  positionWindowOnScreen(windowRef);
  showInCurrentWorkspace(windowRef);
  mainWindowHasBeenShown = true;
  markCurrentWorkshopContext({ kind: "tray", surface: "tray" });
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
      label: source === "tray" ? "显示托盘面板" : "打开工作台",
      accelerator: PANEL_SHORTCUT_ACCELERATOR,
      click: () => {
        if (source === "tray") {
          showWindow("tray");
          return;
        }
        showHomeWindow();
      }
    },
    ...(source === "tray"
      ? [
          {
            label: "打开工作台",
            click: () => showHomeWindow()
          }
        ]
      : []),
    {
      label: "使用手册",
      click: () => showManualWindow()
    },
    {
      label: "桌面便签",
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
              label: "打开工作台",
              accelerator: PANEL_SHORTCUT_ACCELERATOR,
              click: () => showHomeWindow()
            },
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
            label: "打开工作台",
            accelerator: PANEL_SHORTCUT_ACCELERATOR,
            click: () => showHomeWindow()
          },
          { type: "separator" },
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
  if (homeWindowRef && !homeWindowRef.isDestroyed() && homeWindowRef.webContents !== sender) {
    homeWindowRef.webContents.send("workshop:refresh", event);
  }
  for (const win of stickyWindows) {
    if (!win.isDestroyed() && win.webContents !== sender) {
      win.webContents.send("workshop:refresh", event);
    }
  }
  for (const win of recordWindows) {
    if (!win.isDestroyed() && win.webContents !== sender) {
      win.webContents.send("workshop:refresh", event);
    }
  }
}

function sendConfigChanged(config: AppConfig) {
  const windows = [
    windowRef,
    homeWindowRef,
    settingsWindowRef,
    manualWindowRef,
    updateWindowRef,
    taskComposerWindowRef,
    ...stickyWindows,
    ...recordWindows
  ];
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
  if (homeWindowRef && !homeWindowRef.isDestroyed()) {
    homeWindowRef.webContents.send("appUpdate:status", status);
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

function notifyRefresh(reason: "manual") {
  sendWorkshopRefresh({ reason });
}

function notifyTaskChanged(notice: TaskStateChangeNotice, sender?: WebContents) {
  hideTaskPreviewWindow();
  sendWorkshopRefresh({ reason: "task-state", task: notice }, sender);
}

function notifyTaskCreated(sender?: WebContents) {
  hideTaskPreviewWindow();
  sendWorkshopRefresh({ reason: "task-created" }, sender);
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

  const localDirectory = await normalizeLocalDirectoryForStorage(directory);
  const config = await readConfig();
  const duplicateWorkshopProjectId = findWorkshopProjectDirectoryId(config.projectLocalDirectories, localDirectory, projectId);
  if (duplicateWorkshopProjectId) {
    throw new Error(getDuplicateWorkshopProjectDirectoryError(duplicateWorkshopProjectId));
  }

  const linkedLocalProject = findLocalProjectByDirectory(config.localProjects, localDirectory);
  const duplicateLinkedProject = findLocalProjectByWorkshopProject(
    config.localProjects,
    projectId,
    linkedLocalProject?.id
  );
  if (duplicateLinkedProject) {
    throw new Error(getDuplicateLinkedWorkshopProjectError(duplicateLinkedProject.name));
  }

  let localProjects = config.localProjects;
  if (linkedLocalProject) {
    if (linkedLocalProject.linkedWorkshopProjectId && linkedLocalProject.linkedWorkshopProjectId !== projectId) {
      throw new Error(getDuplicateLocalProjectDirectoryError(linkedLocalProject.name));
    }

    const now = new Date().toISOString();
    localProjects = config.localProjects.map((localProject) =>
      localProject.id === linkedLocalProject.id
        ? {
            ...localProject,
            linkedWorkshopProjectId: projectId,
            localDirectory,
            updatedAt: now
          }
        : localProject
    );
  }

  return saveConfig({
    localProjects,
    projectLocalDirectories: {
      ...config.projectLocalDirectories,
      [String(projectId)]: localDirectory
    }
  });
}

async function openProjectLocalDirectory(projectId: number) {
  if (!Number.isFinite(projectId)) {
    throw new Error("项目 ID 无效");
  }

  const config = await readConfig();
  const directory = getLocalProjectDirectoryForWorkshopProject(config, projectId);
  if (!directory) {
    throw new Error("请先绑定本地目录");
  }

  const error = await shell.openPath(directory);
  if (error) {
    throw new Error(error);
  }
}

async function getBundledWorkshopCodexSkillStatus() {
  return getWorkshopCodexSkillStatus(bundledWorkshopCodexSkillPath());
}

async function installBundledWorkshopCodexSkill() {
  return installWorkshopCodexSkill(bundledWorkshopCodexSkillPath());
}

async function promptWorkshopCodexSkillInstallIfNeeded() {
  if (!app.isPackaged) {
    return;
  }

  const [config, status] = await Promise.all([readConfig(), getBundledWorkshopCodexSkillStatus()]);
  if (!status.bundled || status.upToDate || !status.sourceHash) {
    return;
  }

  if (config.lastSeenSkillInstallPromptVersion === status.sourceHash) {
    return;
  }

  const result = await dialog.showMessageBox({
    type: "info",
    title: "启用 Codex 协作",
    message: "安装 Workshop Codex skill，获得完整 AI 协作体验",
    detail:
      "该 skill 会安装到 ~/.codex/skills，用于指导 Codex 解析当前 Workshop 项目、初始化 repo 最小文档结构，并通过 workshop CLI 安全回写记录。",
    buttons: ["安装 Skill", "稍后"],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  if (result.response === 0) {
    const installResult = await installBundledWorkshopCodexSkill();
    if (installResult.error || !installResult.upToDate) {
      await dialog.showMessageBox({
        type: "warning",
        title: "Skill 安装失败",
        message: installResult.error || "Workshop Codex skill 未能安装完成",
        detail: "可以稍后在设置页的 AI 协作区块重新安装。"
      });
      return;
    }
  }

  await saveConfig({ lastSeenSkillInstallPromptVersion: status.sourceHash });
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
  ipcMain.handle("workshop:listProjectTags", (_event, request: ListProjectTagsRequest) =>
    workshopApiService.listProjectTags(request)
  );
  ipcMain.handle("workshop:createTask", (event, request: CreateTaskRequest) =>
    createTaskForDesktop(request, event.sender)
  );
  ipcMain.handle("workshop:updateTask", (_event, request: UpdateTaskRequest) =>
    workshopApiService.updateTask(request)
  );
  ipcMain.handle("shell:openExternal", (_event, url: string) => shell.openExternal(url));
  ipcMain.handle("home:open", () => showHomeWindow());
  ipcMain.handle("settings:open", () => showSettingsWindow());
  ipcMain.handle("manual:open", () => showManualWindow());
  ipcMain.handle("sticky:open", (event, target?: StickyTarget | number) =>
    showStickyWindow(target, BrowserWindow.fromWebContents(event.sender))
  );
  ipcMain.handle("record:open", (event, target?: PersonalRecordTarget) =>
    showPersonalRecordWindow(target, BrowserWindow.fromWebContents(event.sender))
  );
  ipcMain.handle("taskComposer:open", (event, target?: TaskComposerTarget) =>
    showTaskComposerWindow(target, BrowserWindow.fromWebContents(event.sender))
  );
  ipcMain.handle("localProject:list", () => listLocalProjects());
  ipcMain.handle("localProject:create", (_event, request: CreateLocalProjectRequest) => createLocalProject(request));
  ipcMain.handle("localProject:rename", (_event, request: RenameLocalProjectRequest) => renameLocalProject(request));
  ipcMain.handle("localProject:linkWorkshopProject", (_event, request: LinkLocalProjectWorkshopProjectRequest) =>
    linkLocalProjectWorkshopProject(request)
  );
  ipcMain.handle("localProject:unlinkWorkshopProject", (_event, localProjectId: string) =>
    unlinkLocalProjectWorkshopProject(localProjectId)
  );
  ipcMain.handle("localProjectDirectory:choose", (event) => chooseLocalProjectDirectory(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle("record:list", () => listPersonalRecords());
  ipcMain.handle("record:get", (_event, id: string) => getPersonalRecord(id));
  ipcMain.handle("record:save", async (event, record: SavePersonalRecordRequest) => {
    const saved = await savePersonalRecord(record);
    syncRecordWindowTarget(event.sender, saved);
    return saved;
  });
  ipcMain.handle("record:close", (_event, id: string) => closeRecordDetailWindows([id]));
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
  ipcMain.handle("window:showProjectCloseMenu", (event) =>
    showProjectCloseMenu(BrowserWindow.fromWebContents(event.sender))
  );
  ipcMain.handle("sticky:arrange", (event) => arrangeStickyWindows(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle("window:fitContent", (event, request: WindowFitRequest) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      fitWindowContent(win, request);
    }
  });
  ipcMain.handle("window:releaseArrangement", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      releaseWindowArrangement(win);
    }
  });
  ipcMain.handle("window:setArrangementState", (event, state: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !isPlainObject(state)) {
      return;
    }
    const nextState = { protected: state.protected === true };
    windowArrangementStates.set(win, nextState);
    if (nextState.protected) {
      releaseWindowArrangement(win);
    }
  });
  ipcMain.handle("sticky:setAlwaysOnTop", async (_event, enabled: boolean) => {
    for (const win of stickyWindows) {
      win.setAlwaysOnTop(enabled);
    }
    for (const win of recordWindows) {
      win.setAlwaysOnTop(enabled);
    }
    if (taskComposerWindowRef && !taskComposerWindowRef.isDestroyed()) {
      taskComposerWindowRef.setAlwaysOnTop(enabled);
    }
    return saveConfig({ stickyAlwaysOnTop: enabled });
  });
  ipcMain.handle("localProjectDirectory:bind", (event, localProjectId: string) =>
    bindLocalProjectDirectory(localProjectId, BrowserWindow.fromWebContents(event.sender))
  );
  ipcMain.handle("localProjectDirectory:open", (_event, localProjectId: string) => openLocalProjectDirectory(localProjectId));
  ipcMain.handle("projectDirectory:bind", (event, projectId: number) =>
    bindProjectLocalDirectory(projectId, BrowserWindow.fromWebContents(event.sender))
  );
  ipcMain.handle("projectDirectory:open", (_event, projectId: number) => openProjectLocalDirectory(projectId));
  ipcMain.handle("codex:send", (_event, request: SendToCodexRequest) => sendToCodex(request));
  ipcMain.handle("codexRuns:list", () => readCodexRuns());
  ipcMain.handle("appUpdate:getStatus", () => getAppUpdateService().getStatus());
  ipcMain.handle("appUpdate:check", () => getAppUpdateService().checkForUpdates());
  ipcMain.handle("appUpdate:install", () => getAppUpdateService().installDownloadedUpdate());
  ipcMain.handle("workshopSkill:getStatus", () => getBundledWorkshopCodexSkillStatus());
  ipcMain.handle("workshopSkill:install", () => installBundledWorkshopCodexSkill());
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  showHomeWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
  closeTemporaryConfirmationWindows();
});

app.on("will-quit", () => {
  codexClient?.stop();
  stopAppServer();
  unregisterGlobalShortcuts();
});

app.on("activate", () => {
  showHomeWindow();
});

app.whenReady().then(async () => {
  registerIpc();
  await migrateLegacyUserDataIfNeeded().catch((error) => {
    console.warn(error instanceof Error ? error.message : "legacy userData migration failed");
  });
  const config = await readConfig();
  await startAppServer().catch((error) => {
    console.warn(error instanceof Error ? error.message : "app server failed to start");
  });
  const cliInstall = await ensureWorkshopCliInstalled({
    appExecutablePath: process.execPath,
    cliScriptPath: bundledCliScriptPath()
  });
  if (!cliInstall.installed) {
    console.warn(cliInstall.error || "Workshop CLI auto-install failed");
  }
  await reconcileConfirmationRequestsOnStartup().catch(() => undefined);
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

  await getAppUpdateService().initialize();
  setTimeout(() => {
    void getAppUpdateService().checkForUpdates();
  }, 3000);
  setTimeout(() => {
    void promptWorkshopCodexSkillInstallIfNeeded().catch((error) => {
      console.warn(error instanceof Error ? error.message : "Workshop Codex skill prompt failed");
    });
  }, 1200);
  setTimeout(() => showHomeWindow(), 400);
});

app.on("window-all-closed", () => {
  // Keep the tray process alive after the hidden popover window closes.
});
