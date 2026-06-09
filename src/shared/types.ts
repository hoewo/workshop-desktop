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

export interface ApiRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  authLevel?: "user" | "public" | "apikey";
  path: string;
  query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
  body?: unknown;
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
export type PersonalRecordStatus = "active" | "completed" | "promoted";

export interface PersonalRecordMeta {
  id: string;
  title: string;
  scopeType: PersonalRecordScope;
  status: PersonalRecordStatus;
  projectId?: number;
  projectName?: string;
  taskId?: number;
  taskTitle?: string;
  promotedTaskId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalRecord extends PersonalRecordMeta {
  bodyMarkdown: string;
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
  projectId?: number;
  projectName?: string;
  taskId?: number;
  taskTitle?: string;
  promotedTaskId?: number;
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
}

export interface DesktopBridge {
  getConfig: () => Promise<AppConfig>;
  saveConfig: (config: Partial<AppConfig>) => Promise<AppConfig>;
  sendVerification: (request: VerificationRequest) => Promise<ApiResponse<{ message?: string }>>;
  loginWithCode: (request: LoginRequest) => Promise<ApiResponse<LoginPayload>>;
  logoutAuth: () => Promise<AppConfig>;
  request: <T = unknown>(request: ApiRequest) => Promise<ApiResponse<T>>;
  openExternal: (url: string) => Promise<void>;
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
  onFocusPulse: (callback: () => void) => () => void;
  onWindowArrangement: (callback: (notice: WindowArrangementNotice) => void) => () => void;
  onRefresh: (callback: (event: WorkshopRefreshEvent) => void) => () => void;
  onRecordsChanged: (callback: () => void) => () => void;
}
