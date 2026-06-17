import type {
  ApiResponse,
  AppConfig,
  AuthTokens,
  CreateTaskRequest,
  CurrentUserPayload,
  ListProjectsRequest,
  ListTasksRequest,
  LoginPayload,
  LoginRequest,
  Organization,
  OrganizationsPayload,
  Project,
  ProjectsPayload,
  Task,
  TaskState,
  TasksPayload,
  UpdateTaskRequest,
  VerificationRequest
} from "../shared/types";

type ApiQueryValue = string | number | boolean | Array<string | number | boolean> | undefined;

interface ApiRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  authLevel?: "user" | "public" | "apikey";
  path: string;
  query?: Record<string, ApiQueryValue>;
  body?: unknown;
}

export interface WorkshopApiServiceDeps {
  readConfig: () => Promise<AppConfig>;
  saveConfig: (next: Partial<AppConfig>) => Promise<AppConfig>;
}

const defaultTaskListStates: TaskState[] = [
  "pending",
  "in_progress",
  "pending_review",
  "completed",
  "accepted",
  "cancelled",
  "blocked"
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeText(value: unknown, maxLength = 120) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
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

function normalizePositiveInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} 无效`);
  }
  return Math.trunc(value);
}

function normalizePageSize(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 200;
  }
  return clamp(Math.trunc(value), 1, 500);
}

function normalizeTaskStateList(value: unknown) {
  if (!Array.isArray(value)) {
    return defaultTaskListStates;
  }
  const states = value.filter(isTaskState);
  return states.length > 0 ? states : defaultTaskListStates;
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

function buildServiceUrl(config: AppConfig, serviceName: string, authLevel: string, pathPart: string) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const normalizedPath = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  return new URL(`${base}/${serviceName}/v1/${authLevel}${normalizedPath}`);
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

export class WorkshopApiService {
  private tokenRefreshInProgress: Promise<AppConfig> | null = null;

  constructor(private readonly deps: WorkshopApiServiceDeps) {}

  sendVerification(request: VerificationRequest): Promise<ApiResponse<{ message?: string }>> {
    return this.deps.readConfig().then((config) =>
      this.serviceRequest(config, "auth-server", "public", "/send_verification", "POST", {
        code_type: request.codeType,
        target: request.target,
        purpose: "login"
      })
    );
  }

  async loginWithCode(request: LoginRequest): Promise<ApiResponse<LoginPayload>> {
    const config = await this.deps.readConfig();
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
    const response = await this.serviceRequest<LoginPayload>(config, "auth-server", "public", "/login", "POST", body);

    const payload = response.body?.data;
    const tokens = extractAuthTokens(payload?.tokens);
    if (response.ok && payload && tokens) {
      const user = payload.user;
      await this.deps.saveConfig({
        ...applyNebulaTokens(config, tokens),
        username: user?.username || user?.email || user?.phone || ""
      });
    }

    return response;
  }

  logoutAuth() {
    return this.deps.saveConfig({
      accessToken: "",
      refreshToken: "",
      accessTokenExpiresAt: 0,
      refreshTokenExpiresAt: 0,
      userId: "",
      username: "",
      sessionId: ""
    });
  }

  getCurrentUser() {
    return this.performApiRequest<CurrentUserPayload>({
      method: "GET",
      path: "/users"
    });
  }

  listProjects(request?: ListProjectsRequest) {
    const value: Record<string, unknown> = isPlainObject(request) ? request : {};
    const organizationId =
      typeof value.organizationId === "number" && Number.isFinite(value.organizationId) && value.organizationId > 0
        ? Math.trunc(value.organizationId)
        : undefined;
    return this.performApiRequest<ProjectsPayload | Project[]>({
      method: "GET",
      path: "/projects",
      query: {
        page_size: normalizePageSize(value.pageSize),
        organization_id: organizationId
      }
    });
  }

  listOrganizations() {
    return this.performApiRequest<OrganizationsPayload | Organization[]>({
      method: "GET",
      path: "/organizations",
      query: {
        page_size: 200
      }
    });
  }

  listTasks(request: ListTasksRequest) {
    const value: Record<string, unknown> = isPlainObject(request) ? request : {};
    const projectId = normalizePositiveInteger(value.projectId, "项目 ID");
    return this.performApiRequest<TasksPayload | Task[]>({
      method: "GET",
      path: "/tasks",
      query: {
        project_id: projectId,
        state: normalizeTaskStateList(value.states),
        page_size: normalizePageSize(value.pageSize)
      }
    });
  }

  createTask(request: CreateTaskRequest) {
    const value: Record<string, unknown> = isPlainObject(request) ? request : {};
    const projectId = normalizePositiveInteger(value.projectId, "项目 ID");
    const content = safeText(value.content, 2000);
    if (!content) {
      throw new Error("任务内容不能为空");
    }
    return this.performApiRequest<Task>({
      method: "POST",
      path: "/tasks",
      body: {
        project_id: projectId,
        content
      }
    });
  }

  updateTask(request: UpdateTaskRequest) {
    const value: Record<string, unknown> = isPlainObject(request) ? request : {};
    const taskId = normalizePositiveInteger(value.taskId, "任务 ID");
    const state = value.state;
    if (!isTaskState(state)) {
      throw new Error("任务状态无效");
    }
    return this.performApiRequest<Task>({
      method: "PUT",
      path: `/tasks/${taskId}`,
      body: { state }
    });
  }

  private async serviceRequest<T>(
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

  private async refreshNebulaToken(config: AppConfig): Promise<AppConfig> {
    if (!config.refreshToken.trim() || refreshTokenExpired(config)) {
      throw new Error("登录已过期，请重新登录");
    }

    if (!this.tokenRefreshInProgress) {
      this.tokenRefreshInProgress = this.serviceRequest<AuthTokens>(config, "auth-server", "public", "/refresh_token", "POST", {
        refresh_token: config.refreshToken.trim()
      })
        .then((response) => {
          const tokens = extractAuthTokens(response.body?.data);
          if (!response.ok || !tokens) {
            throw new Error(response.error || response.body?.error?.message || "刷新 token 失败");
          }
          return this.deps.saveConfig(applyNebulaTokens(config, tokens));
        })
        .finally(() => {
          this.tokenRefreshInProgress = null;
        });
    }

    return this.tokenRefreshInProgress;
  }

  private async performApiRequest<T>(request: ApiRequest): Promise<ApiResponse<T>> {
    let config = await this.deps.readConfig();

    if (config.authMode === "nebula" && tokenExpiresSoon(config)) {
      try {
        config = await this.refreshNebulaToken(config);
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
        config = await this.refreshNebulaToken(config);
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
}
