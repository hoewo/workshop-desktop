import type { ApiResponse, AppConfig, PersonalRecordTarget } from "../../shared/types";

export type Surface = "tray" | "sticky" | "record";

export function getSurface(): Surface {
  const surface = new URLSearchParams(window.location.search).get("surface");
  return surface === "sticky" || surface === "record" ? surface : "tray";
}

export function getInitialProjectFilter() {
  const projectId = new URLSearchParams(window.location.search).get("project_id");
  return projectId && /^\d+$/.test(projectId) ? projectId : "all";
}

export function getInitialTaskFilter() {
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

export function getInitialRecordTarget(): PersonalRecordTarget {
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

export function isLoggedIn(config: AppConfig) {
  if (config.authMode === "nebula" || config.authMode === "bearer") {
    return Boolean(config.accessToken.trim());
  }

  return Boolean(config.userId.trim());
}

export function getErrorMessage(payload: unknown, fallback = "请求失败") {
  if (payload && typeof payload === "object") {
    const maybe = payload as { error?: { message?: string }; message?: string; code?: string };
    return maybe.error?.message || maybe.message || maybe.code || fallback;
  }
  return fallback;
}

export function extractList<T>(payload: unknown, key: string): T[] {
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

export async function apiData<T>(request: Promise<ApiResponse<T>>) {
  const response = await request;
  if (!response.ok) {
    throw new Error(response.error || getErrorMessage(response.body, `HTTP ${response.status || 0}`));
  }

  return response.body?.data as T;
}

export function getProjectLocalDirectory(config: AppConfig | null, projectId?: number) {
  if (!config || projectId === undefined || !Number.isFinite(projectId)) {
    return "";
  }
  return config.projectLocalDirectories[String(projectId)] || "";
}

export function normalizeConfig(config: AppConfig): AppConfig {
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

export function canSubmitDirectLogin(config: AppConfig) {
  if (config.authMode === "bearer") {
    return Boolean(config.accessToken.trim());
  }

  if (config.authMode === "debugHeaders") {
    return Boolean(config.userId.trim());
  }

  return true;
}
