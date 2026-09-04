import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  AppConfig,
  AppUpdateStatus,
  CodexRunMeta,
  CreateLocalProjectRequest,
  DesktopBridge,
  LinkLocalProjectWorkshopProjectRequest,
  PersonalRecordChangeNotice,
  PersonalRecordTarget,
  RenameLocalProjectRequest,
  SavePersonalRecordRequest,
  SendToCodexRequest,
  StickyTarget,
  TaskComposerTarget,
  TaskPreviewRequest,
  WindowArrangementNotice,
  WindowArrangementState,
  WindowFocusStateNotice,
  WorkshopRefreshEvent
} from "../shared/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeStickyTarget(target?: StickyTarget | number) {
  if (typeof target === "number") {
    return target;
  }

  return isPlainObject(target) ? target : undefined;
}

function sanitizeRecordTarget(target?: PersonalRecordTarget) {
  return isPlainObject(target) ? target : undefined;
}

function sanitizeTaskComposerTarget(target?: TaskComposerTarget) {
  return isPlainObject(target) ? target : undefined;
}

function sanitizeCreateLocalProjectRequest(request?: CreateLocalProjectRequest) {
  return isPlainObject(request) ? (request as CreateLocalProjectRequest) : undefined;
}

function sanitizeRenameLocalProjectRequest(request?: RenameLocalProjectRequest) {
  return isPlainObject(request) ? (request as RenameLocalProjectRequest) : undefined;
}

function sanitizeLinkLocalProjectWorkshopProjectRequest(request?: LinkLocalProjectWorkshopProjectRequest) {
  return isPlainObject(request) ? (request as LinkLocalProjectWorkshopProjectRequest) : undefined;
}

function sanitizeSendToCodexRequest(request?: SendToCodexRequest) {
  return isPlainObject(request) ? request : undefined;
}

const bridge: DesktopBridge = {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config: Partial<AppConfig>) => ipcRenderer.invoke("config:save", config),
  sendVerification: (request) => ipcRenderer.invoke("auth:sendVerification", request),
  loginWithCode: (request) => ipcRenderer.invoke("auth:loginWithCode", request),
  logoutAuth: () => ipcRenderer.invoke("auth:logout"),
  getCurrentUser: () => ipcRenderer.invoke("workshop:getCurrentUser"),
  listProjects: (request) => ipcRenderer.invoke("workshop:listProjects", request),
  listOrganizations: () => ipcRenderer.invoke("workshop:listOrganizations"),
  listTasks: (request) => ipcRenderer.invoke("workshop:listTasks", request),
  listProjectTags: (request) => ipcRenderer.invoke("workshop:listProjectTags", request),
  createTask: (request) => ipcRenderer.invoke("workshop:createTask", request),
  updateTask: (request) => ipcRenderer.invoke("workshop:updateTask", request),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  openHome: () => ipcRenderer.invoke("home:open"),
  openSettings: () => ipcRenderer.invoke("settings:open"),
  openManual: () => ipcRenderer.invoke("manual:open"),
  openSticky: (target?: StickyTarget | number) => ipcRenderer.invoke("sticky:open", sanitizeStickyTarget(target)),
  openPersonalRecord: (target?: PersonalRecordTarget) => ipcRenderer.invoke("record:open", sanitizeRecordTarget(target)),
  openTaskComposer: (target?: TaskComposerTarget) =>
    ipcRenderer.invoke("taskComposer:open", sanitizeTaskComposerTarget(target)),
  listLocalProjects: () => ipcRenderer.invoke("localProject:list"),
  createLocalProject: (request: CreateLocalProjectRequest) =>
    ipcRenderer.invoke("localProject:create", sanitizeCreateLocalProjectRequest(request)),
  renameLocalProject: (request: RenameLocalProjectRequest) =>
    ipcRenderer.invoke("localProject:rename", sanitizeRenameLocalProjectRequest(request)),
  linkLocalProjectWorkshopProject: (request: LinkLocalProjectWorkshopProjectRequest) =>
    ipcRenderer.invoke("localProject:linkWorkshopProject", sanitizeLinkLocalProjectWorkshopProjectRequest(request)),
  unlinkLocalProjectWorkshopProject: (localProjectId: string) =>
    ipcRenderer.invoke("localProject:unlinkWorkshopProject", localProjectId),
  chooseLocalProjectDirectory: () => ipcRenderer.invoke("localProjectDirectory:choose"),
  listPersonalRecords: () => ipcRenderer.invoke("record:list"),
  getPersonalRecord: (id: string) => ipcRenderer.invoke("record:get", id),
  savePersonalRecord: (record: SavePersonalRecordRequest) => ipcRenderer.invoke("record:save", record),
  closePersonalRecord: (id: string) => ipcRenderer.invoke("record:close", id),
  deletePersonalRecord: (id: string) => ipcRenderer.invoke("record:delete", id),
  showTaskPreview: (request: TaskPreviewRequest) => ipcRenderer.invoke("taskPreview:show", request),
  keepTaskPreview: () => ipcRenderer.invoke("taskPreview:keep"),
  hideTaskPreview: () => ipcRenderer.invoke("taskPreview:hide"),
  notifyTaskChanged: (notice) => ipcRenderer.invoke("task:changed", notice),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  closeSticky: () => ipcRenderer.invoke("sticky:close"),
  showProjectCloseMenu: () => ipcRenderer.invoke("window:showProjectCloseMenu"),
  arrangeStickyWindows: () => ipcRenderer.invoke("sticky:arrange"),
  fitWindowContent: (request) => ipcRenderer.invoke("window:fitContent", request),
  releaseWindowArrangement: () => ipcRenderer.invoke("window:releaseArrangement"),
  setWindowArrangementState: (state: WindowArrangementState) => ipcRenderer.invoke("window:setArrangementState", state),
  setStickyAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke("sticky:setAlwaysOnTop", enabled),
  bindLocalProjectDirectory: (localProjectId: string) => ipcRenderer.invoke("localProjectDirectory:bind", localProjectId),
  openLocalProjectDirectory: (localProjectId: string) => ipcRenderer.invoke("localProjectDirectory:open", localProjectId),
  bindProjectLocalDirectory: (projectId: number) => ipcRenderer.invoke("projectDirectory:bind", projectId),
  openProjectLocalDirectory: (projectId: number) => ipcRenderer.invoke("projectDirectory:open", projectId),
  sendToCodex: (request: SendToCodexRequest) => ipcRenderer.invoke("codex:send", sanitizeSendToCodexRequest(request)),
  listCodexRuns: () => ipcRenderer.invoke("codexRuns:list"),
  getUpdateStatus: () => ipcRenderer.invoke("appUpdate:getStatus"),
  checkForUpdates: () => ipcRenderer.invoke("appUpdate:check"),
  installUpdate: () => ipcRenderer.invoke("appUpdate:install"),
  getWorkshopCodexSkillStatus: () => ipcRenderer.invoke("workshopSkill:getStatus"),
  installWorkshopCodexSkill: () => ipcRenderer.invoke("workshopSkill:install"),
  onConfigChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload as AppConfig);
    ipcRenderer.on("config:changed", listener);
    return () => ipcRenderer.removeListener("config:changed", listener);
  },
  onCodexRunsChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback(Array.isArray(payload) ? (payload as CodexRunMeta[]) : []);
    ipcRenderer.on("codexRuns:changed", listener);
    return () => ipcRenderer.removeListener("codexRuns:changed", listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload as AppUpdateStatus);
    ipcRenderer.on("appUpdate:status", listener);
    return () => ipcRenderer.removeListener("appUpdate:status", listener);
  },
  onFocusPulse: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("window:focusPulse", listener);
    return () => ipcRenderer.removeListener("window:focusPulse", listener);
  },
  onWindowFocusState: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload as WindowFocusStateNotice);
    ipcRenderer.on("window:focusState", listener);
    return () => ipcRenderer.removeListener("window:focusState", listener);
  },
  onWindowArrangement: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload as WindowArrangementNotice);
    ipcRenderer.on("window:arrangement", listener);
    return () => ipcRenderer.removeListener("window:arrangement", listener);
  },
  onWindowCloseRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("window:closeRequested", listener);
    return () => ipcRenderer.removeListener("window:closeRequested", listener);
  },
  onRefresh: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload as WorkshopRefreshEvent);
    ipcRenderer.on("workshop:refresh", listener);
    return () => ipcRenderer.removeListener("workshop:refresh", listener);
  },
  onRecordsChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback((payload as PersonalRecordChangeNotice | null) ?? null);
    ipcRenderer.on("record:changed", listener);
    return () => ipcRenderer.removeListener("record:changed", listener);
  }
};

contextBridge.exposeInMainWorld("workshopDesktop", bridge);
