export type AuthMode = "nebula" | "bearer" | "debugHeaders";

export interface AppConfig {
  baseUrl: string;
  serviceName: string;
  authMode: AuthMode;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  userId: string;
  username: string;
  appId: string;
  sessionId: string;
  dailyRefreshEnabled: boolean;
  dailyRefreshTime: string;
  stickyAlwaysOnTop: boolean;
  showDockIcon: boolean;
  globalShortcutEnabled: boolean;
  lastSeenManualRevision: string;
  projectLocalDirectories: Record<string, string>;
}

export interface ApiEnvelope<T> {
  code?: string;
  data?: T;
  meta?: {
    page?: number;
    page_size?: number;
    total?: number;
  };
  error?: {
    message?: string;
    details?: unknown;
  };
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  body?: ApiEnvelope<T>;
  error?: string;
}

export type VerificationCodeType = "email" | "sms";

export interface VerificationRequest {
  codeType: VerificationCodeType;
  target: string;
}

export interface LoginRequest {
  codeType: VerificationCodeType;
  target: string;
  code: string;
}

export interface LoginUser {
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  is_active?: boolean;
  is_verified?: boolean;
  is_admin?: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  refresh_expires_in?: number;
  access_token_expires_at?: number;
  refresh_token_expires_at?: number;
  key_id?: string;
}

export interface LoginPayload {
  user?: LoginUser;
  tokens: AuthTokens;
}

export interface ListProjectsRequest {
  organizationId?: number;
  pageSize?: number;
}

export interface ListTasksRequest {
  projectId: number;
  states?: TaskState[];
  pageSize?: number;
}

export interface CreateTaskRequest {
  projectId: number;
  content: string;
}

export interface UpdateTaskRequest {
  taskId: number;
  state: TaskState;
}

export interface ProjectMember {
  id: number;
  user_id: number;
  role: "owner" | "admin" | "member" | string;
  duty?: string | null;
  username: string;
  avatar: string;
  created_at: string;
  is_me: boolean;
  is_external: boolean;
}

export interface Project {
  id: number;
  name: string;
  git_url?: string | null;
  organization_id?: number | null;
  organizationName?: string;
  creator_id: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  members: ProjectMember[];
}

export interface Organization {
  id: number;
  name: string;
  description?: string | null;
  creator_id?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CurrentUserPayload {
  username?: string;
  avatar?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Task {
  id: number;
  project_id: number;
  father_id?: number | null;
  content: string;
  state: TaskState;
  creator_id: number;
  executor_id?: number | null;
  priority?: number | null;
  tags?: string | null;
  created_at: string;
  updated_at: string;
  completion_at?: string | null;
  deleted_at?: string | null;
}

export type TaskState =
  | "pending"
  | "in_progress"
  | "pending_review"
  | "completed"
  | "accepted"
  | "cancelled"
  | "blocked";

export interface ProjectsPayload {
  projects: Project[];
  total: number;
}

export interface OrganizationsPayload {
  organizations: Organization[];
  total: number;
}

export interface TasksPayload {
  tasks: Task[];
  total: number;
}

export interface TaskPreviewItem {
  id: number;
  projectId: number;
  content: string;
  state: TaskState;
  stateLabel: string;
}

export interface TaskPreviewRequest {
  count: number;
  anchor: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  tasks: TaskPreviewItem[];
}

export interface TaskStateChangeNotice {
  id: number;
  projectId: number;
  state: TaskState;
  updatedAt?: string | null;
  completionAt?: string | null;
}

export interface WorkshopRefreshEvent {
  reason: "manual" | "schedule" | "task-state";
  task?: TaskStateChangeNotice;
}

export interface StickyTarget {
  projectId?: number;
  taskId?: number;
  x?: number;
  y?: number;
}

export type PersonalRecordScope = "none" | "project" | "task";
export type PersonalRecordStatus = "active" | "completed" | "promoted" | "archived";
// 缺省视为 human，兼容没有 origin 字段的历史记录。
export type PersonalRecordOrigin = "human" | "agent";

export interface PersonalRecordAnnotation {
  namespace: string;
  aiTitle?: string;
  type?: string;
  summary?: string;
  status?: string;
  confidence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalRecordMeta {
  id: string;
  title: string;
  scopeType: PersonalRecordScope;
  status: PersonalRecordStatus;
  origin?: PersonalRecordOrigin;
  projectId?: number;
  projectName?: string;
  taskId?: number;
  taskTitle?: string;
  promotedTaskId?: number;
  annotations?: PersonalRecordAnnotation[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonalRecord extends PersonalRecordMeta {
  bodyMarkdown: string;
}

export interface PersonalRecordChangeNotice {
  id: string;
  status?: PersonalRecordStatus;
  deleted?: boolean;
  updatedAt?: string | null;
}

export interface PersonalRecordTarget {
  noteId?: string;
  draft?: boolean;
  scopeType?: PersonalRecordScope;
  projectId?: number;
  projectName?: string;
  taskId?: number;
  taskTitle?: string;
  x?: number;
  y?: number;
}

export interface SavePersonalRecordRequest {
  id?: string;
  bodyMarkdown: string;
  scopeType: PersonalRecordScope;
  status?: PersonalRecordStatus;
  origin?: PersonalRecordOrigin;
  projectId?: number;
  projectName?: string;
  taskId?: number;
  taskTitle?: string;
  promotedTaskId?: number;
}

export interface AnnotatePersonalRecordRequest {
  id: string;
  annotation: Partial<Omit<PersonalRecordAnnotation, "createdAt" | "updatedAt">> & {
    namespace: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

export type CodexSendKind = "task" | "record";
export type CodexRunBackend = "exec" | "app-server";
export type CodexRunStatus = "running" | "completed" | "failed" | "interrupted";

export interface SendToCodexRequest {
  kind: CodexSendKind;
  projectId: number;
  projectName?: string;
  title: string;
  bodyMarkdown?: string;
  taskId?: number;
  recordId?: string;
  backend?: CodexRunBackend;
}

export interface SendToCodexResponse {
  localDirectory: string;
  runId: string;
  backend: CodexRunBackend;
  threadId?: string;
}

export type TemporaryConfirmationReason = "confirmed" | "cancelled" | "closed";

export interface TemporaryConfirmationRequest {
  title?: string;
  html: string;
  width?: number;
  height?: number;
}

export interface TemporaryConfirmationResult {
  confirmed: boolean;
  reason: TemporaryConfirmationReason;
  payload?: unknown;
}

export type WorkshopContextKind = "none" | "project" | "task" | "record" | "record-draft" | "tray" | "settings" | "manual" | "update";

export interface WorkshopCurrentContext {
  kind: WorkshopContextKind;
  surface?: "tray" | "sticky" | "record" | "settings" | "manual" | "update" | "confirmation";
  projectId?: number;
  projectName?: string;
  taskId?: number;
  taskTitle?: string;
  recordId?: string;
  focusedAt?: string;
  stale?: boolean;
}

export type ConfirmationAction =
  | {
      type: "record.updateBody";
      recordId: string;
      bodyMarkdown: string;
    }
  | {
      type: "record.appendBody";
      recordId: string;
      markdown: string;
    }
  | {
      type: "record.create";
      record: {
        title?: string;
        bodyMarkdown?: string;
        body?: string;
        scopeType?: PersonalRecordScope;
        projectId?: number;
        projectName?: string;
        taskId?: number;
        taskTitle?: string;
        open?: boolean;
      };
    }
  | {
      type: "record.annotate";
      annotations: AnnotatePersonalRecordRequest[];
    }
  | {
      type: "task.create";
      projectId: number;
      content: string;
    }
  | {
      type: "task.updateState";
      taskId: number;
      projectId: number;
      state: TaskState;
    };

export interface AsyncConfirmationRequest {
  title?: string;
  html: string;
  width?: number;
  height?: number;
  action?: ConfirmationAction;
}

export type AsyncConfirmationStatus = "pending" | "confirmed" | "cancelled" | "closed" | "failed";

export interface AsyncConfirmationMeta {
  requestId: string;
  title: string;
  status: AsyncConfirmationStatus;
  actionType?: ConfirmationAction["type"];
  result?: unknown;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// 运行是执行遥测，不是知识对象；它不参与记录/任务的晋升流程。
export interface CodexRunMeta {
  runId: string;
  backend: CodexRunBackend;
  kind: CodexSendKind;
  title: string;
  projectId: number;
  projectName?: string;
  taskId?: number;
  recordId?: string;
  cwd: string;
  threadId?: string;
  turnId?: string;
  status: CodexRunStatus;
  lastMessage?: string;
  outputPath?: string;
  startedAt: string;
  completedAt?: string;
}

export interface WindowFitRequest {
  width?: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface WindowArrangementNotice {
  compactList?: boolean;
  maxHeight?: number;
}

export interface WindowFocusStateNotice {
  selected: boolean;
}

export type AppUpdatePhase =
  | "idle"
  | "disabled"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not_available"
  | "error";

export interface AppUpdateStatus {
  phase: AppUpdatePhase;
  currentVersion: string;
  availableVersion?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  message?: string;
  checkedAt?: string;
  downloadedAt?: string;
}

export interface DesktopBridge {
  getConfig: () => Promise<AppConfig>;
  saveConfig: (config: Partial<AppConfig>) => Promise<AppConfig>;
  sendVerification: (request: VerificationRequest) => Promise<ApiResponse<{ message?: string }>>;
  loginWithCode: (request: LoginRequest) => Promise<ApiResponse<LoginPayload>>;
  logoutAuth: () => Promise<AppConfig>;
  getCurrentUser: () => Promise<ApiResponse<CurrentUserPayload>>;
  listProjects: (request?: ListProjectsRequest) => Promise<ApiResponse<ProjectsPayload | Project[]>>;
  listOrganizations: () => Promise<ApiResponse<OrganizationsPayload | Organization[]>>;
  listTasks: (request: ListTasksRequest) => Promise<ApiResponse<TasksPayload | Task[]>>;
  createTask: (request: CreateTaskRequest) => Promise<ApiResponse<Task>>;
  updateTask: (request: UpdateTaskRequest) => Promise<ApiResponse<Task>>;
  openExternal: (url: string) => Promise<void>;
  openSettings: () => Promise<void>;
  openManual: () => Promise<void>;
  openSticky: (target?: StickyTarget | number) => Promise<void>;
  openPersonalRecord: (target?: PersonalRecordTarget) => Promise<void>;
  listPersonalRecords: () => Promise<PersonalRecordMeta[]>;
  getPersonalRecord: (id: string) => Promise<PersonalRecord | null>;
  savePersonalRecord: (record: SavePersonalRecordRequest) => Promise<PersonalRecord>;
  deletePersonalRecord: (id: string) => Promise<void>;
  showTaskPreview: (request: TaskPreviewRequest) => Promise<void>;
  keepTaskPreview: () => Promise<void>;
  hideTaskPreview: () => Promise<void>;
  notifyTaskChanged: (notice: TaskStateChangeNotice) => Promise<void>;
  closeWindow: () => Promise<void>;
  closeSticky: () => Promise<void>;
  arrangeStickyWindows: () => Promise<void>;
  fitWindowContent: (request: WindowFitRequest) => Promise<void>;
  setStickyAlwaysOnTop: (enabled: boolean) => Promise<AppConfig>;
  bindProjectLocalDirectory: (projectId: number) => Promise<AppConfig | null>;
  openProjectLocalDirectory: (projectId: number) => Promise<void>;
  sendToCodex: (request: SendToCodexRequest) => Promise<SendToCodexResponse>;
  listCodexRuns: () => Promise<CodexRunMeta[]>;
  getUpdateStatus: () => Promise<AppUpdateStatus>;
  checkForUpdates: () => Promise<AppUpdateStatus>;
  installUpdate: () => Promise<void>;
  onConfigChanged: (callback: (config: AppConfig) => void) => () => void;
  onCodexRunsChanged: (callback: (runs: CodexRunMeta[]) => void) => () => void;
  onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => () => void;
  onFocusPulse: (callback: () => void) => () => void;
  onWindowFocusState: (callback: (notice: WindowFocusStateNotice) => void) => () => void;
  onWindowArrangement: (callback: (notice: WindowArrangementNotice) => void) => () => void;
  onRefresh: (callback: (event: WorkshopRefreshEvent) => void) => () => void;
  onRecordsChanged: (callback: (notice: PersonalRecordChangeNotice | null) => void) => () => void;
}
