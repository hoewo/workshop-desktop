import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  ApiRequest,
  ApiResponse,
  AppConfig,
  DesktopBridge,
  PersonalRecordTarget,
  SavePersonalRecordRequest,
  StickyTarget,
  TaskPreviewRequest,
  WindowArrangementNotice,
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

const bridge: DesktopBridge = {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config: Partial<AppConfig>) => ipcRenderer.invoke("config:save", config),
  sendVerification: (request) => ipcRenderer.invoke("auth:sendVerification", request),
  loginWithCode: (request) => ipcRenderer.invoke("auth:loginWithCode", request),
  logoutAuth: () => ipcRenderer.invoke("auth:logout"),
  request: <T>(request: ApiRequest) => ipcRenderer.invoke("api:request", request) as Promise<ApiResponse<T>>,
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  openSticky: (target?: StickyTarget | number) => ipcRenderer.invoke("sticky:open", sanitizeStickyTarget(target)),
  openPersonalRecord: (target?: PersonalRecordTarget) => ipcRenderer.invoke("record:open", sanitizeRecordTarget(target)),
  listPersonalRecords: () => ipcRenderer.invoke("record:list"),
  getPersonalRecord: (id: string) => ipcRenderer.invoke("record:get", id),
  savePersonalRecord: (record: SavePersonalRecordRequest) => ipcRenderer.invoke("record:save", record),
  deletePersonalRecord: (id: string) => ipcRenderer.invoke("record:delete", id),
  showTaskPreview: (request: TaskPreviewRequest) => ipcRenderer.invoke("taskPreview:show", request),
  keepTaskPreview: () => ipcRenderer.invoke("taskPreview:keep"),
  hideTaskPreview: () => ipcRenderer.invoke("taskPreview:hide"),
  notifyTaskChanged: (notice) => ipcRenderer.invoke("task:changed", notice),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  closeSticky: () => ipcRenderer.invoke("sticky:close"),
  arrangeStickyWindows: () => ipcRenderer.invoke("sticky:arrange"),
  fitWindowContent: (request) => ipcRenderer.invoke("window:fitContent", request),
  setStickyAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke("sticky:setAlwaysOnTop", enabled),
  onFocusPulse: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("window:focusPulse", listener);
    return () => ipcRenderer.removeListener("window:focusPulse", listener);
  },
  onWindowArrangement: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload as WindowArrangementNotice);
    ipcRenderer.on("window:arrangement", listener);
    return () => ipcRenderer.removeListener("window:arrangement", listener);
  },
  onRefresh: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload as WorkshopRefreshEvent);
    ipcRenderer.on("workshop:refresh", listener);
    return () => ipcRenderer.removeListener("workshop:refresh", listener);
  },
  onRecordsChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("record:changed", listener);
    return () => ipcRenderer.removeListener("record:changed", listener);
  }
};

contextBridge.exposeInMainWorld("workshopDesktop", bridge);
