import { LoaderCircle } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppConfig,
  AppUpdateStatus,
  CodexRunMeta,
  CreateTaskRequest,
  CurrentUserPayload,
  LocalProject,
  Organization,
  OrganizationsPayload,
  PersonalRecord,
  PersonalRecordChangeNotice,
  PersonalRecordMeta,
  PersonalRecordScope,
  PersonalRecordStatus,
  PersonalRecordTarget,
  Project,
  ProjectTag,
  ProjectsPayload,
  Task,
  TaskState,
  TaskStateChangeNotice,
  TasksPayload,
  VerificationCodeType,
  WorkshopCodexSkillStatus,
  WindowFitRequest
} from "../shared/types";
import { formatCodexRunStatusMessage } from "../shared/codexErrors";
import { manualRevision } from "./content/manual";
import { HomeSurface } from "./components/surfaces/HomeSurface";
import { LoginSurface } from "./components/surfaces/LoginSurface";
import { ManualSurface } from "./components/surfaces/ManualSurface";
import { ProjectWorkspaceSurface, type ProjectTaskSourceState } from "./components/surfaces/ProjectWorkspaceSurface";
import { RecordSurface } from "./components/surfaces/RecordSurface";
import { SettingsSurface } from "./components/surfaces/SettingsSurface";
import { StickyLoginRequiredSurface, StickySurface } from "./components/surfaces/StickySurface";
import { TraySurface } from "./components/surfaces/TraySurface";
import { UpdateSurface } from "./components/surfaces/UpdateSurface";
import { TaskComposer } from "./components/TaskComposer";
import { useKeyedCompletionFeedback, useSingleCompletionFeedback } from "./hooks/useCompletionFeedback";
import { useFocusPulse } from "./hooks/useFocusPulse";
import {
  apiData,
  extractList,
  getErrorMessage,
  getInitialProjectFilter,
  getInitialRecordTarget,
  getInitialTaskComposerTarget,
  getInitialTaskFilter,
  getProjectLocalDirectory,
  getSurface,
  isLoggedIn,
  normalizeConfig
} from "./lib/appModel";
import {
  compareRecordListItems,
  deriveRecordTitle,
  findTaskRecord,
  getRecordListContext,
  recordCompleteAnimationMs,
  recordMatchesListContext,
  recordMatchesProjectWorkspaceSearch,
  recordMatchesSearch,
  type RecordListContext,
  type RecordMode,
  type RecordSaveStatus
} from "./lib/records";
import {
  compareTasks,
  getMeId,
  getProjectDisplayName,
  getStickyHeader,
  isVisibleTask,
  mergeProjects,
  resolveTaskTags,
  stateLabels,
  taskMatchesProjectWorkspaceSearch,
  taskListStates,
  taskCompleteAnimationMs,
  withOrganization,
  type EnrichedTask,
  type ProjectTodoGroup
} from "./lib/tasks";
import { readShellContentHeight, readTextareaHeightForFit } from "./lib/windowFit";

// 同步数据时按项目/组织扇出的远程请求并发上限，避免一次性打满后端触发限流（RATE_LIMIT_EXCEEDED）
const LOAD_DATA_CONCURRENCY = 1;

interface TaskComposerState {
  sessionId: string;
  projectId?: number;
  content: string;
  lockProject?: boolean;
  sourceRecordId?: string;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export default function App() {
  const surface = useMemo(getSurface, []);
  const initialTaskComposerTarget = useMemo(getInitialTaskComposerTarget, []);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<AppConfig | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectTags, setProjectTags] = useState<Map<number, ProjectTag[]>>(new Map());
  const [loadingProjectTagIds, setLoadingProjectTagIds] = useState<Set<number>>(new Set());
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [remoteDataLoaded, setRemoteDataLoaded] = useState(false);
  const [remoteSyncFailed, setRemoteSyncFailed] = useState(false);
  const [remoteSyncWarning, setRemoteSyncWarning] = useState("");
  const [taskSyncFailedProjectIds, setTaskSyncFailedProjectIds] = useState<Set<number>>(new Set());
  const [tagSyncFailedProjectIds, setTagSyncFailedProjectIds] = useState<Set<number>>(new Set());
  const projectsRef = useRef<Project[]>([]);
  const projectTagsRef = useRef<Map<number, ProjectTag[]>>(new Map());
  const projectTagRequestsRef = useRef<Map<number, Promise<ProjectTag[]>>>(new Map());
  const tasksRef = useRef<EnrichedTask[]>([]);
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
  const [error, setError] = useState("");
  const [taskMessage, setTaskMessage] = useState("");
  const [hoveredProjectId, setHoveredProjectId] = useState<number | null>(null);
  const [recordTarget] = useState(getInitialRecordTarget);
  const [records, setRecords] = useState<PersonalRecordMeta[]>([]);
  const [codexRuns, setCodexRuns] = useState<CodexRunMeta[]>([]);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [workshopSkillStatus, setWorkshopSkillStatus] = useState<WorkshopCodexSkillStatus | null>(null);
  const [isInstallingWorkshopSkill, setIsInstallingWorkshopSkill] = useState(false);
  const [isCreatingLocalProject, setIsCreatingLocalProject] = useState(false);
  const [renameLocalProjectTarget, setRenameLocalProjectTarget] = useState<LocalProject | null>(null);
  const [renameLocalProjectName, setRenameLocalProjectName] = useState("");
  const [isRenamingLocalProject, setIsRenamingLocalProject] = useState(false);
  const [linkLocalProjectTarget, setLinkLocalProjectTarget] = useState<LocalProject | null>(null);
  const [isLinkingLocalProject, setIsLinkingLocalProject] = useState(false);
  const [taskComposer, setTaskComposer] = useState<TaskComposerState | null>(() =>
    surface === "task-composer"
      ? {
          sessionId: crypto.randomUUID(),
          projectId: initialTaskComposerTarget.projectId,
          content: initialTaskComposerTarget.initialContent || "",
          lockProject: initialTaskComposerTarget.lockProject,
          sourceRecordId: initialTaskComposerTarget.sourceRecordId
        }
      : null
  );
  const [taskComposerError, setTaskComposerError] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  useEffect(() => {
    if (surface !== "tray" && surface !== "home" && surface !== "sticky" && surface !== "record") {
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
  }, [surface]);

  useEffect(() => {
    if (surface !== "tray" && surface !== "home" && surface !== "settings" && surface !== "update") {
      return undefined;
    }

    let cancelled = false;
    window.workshopDesktop
      .getUpdateStatus()
      .then((status) => {
        if (!cancelled) {
          setUpdateStatus(status);
        }
      })
      .catch(() => undefined);
    const unsubscribe = window.workshopDesktop.onUpdateStatus((status) => setUpdateStatus(status));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [surface]);

  useEffect(() => {
    if (surface !== "settings") {
      return;
    }

    let cancelled = false;
    window.workshopDesktop
      .getWorkshopCodexSkillStatus()
      .then((status) => {
        if (!cancelled) {
          setWorkshopSkillStatus(status);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setWorkshopSkillStatus(null);
          setError(nextError instanceof Error ? nextError.message : "读取 Workshop Codex skill 状态失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [surface]);

  useEffect(() => {
    if (surface !== "manual" || !config || config.lastSeenManualRevision === manualRevision) {
      return;
    }

    void saveConfig({ ...config, lastSeenManualRevision: manualRevision }).catch(() => undefined);
  }, [config, surface]);

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
  const [stickyListCollapsed, setStickyListCollapsed] = useState(false);
  const [recordListCollapsed, setRecordListCollapsed] = useState(false);
  const [workspaceTasksCollapsed, setWorkspaceTasksCollapsed] = useState(false);
  const [workspaceRecordsCollapsed, setWorkspaceRecordsCollapsed] = useState(false);
  const [arrangementCompact, setArrangementCompact] = useState(false);
  const [arrangementMaxHeight, setArrangementMaxHeight] = useState<number | null>(null);
  const [arrangementMessage, setArrangementMessage] = useState("");
  const [taskNoteBody, setTaskNoteBody] = useState("");
  const [taskNoteDirty, setTaskNoteDirty] = useState(false);
  const { focusPulseVisible, triggerFocusPulse } = useFocusPulse();
  const isNoteSurface = surface === "sticky" || surface === "record";
  const [isWindowSelected, setIsWindowSelected] = useState(isNoteSurface);
  const [isWindowFocused, setIsWindowFocused] = useState(() => (typeof document === "undefined" ? true : document.hasFocus()));
  const {
    completingIds: completingTaskIds,
    clearCompletionFeedback: clearTaskCompletionFeedback,
    markCompletionFeedback: markTaskCompletionFeedback
  } = useKeyedCompletionFeedback<number>(taskCompleteAnimationMs);
  const {
    completingId: recordCompletingId,
    clearCompletionFeedback: clearRecordCompletionFeedback,
    markCompletionFeedback: markRecordCompletionFeedback
  } = useSingleCompletionFeedback(recordCompleteAnimationMs);
  const recordSaveTimerRef = useRef<number | null>(null);
  const recordEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const recordSearchInputRef = useRef<HTMLInputElement | null>(null);
  const taskNoteSaveTimerRef = useRef<number | null>(null);
  const arrangementMessageTimerRef = useRef<number | null>(null);
  const workspaceSearchCollapseSnapshotRef = useRef<{ records: boolean; tasks: boolean } | null>(null);
  const lastWindowFitRef = useRef("");
  const activeRecordRef = useRef<PersonalRecord | null>(null);
  const recordBodyRef = useRef("");
  const recordDirtyRef = useRef(false);
  const taskNoteBodyRef = useRef("");
  const taskNoteDirtyRef = useRef(false);
  const recordSaveInFlightRef = useRef<Promise<PersonalRecord | null> | null>(null);
  const recordSaveQueuedRef = useRef(false);
  const isSingleTaskSticky = surface === "sticky" && taskFilter !== "all";
  const isProjectWorkspace =
    surface === "record" &&
    recordTarget.scopeType === "project" &&
    !recordTarget.draft &&
    !recordTarget.noteId &&
    !activeRecord;
  const arrangementProtected =
    isNoteSurface &&
    Boolean(
      taskComposer ||
        isCreatingTask ||
        recordScopePickerOpen ||
        recordDirty ||
        taskNoteDirty ||
        (surface === "record" && activeRecord && !activeRecord.id)
    );

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

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    return () => {
      if (arrangementMessageTimerRef.current !== null) {
        window.clearTimeout(arrangementMessageTimerRef.current);
      }
    };
  }, []);

  useEffect(() => window.workshopDesktop.onFocusPulse(triggerFocusPulse), [triggerFocusPulse]);

  useEffect(() => {
    if (!isNoteSurface) {
      return undefined;
    }

    void window.workshopDesktop.setWindowArrangementState({ protected: arrangementProtected });
    return () => {
      void window.workshopDesktop.setWindowArrangementState({ protected: false });
    };
  }, [arrangementProtected, isNoteSurface]);

  useEffect(() => {
    if (!isNoteSurface) {
      return undefined;
    }

    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    setIsWindowFocused(document.hasFocus());
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isNoteSurface]);

  useEffect(() => {
    if (!isNoteSurface) {
      return undefined;
    }

    return window.workshopDesktop.onWindowFocusState((notice) => {
      setIsWindowSelected(notice.selected);
    });
  }, [isNoteSurface]);

  useEffect(
    () =>
      window.workshopDesktop.onWindowArrangement((notice) => {
        if (notice.released) {
          setArrangementMaxHeight(null);
          setArrangementCompact(false);
          lastWindowFitRef.current = "";
          return;
        }

        if (typeof notice.maxHeight === "number" && Number.isFinite(notice.maxHeight) && notice.maxHeight > 0) {
          setArrangementMaxHeight(notice.maxHeight);
          lastWindowFitRef.current = "";
        }
        if (typeof notice.compactMode === "boolean") {
          setArrangementCompact(notice.compactMode);
        }
      }),
    []
  );

  const rememberProjectTags = useCallback((projectId: number, tags: ProjectTag[]) => {
    setProjectTags((current) => {
      const next = new Map(current);
      next.set(projectId, tags);
      projectTagsRef.current = next;
      return next;
    });
    return tags;
  }, []);

  const loadProjectTags = useCallback(
    (projectId: number, force = false) => {
      if (!force && projectTagsRef.current.has(projectId)) {
        return Promise.resolve(projectTagsRef.current.get(projectId) ?? []);
      }
      const inFlight = projectTagRequestsRef.current.get(projectId);
      if (inFlight) {
        return inFlight;
      }

      setLoadingProjectTagIds((current) => new Set(current).add(projectId));
      const request = apiData<ProjectTag[]>(window.workshopDesktop.listProjectTags({ projectId, pageSize: 200 }))
        .then((payload) => rememberProjectTags(projectId, extractList<ProjectTag>(payload, "tags").filter((tag) => !tag.deleted_at)))
        .finally(() => {
          projectTagRequestsRef.current.delete(projectId);
          setLoadingProjectTagIds((current) => {
            const next = new Set(current);
            next.delete(projectId);
            return next;
          });
        });
      projectTagRequestsRef.current.set(projectId, request);
      return request;
    },
    [rememberProjectTags]
  );

  const loadData = useCallback(async () => {
    if (!config || !isLoggedIn(config)) {
      setProjects([]);
      projectsRef.current = [];
      setProjectTags(new Map());
      projectTagsRef.current = new Map();
      setTasks([]);
      tasksRef.current = [];
      setRemoteDataLoaded(false);
      setRemoteSyncFailed(false);
      setRemoteSyncWarning("");
      setTaskSyncFailedProjectIds(new Set());
      setTagSyncFailedProjectIds(new Set());
      return;
    }

    setIsLoading(true);
    setRemoteSyncFailed(false);
    setRemoteSyncWarning("");
    setError("");
    setTaskMessage("");

    try {
      const currentUser = await apiData<CurrentUserPayload>(window.workshopDesktop.getCurrentUser()).catch(() => null);
      const standaloneProjectPayload = await apiData<ProjectsPayload | Project[]>(
        window.workshopDesktop.listProjects({ pageSize: 200 })
      );
      const standaloneProjects = extractList<Project>(standaloneProjectPayload, "projects");
      const organizationsPayload = await apiData<OrganizationsPayload | Organization[]>(window.workshopDesktop.listOrganizations());
      const organizations = extractList<Organization>(organizationsPayload, "organizations");
      const organizationProjectResults = await mapWithConcurrency(organizations, LOAD_DATA_CONCURRENCY, async (organization) => {
        try {
          const payload = await apiData<ProjectsPayload | Project[]>(
            window.workshopDesktop.listProjects({
              organizationId: organization.id,
              pageSize: 200
            })
          );
          return {
            failed: false,
            organizationId: organization.id,
            projects: extractList<Project>(payload, "projects").map((project) => withOrganization(project, organization))
          };
        } catch {
          return { failed: true, organizationId: organization.id, projects: [] as Project[] };
        }
      });
      const failedOrganizationIds = new Set(
        organizationProjectResults.filter((result) => result.failed).map((result) => result.organizationId)
      );
      const cachedFailedOrganizationProjects = projectsRef.current.filter(
        (project) => typeof project.organization_id === "number" && failedOrganizationIds.has(project.organization_id)
      );
      const nextProjects = mergeProjects([
        standaloneProjects,
        ...organizationProjectResults.map((result) => result.projects),
        cachedFailedOrganizationProjects
      ]);
      projectsRef.current = nextProjects;
      setProjects(nextProjects);

      const projectTaskData = await mapWithConcurrency(nextProjects, LOAD_DATA_CONCURRENCY, async (project) => {
        const cachedTags = projectTagsRef.current.get(project.id) ?? [];
        try {
          const payload = await apiData<TasksPayload | Task[]>(
            window.workshopDesktop.listTasks({
              projectId: project.id,
              states: taskListStates,
              pageSize: 200
            })
          );
          const rawTasks = extractList<Task>(payload, "tasks");
          let tags = cachedTags;
          let tagSyncFailed = false;
          if (rawTasks.some((task) => Boolean(task.tags?.trim()))) {
            try {
              tags = await loadProjectTags(project.id, true);
            } catch {
              tagSyncFailed = true;
            }
          }

          const meId = getMeId(project, currentUser?.username || config.username);
          const projectLabel = getProjectDisplayName(project);
          return {
            projectId: project.id,
            taskSyncFailed: false,
            tagSyncFailed,
            tasks: rawTasks.map<EnrichedTask>((task) => ({
              ...task,
              projectName: projectLabel,
              meId,
              isMine: task.creator_id === meId || task.executor_id === meId,
              resolvedTags: resolveTaskTags(task.tags, tags)
            }))
          };
        } catch {
          return {
            projectId: project.id,
            taskSyncFailed: true,
            tagSyncFailed: false,
            tasks: tasksRef.current.filter((task) => task.project_id === project.id)
          };
        }
      });

      const nextTasks = projectTaskData.flatMap((item) => item.tasks).sort(compareTasks);
      tasksRef.current = nextTasks;
      setTasks(nextTasks);
      setTaskSyncFailedProjectIds(
        new Set(projectTaskData.filter((item) => item.taskSyncFailed).map((item) => item.projectId))
      );
      setTagSyncFailedProjectIds(
        new Set(projectTaskData.filter((item) => item.tagSyncFailed).map((item) => item.projectId))
      );

      const failedOrganizationCount = organizationProjectResults.filter((result) => result.failed).length;
      const failedTaskProjectCount = projectTaskData.filter((item) => item.taskSyncFailed).length;
      const failedTagProjectCount = projectTaskData.filter((item) => item.tagSyncFailed).length;
      const warnings = [
        failedOrganizationCount > 0 ? `${failedOrganizationCount} 个组织项目未同步` : "",
        failedTaskProjectCount > 0 ? `${failedTaskProjectCount} 个项目的任务未同步` : "",
        failedTagProjectCount > 0 ? `${failedTagProjectCount} 个项目的标签未同步` : ""
      ].filter(Boolean);
      if (warnings.length > 0) {
        setRemoteSyncWarning(`${warnings.join("；")}。已保留成功加载的任务，请稍后刷新。`);
      }
    } catch (nextError) {
      setRemoteSyncFailed(true);
      setRemoteSyncWarning(nextError instanceof Error ? nextError.message : "同步失败");
    } finally {
      setRemoteDataLoaded(true);
      setIsLoading(false);
    }
  }, [config, loadProjectTags]);

  const applyTaskStateChange = useCallback(
    (notice: TaskStateChangeNotice) => {
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
        markTaskCompletionFeedback(notice.id);
        return;
      }

      clearTaskCompletionFeedback(notice.id);
    },
    [clearTaskCompletionFeedback, markTaskCompletionFeedback]
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
        ? { localProjectId: target?.localProjectId, projectId: target?.projectId, projectName: target?.projectName }
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

  const refreshActiveRecordFromNotice = useCallback(async (notice: PersonalRecordChangeNotice | null) => {
    const activeRecordId = activeRecordRef.current?.id;
    if (!notice?.id || !activeRecordId || notice.id !== activeRecordId) {
      return;
    }

    if (notice.deleted) {
      activeRecordRef.current = null;
      recordBodyRef.current = "";
      recordDirtyRef.current = false;
      setActiveRecord(null);
      setRecordBody("");
      setRecordDirty(false);
      setRecordSaveStatus("idle");
      setRecordMessage("记录已删除");
      return;
    }

    if (recordDirtyRef.current || recordSaveInFlightRef.current) {
      setRecordMessage("记录已在其他窗口更新，当前有未保存编辑，暂未自动刷新");
      return;
    }

    const record = await window.workshopDesktop.getPersonalRecord(notice.id);
    if (!record || activeRecordRef.current?.id !== notice.id || recordDirtyRef.current || recordSaveInFlightRef.current) {
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
            localProjectId: recordToSave.localProjectId,
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

  useEffect(
    () =>
      window.workshopDesktop.onConfigChanged((nextConfig) => {
        setConfig(nextConfig);
        setDraftConfig(nextConfig);
      }),
    []
  );

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

    });
  }, [loadRecords, openRecordById, recordTarget, startRecordDraft, surface]);

  useEffect(
    () =>
      window.workshopDesktop.onRecordsChanged((notice: PersonalRecordChangeNotice | null) => {
        void refreshActiveRecordFromNotice(notice);

        if (notice?.status === "completed") {
          markRecordCompletionFeedback(notice.id, () => void loadRecords());
          return;
        }

        clearRecordCompletionFeedback();
        void loadRecords();
      }),
    [clearRecordCompletionFeedback, loadRecords, markRecordCompletionFeedback, refreshActiveRecordFromNotice]
  );

  useEffect(() => {
    if (surface !== "sticky" && surface !== "record") {
      return undefined;
    }
    return window.workshopDesktop.onWindowCloseRequest(() => {
      if (surface === "sticky") {
        void closeStickyWindow();
        return;
      }
      void closeRecordWindow();
    });
  }, [closeRecordWindow, surface]);

  useEffect(() => {
    if (config && isLoggedIn(config)) {
      void loadData();
    }
  }, [config, loadData]);

  useEffect(
    () =>
      window.workshopDesktop.onRefresh((event) => {
        // 新建任务会改变列表成员和汇总数量，需要重新拉取完整数据
        if (event?.reason === "task-created") {
          void loadData();
          return;
        }

        // 任务状态变更只做本地乐观更新（多窗口同步），不触发全量网络刷新
        if (event?.reason === "task-state" && event.task) {
          applyTaskStateChange(event.task);
          return;
        }

        // 仅手动刷新（托盘菜单/刷新按钮）才重新拉取远程数据
        if (event?.reason === "manual") {
          void loadData();
        }
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
    const isProjectWorkspaceCollapsed = isProjectWorkspace && workspaceTasksCollapsed && workspaceRecordsCollapsed;
    const isArrangementCompactList = arrangementCompact && !isDetailWindow;
    const isCollapsedList =
      (surface === "sticky" && stickyListCollapsed && !isSingleTaskSticky) ||
      (surface === "record" && !isProjectWorkspace && recordListCollapsed && !activeRecord) ||
      isProjectWorkspaceCollapsed ||
      isArrangementCompactList;
    const collapsedListHeight = isProjectWorkspace ? 140 : 56;
    const fixedMinHeight = isCollapsedList ? collapsedListHeight : 112;
    const detailMinHeight = surface === "sticky" && isSingleTaskSticky ? 132 : 188;
    const baseMaxHeight = isCollapsedList
      ? collapsedListHeight
      : surface === "sticky"
        ? isSingleTaskSticky
          ? 640
          : 720
        : isRecordDetail
          ? 680
          : 720;
    let animationFrame: number | null = null;

    function requestWindowFit() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        const contentHeight = readShellContentHeight();
        const minHeight = isDetailWindow ? Math.min(detailMinHeight, baseMaxHeight) : fixedMinHeight;
        const maxHeight = arrangementMaxHeight
          ? Math.min(baseMaxHeight, Math.max(minHeight, arrangementMaxHeight))
          : baseMaxHeight;
        const request: WindowFitRequest = {
          height: contentHeight,
          minWidth: surface === "record" ? 320 : 300,
          minHeight,
          maxHeight,
          preserveUserHeight: isRecordDetail
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
    arrangementCompact,
    arrangementMaxHeight,
    error,
    isLoading,
    isProjectWorkspace,
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
    tasks,
    workspaceRecordsCollapsed,
    workspaceTasksCollapsed
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
  const remoteProjectLinkOptions = useMemo(() => {
    if (!config || !linkLocalProjectTarget) {
      return [];
    }

    const taskCounts = new Map<number, number>();
    for (const task of tasks) {
      if (task.isMine && isVisibleTask(task)) {
        taskCounts.set(task.project_id, (taskCounts.get(task.project_id) ?? 0) + 1);
      }
    }

    return projects
      .map((project) => {
        const linkedLocalProject = config.localProjects.find((item) => item.linkedWorkshopProjectId === project.id);
        const projectName = getProjectDisplayName(project);
        const isCurrent = linkLocalProjectTarget.linkedWorkshopProjectId === project.id;
        const isNameMatch = projectName.trim().toLowerCase() === linkLocalProjectTarget.name.trim().toLowerCase();
        return {
          project,
          projectName,
          taskCount: taskCounts.get(project.id) ?? 0,
          linkedLocalProject,
          isCurrent,
          isLinkedToOther: Boolean(linkedLocalProject && linkedLocalProject.id !== linkLocalProjectTarget.id),
          isNameMatch
        };
      })
      .sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) {
          return a.isCurrent ? -1 : 1;
        }
        if (a.isNameMatch !== b.isNameMatch) {
          return a.isNameMatch ? -1 : 1;
        }
        if (a.isLinkedToOther !== b.isLinkedToOther) {
          return a.isLinkedToOther ? 1 : -1;
        }
        if (a.taskCount !== b.taskCount) {
          return b.taskCount - a.taskCount;
        }
        return a.projectName.localeCompare(b.projectName, "zh-CN");
      });
  }, [config, linkLocalProjectTarget, projects, tasks]);
  const recentTasks = useMemo(
    () => tasks.filter((task) => task.isMine && (isVisibleTask(task) || completingTaskIds.has(task.id))).sort(compareTasks),
    [completingTaskIds, tasks]
  );

  const selectedProjectName = useMemo(() => {
    if (projectFilter === "all") {
      return "";
    }
    const selectedProject = projects.find((project) => project.id === Number(projectFilter));
    return selectedProject ? getProjectDisplayName(selectedProject) : "";
  }, [projectFilter, projects]);
  const recordProjectCandidates = useMemo(() => {
    const query = recordProjectQuery.trim().toLowerCase();
    return (config?.localProjects ?? [])
      .filter((project) => !query || project.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [config?.localProjects, recordProjectQuery]);
  const contextualRecords = useMemo(
    () => records.filter((record) => recordMatchesListContext(record, recordListContext)),
    [records, recordListContext]
  );
  const recordSearchTokens = useMemo(
    () => recordSearchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [recordSearchQuery]
  );
  const visibleRecords = useMemo(
    () => contextualRecords.filter((record) => recordMatchesSearch(record, recordSearchTokens)).sort(compareRecordListItems),
    [contextualRecords, recordSearchTokens]
  );
  const workspaceProjectId = recordListContext.scopeType === "project" ? recordListContext.projectId : undefined;
  const workspaceProject = useMemo(
    () => projects.find((project) => project.id === workspaceProjectId),
    [projects, workspaceProjectId]
  );
  const workspaceTasks = useMemo(
    () =>
      workspaceProjectId === undefined
        ? []
        : tasks
            .filter(
              (task) =>
                task.project_id === workspaceProjectId &&
                task.isMine &&
                (isVisibleTask(task) || completingTaskIds.has(task.id))
            )
            .sort(compareTasks),
    [completingTaskIds, tasks, workspaceProjectId]
  );
  const visibleWorkspaceTasks = useMemo(
    () => workspaceTasks.filter((task) => taskMatchesProjectWorkspaceSearch(task, recordSearchTokens)),
    [recordSearchTokens, workspaceTasks]
  );
  const visibleWorkspaceRecords = useMemo(
    () =>
      contextualRecords
        .filter((record) => recordMatchesProjectWorkspaceSearch(record, recordSearchTokens))
        .sort(compareRecordListItems),
    [contextualRecords, recordSearchTokens]
  );
  const projectTaskSourceState: ProjectTaskSourceState = !config || !isLoggedIn(config)
    ? "logged-out"
    : workspaceProjectId === undefined
      ? "unlinked"
      : isLoading || !remoteDataLoaded
        ? "loading"
        : remoteSyncFailed || taskSyncFailedProjectIds.has(workspaceProjectId) || !workspaceProject
          ? "stale"
          : workspaceTasks.length === 0
            ? "empty"
            : "online";
  const workspaceSyncWarning =
    workspaceProjectId !== undefined && tagSyncFailedProjectIds.has(workspaceProjectId)
      ? "标签同步失败，已保留任务；部分标签可能暂不完整。"
      : "";
  const workspaceTaskCreateDisabledReason =
    projectTaskSourceState === "logged-out"
      ? "请先在设置中登录 Workshop 账号"
      : projectTaskSourceState === "unlinked"
        ? "请先将当前项目关联远端任务源"
        : projectTaskSourceState === "loading"
          ? "任务源加载中"
          : projectTaskSourceState === "stale"
            ? "同步异常，刷新成功后可新增待办"
            : !workspaceProject
              ? "当前远端项目不可用"
              : undefined;
  const hasRecordSearchQuery = recordSearchTokens.length > 0;
  useEffect(() => {
    if (surface === "record" && !isProjectWorkspace && recordsLoaded && !activeRecord && contextualRecords.length === 0) {
      setRecordListCollapsed(true);
    }
  }, [activeRecord, contextualRecords.length, isProjectWorkspace, recordListContext, recordsLoaded, surface]);

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
  const localProjectRecordCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!config) {
      return counts;
    }

    for (const project of config.localProjects) {
      const count = records.filter((record) => {
        if (record.scopeType !== "project") {
          return false;
        }
        if (record.localProjectId) {
          return record.localProjectId === project.id;
        }
        if (project.linkedWorkshopProjectId && record.projectId === project.linkedWorkshopProjectId) {
          return true;
        }
        return Boolean(record.projectName && record.projectName === project.name);
      }).length;
      if (count > 0) {
        counts.set(project.id, count);
      }
    }

    return counts;
  }, [config, records]);
  const selectedTask = isSingleTaskSticky ? filteredTasks[0] : null;
  const selectedTaskRecord = selectedTask ? taskRecordsByTaskId.get(selectedTask.id) : undefined;
  const selectedTaskCodexRun = selectedTask
    ? codexRuns.find(
        (run) => run.kind === "task" && run.projectId === selectedTask.project_id && run.taskId === selectedTask.id
      )
    : undefined;
  const selectedTaskCodexMessage = formatCodexRunStatusMessage(selectedTaskCodexRun);
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
      status: selectedTaskRecord?.status ?? "active",
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

  function handleTaskArchive() {
    setError("");
    setTaskMessage("任务归档暂未实现，当前不会隐藏任务");
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
    void window.workshopDesktop.openPersonalRecord({
      scopeType: "project",
      projectId: group.project.id,
      projectName: group.projectName
    });
  }

  function openLocalProjectWorkspace(project: LocalProject) {
    void window.workshopDesktop.openPersonalRecord({
      scopeType: "project",
      localProjectId: project.id,
      projectId: project.linkedWorkshopProjectId,
      projectName: project.name
    });
  }

  function getRecordDraftTargetFromContext(): PersonalRecordTarget | undefined {
    if (activeRecord?.scopeType === "project" || activeRecord?.scopeType === "task") {
      return {
        scopeType: activeRecord.scopeType,
        localProjectId: activeRecord.localProjectId,
        projectId: activeRecord.projectId,
        projectName: activeRecord.projectName,
        taskId: activeRecord.taskId,
        taskTitle: activeRecord.taskTitle
      };
    }

    if (recordListContext.scopeType === "project") {
      return {
        scopeType: "project",
        localProjectId: recordListContext.localProjectId,
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

  async function assignRecordToProject(project: LocalProject) {
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
      localProjectId: project.id,
      projectId: project.linkedWorkshopProjectId,
      projectName: project.name,
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

  async function saveRecordWithStatus(record: PersonalRecord, status: PersonalRecordStatus) {
    return window.workshopDesktop.savePersonalRecord({
      id: record.id || undefined,
      bodyMarkdown: record.bodyMarkdown,
      scopeType: record.scopeType,
      status,
      localProjectId: record.localProjectId,
      projectId: record.projectId,
      projectName: record.projectName,
      taskId: record.taskId,
      taskTitle: record.taskTitle,
      promotedTaskId: record.promotedTaskId
    });
  }

  async function completeRecord(record: PersonalRecordMeta) {
    setRecordMessage("");

    try {
      const fullRecord = await window.workshopDesktop.getPersonalRecord(record.id);
      if (!fullRecord) {
        clearRecordCompletionFeedback();
        await loadRecords();
        return;
      }

      const nextStatus: PersonalRecordStatus = record.status === "completed" ? "active" : "completed";
      if (nextStatus === "completed") {
        markRecordCompletionFeedback(record.id, () => void loadRecords());
      } else {
        clearRecordCompletionFeedback();
      }

      await saveRecordWithStatus(fullRecord, nextStatus);
      if (nextStatus === "active") {
        await loadRecords();
      }
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
      const nextStatus: PersonalRecordStatus = recordToComplete.status === "completed" ? "active" : "completed";
      if (!recordToComplete.id && !bodyToComplete.trim()) {
        clearRecordCompletionFeedback();
        await window.workshopDesktop.closeWindow();
        return;
      }

      if (nextStatus === "completed") {
        markRecordCompletionFeedback(recordToComplete.id || "active-record");
      } else {
        clearRecordCompletionFeedback();
      }

      const saved = await saveRecordWithStatus({
        ...recordToComplete,
        bodyMarkdown: bodyToComplete,
        status: nextStatus
      }, nextStatus);
      activeRecordRef.current = saved;
      recordBodyRef.current = saved.bodyMarkdown;
      recordDirtyRef.current = false;
      setActiveRecord(saved);
      setRecordBody(saved.bodyMarkdown);
      setRecordDirty(false);
      setRecordSaveStatus("saved");
      setRecordMessage("");
      if (nextStatus === "completed") {
        markRecordCompletionFeedback(saved.id, () => void loadRecords());
      } else {
        await loadRecords();
      }
    } catch (nextError) {
      clearRecordCompletionFeedback();
      setRecordMessage(nextError instanceof Error ? nextError.message : "完成失败");
    }
  }

  async function archiveRecord(record: PersonalRecordMeta) {
    setRecordMessage("");

    try {
      const fullRecord = await window.workshopDesktop.getPersonalRecord(record.id);
      if (!fullRecord) {
        await loadRecords();
        return;
      }

      await saveRecordWithStatus(fullRecord, "archived");
      await loadRecords();
    } catch (nextError) {
      setRecordMessage(nextError instanceof Error ? nextError.message : "归档失败");
    }
  }

  async function archiveActiveRecord() {
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

      if (recordSaveInFlightRef.current) {
        const saved = await recordSaveInFlightRef.current;
        if (!saved && recordDirtyRef.current) {
          return;
        }
      }

      const recordToArchive = activeRecordRef.current ?? initialRecord;
      const bodyToArchive = recordBodyRef.current;
      if (!recordToArchive.id && !bodyToArchive.trim()) {
        await window.workshopDesktop.closeWindow();
        return;
      }

      await saveRecordWithStatus({
        ...recordToArchive,
        bodyMarkdown: bodyToArchive,
        status: "archived"
      }, "archived");
      await loadRecords();
      await window.workshopDesktop.closeWindow();
    } catch (nextError) {
      setRecordMessage(nextError instanceof Error ? nextError.message : "归档失败");
    }
  }

  function handleComposerProjectChange(projectId: number) {
    setTaskComposerError("");
    void loadProjectTags(projectId).catch(() => {
      setTaskComposerError("标签暂未加载，可不选标签直接创建；稍后重开可重试。");
    });
  }

  function openDirectTaskComposer(projectId?: number, lockProject = false) {
    const nextProjectId = projectId ?? projects[0]?.id;
    setTaskMessage("");
    void window.workshopDesktop.openTaskComposer({ projectId: nextProjectId, lockProject });
  }

  async function createTaskFromRecord() {
    const saved = recordDirtyRef.current ? await saveRecordNow() : activeRecordRef.current;
    if (!saved?.projectId) {
      setRecordMessage("需要先关联项目");
      return;
    }

    setRecordMessage("");
    await window.workshopDesktop.openTaskComposer({
      projectId: saved.projectId,
      initialContent: deriveRecordTitle(recordBodyRef.current, saved.title),
      lockProject: true,
      sourceRecordId: saved.id
    });
  }

  async function submitTaskCreation(request: CreateTaskRequest) {
    const sourceRecordId = taskComposer?.sourceRecordId;
    setTaskComposerError("");
    setIsCreatingTask(true);

    let createdTask: Task;
    try {
      createdTask = await apiData<Task>(window.workshopDesktop.createTask(request));
    } catch (nextError) {
      setTaskComposerError(nextError instanceof Error ? nextError.message : "创建待办失败");
      setIsCreatingTask(false);
      return;
    }

    setIsCreatingTask(false);
    if (surface !== "task-composer") {
      await loadData();
    }

    if (!sourceRecordId) {
      setTaskComposer(null);
      await window.workshopDesktop.closeWindow();
      return;
    }

    try {
      const sourceRecord = await window.workshopDesktop.getPersonalRecord(sourceRecordId);
      if (!sourceRecord) {
        throw new Error("来源记录不存在");
      }
      await window.workshopDesktop.savePersonalRecord({
        id: sourceRecord.id,
        bodyMarkdown: sourceRecord.bodyMarkdown,
        scopeType: sourceRecord.scopeType,
        status: "promoted",
        localProjectId: sourceRecord.localProjectId,
        projectId: sourceRecord.projectId,
        projectName: sourceRecord.projectName,
        taskId: sourceRecord.taskId,
        taskTitle: sourceRecord.taskTitle,
        promotedTaskId: createdTask.id
      });
      setRecordMessage("");
      await window.workshopDesktop.openSticky({
        projectId: createdTask.project_id,
        taskId: createdTask.id
      });
      await window.workshopDesktop.closePersonalRecord(sourceRecord.id);
      setTaskComposer(null);
      await window.workshopDesktop.closeWindow();
    } catch (nextError) {
      window.alert(
        `待办已创建（#${createdTask.id}），但记录状态更新失败：${nextError instanceof Error ? nextError.message : "未知错误"}`
      );
      setTaskComposer(null);
      await window.workshopDesktop.closeWindow();
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

  async function handleLocalProjectDirectoryClick(localProjectId: string) {
    const project = config?.localProjects.find((item) => item.id === localProjectId);
    if (!project) {
      setError("本地项目不存在");
      return;
    }

    try {
      if (project.localDirectory) {
        await window.workshopDesktop.openLocalProjectDirectory(localProjectId);
        return;
      }

      const saved = await window.workshopDesktop.bindLocalProjectDirectory(localProjectId);
      if (saved) {
        setConfig(saved);
        setDraftConfig(saved);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "本地目录操作失败");
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
      await saveConfig({ ...draftConfig, authMode: "nebula" });
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
      const updatedTask = await apiData<Task>(window.workshopDesktop.updateTask({ taskId: task.id, state }));
      const now = new Date().toISOString();
      const notice: TaskStateChangeNotice = {
        id: task.id,
        projectId: task.project_id,
        state: updatedTask?.state ?? state,
        updatedAt: updatedTask?.updated_at ?? now,
        completionAt: (updatedTask?.state ?? state) === "completed" ? updatedTask?.completion_at ?? task.completion_at ?? now : task.completion_at ?? null
      };

      applyTaskStateChange(notice);
      await window.workshopDesktop.notifyTaskChanged(notice);
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

    setError("");
    try {
      await saveConfig(draftConfig);
      if (surface === "settings") {
        await window.workshopDesktop.closeWindow();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存失败");
    }
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
    setRemoteDataLoaded(false);
    setRemoteSyncFailed(false);
    setTaskSyncFailedProjectIds(new Set());
  }

  async function handleCheckForUpdates() {
    try {
      const status = await window.workshopDesktop.checkForUpdates();
      setUpdateStatus(status);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "检查更新失败");
    }
  }

  async function handleInstallUpdate() {
    try {
      await window.workshopDesktop.installUpdate();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "安装更新失败");
    }
  }

  async function handleInstallWorkshopSkill() {
    try {
      setIsInstallingWorkshopSkill(true);
      const status = await window.workshopDesktop.installWorkshopCodexSkill();
      setWorkshopSkillStatus(status);
      if (status.error || !status.upToDate) {
        setError(status.error || "Workshop Codex skill 安装未完成");
      } else {
        setError("");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "安装 Workshop Codex skill 失败");
    } finally {
      setIsInstallingWorkshopSkill(false);
    }
  }

  async function handleStickyAlwaysOnTop(enabled: boolean) {
    const saved = await window.workshopDesktop.setStickyAlwaysOnTop(enabled);
    setConfig(saved);
    setDraftConfig(saved);
  }

  function deriveProjectNameFromDirectory(directory: string) {
    const normalized = directory.trim().replace(/[\\/]+$/, "");
    const parts = normalized.split(/[\\/]/).filter(Boolean);
    return parts.at(-1) || "";
  }

  async function handleCreateLocalProject() {
    try {
      setIsCreatingLocalProject(true);
      const directory = await window.workshopDesktop.chooseLocalProjectDirectory();
      if (!directory) {
        return;
      }

      const name = deriveProjectNameFromDirectory(directory);
      if (!name) {
        throw new Error("本地项目需要名称");
      }

      await window.workshopDesktop.createLocalProject({ name, localDirectory: directory });
      const saved = await window.workshopDesktop.getConfig();
      setConfig(saved);
      setDraftConfig(saved);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "创建本地项目失败");
    } finally {
      setIsCreatingLocalProject(false);
    }
  }

  function openRenameLocalProject(project: LocalProject) {
    setError("");
    setRenameLocalProjectTarget(project);
    setRenameLocalProjectName(project.name);
  }

  function closeRenameLocalProject() {
    if (isRenamingLocalProject) {
      return;
    }

    setRenameLocalProjectTarget(null);
    setRenameLocalProjectName("");
  }

  async function openLinkLocalProjectRemote(project: LocalProject) {
    setError("");
    setLinkLocalProjectTarget(project);

    if (!config || !isLoggedIn(config)) {
      setLinkLocalProjectTarget(null);
      setError("");
      await window.workshopDesktop.openSettings();
      return;
    }

    if (projects.length === 0 && !isLoading) {
      await loadData();
    }
  }

  function closeLinkLocalProjectRemote() {
    if (isLinkingLocalProject) {
      return;
    }
    setLinkLocalProjectTarget(null);
  }

  async function handleLinkLocalProjectRemote(project: Project) {
    const target = linkLocalProjectTarget;
    if (!target) {
      return;
    }

    try {
      setIsLinkingLocalProject(true);
      const saved = await window.workshopDesktop.linkLocalProjectWorkshopProject({
        localProjectId: target.id,
        workshopProjectId: project.id,
        workshopProjectName: getProjectDisplayName(project)
      });
      setConfig(saved);
      setDraftConfig(saved);
      setLinkLocalProjectTarget(null);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "关联远端任务源失败");
    } finally {
      setIsLinkingLocalProject(false);
    }
  }

  async function handleUnlinkLocalProjectRemote(project: LocalProject) {
    try {
      setIsLinkingLocalProject(true);
      const saved = await window.workshopDesktop.unlinkLocalProjectWorkshopProject(project.id);
      setConfig(saved);
      setDraftConfig(saved);
      if (linkLocalProjectTarget?.id === project.id) {
        setLinkLocalProjectTarget(null);
      }
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "解除远端关联失败");
    } finally {
      setIsLinkingLocalProject(false);
    }
  }

  async function handleRenameLocalProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = renameLocalProjectTarget;
    const name = renameLocalProjectName.trim();
    if (!target || !name) {
      return;
    }

    try {
      setIsRenamingLocalProject(true);
      await window.workshopDesktop.renameLocalProject({ id: target.id, name });
      const saved = await window.workshopDesktop.getConfig();
      setConfig(saved);
      setDraftConfig(saved);
      setRenameLocalProjectTarget(null);
      setRenameLocalProjectName("");
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "重命名本地项目失败");
    } finally {
      setIsRenamingLocalProject(false);
    }
  }

  function releaseCurrentWindowArrangement() {
    setArrangementCompact(false);
    setArrangementMaxHeight(null);
    lastWindowFitRef.current = "";
    void window.workshopDesktop.releaseWindowArrangement();
  }

  function showArrangementMessage(message: string) {
    setArrangementMessage(message);
    if (arrangementMessageTimerRef.current !== null) {
      window.clearTimeout(arrangementMessageTimerRef.current);
    }
    arrangementMessageTimerRef.current = window.setTimeout(() => {
      arrangementMessageTimerRef.current = null;
      setArrangementMessage("");
    }, 2200);
  }

  async function handleArrangeStickyWindows() {
    if (arrangementProtected) {
      showArrangementMessage("完成当前编辑后再整理");
      return;
    }

    try {
      const result = await window.workshopDesktop.arrangeStickyWindows();
      if (result.blocked) {
        showArrangementMessage(`有 ${result.protectedCount ?? 1} 个窗口正在编辑，暂未整理`);
        return;
      }
      const scopeLabel = result.scope === "project" ? "当前项目" : result.scope === "personal-records" ? "个人记录" : "任务";
      showArrangementMessage(result.count > 0 ? `已整理${scopeLabel}的 ${result.count} 个窗口` : "当前没有可整理的窗口");
    } catch (nextError) {
      showArrangementMessage(nextError instanceof Error ? nextError.message : "整理窗口失败");
    }
  }

  function openProjectWorkspaceSearch() {
    if (!recordSearchOpen) {
      workspaceSearchCollapseSnapshotRef.current = {
        records: workspaceRecordsCollapsed,
        tasks: workspaceTasksCollapsed
      };
    }
    if (arrangementCompact) {
      releaseCurrentWindowArrangement();
    }
    setWorkspaceTasksCollapsed(false);
    setWorkspaceRecordsCollapsed(false);
    setRecordSearchOpen(true);
  }

  function closeProjectWorkspaceSearch() {
    setRecordSearchOpen(false);
    const snapshot = workspaceSearchCollapseSnapshotRef.current;
    workspaceSearchCollapseSnapshotRef.current = null;
    if (snapshot) {
      setWorkspaceTasksCollapsed(snapshot.tasks);
      setWorkspaceRecordsCollapsed(snapshot.records);
    }
  }

  const loginReady = Boolean(draftConfig && loginTarget.trim() && loginCode.trim());
  const renameLocalProjectNameTrimmed = renameLocalProjectName.trim();
  const activeLinkLocalProjectTarget =
    linkLocalProjectTarget && config
      ? config.localProjects.find((project) => project.id === linkLocalProjectTarget.id) ?? linkLocalProjectTarget
      : linkLocalProjectTarget;
  const renameLocalProjectDialog = renameLocalProjectTarget ? (
    <div className="project-rename-backdrop">
      <section className="project-rename-sheet" role="dialog" aria-modal="true" aria-labelledby="project-rename-title">
        <form className="project-rename-form" onSubmit={(event) => void handleRenameLocalProject(event)}>
          <header>
            <div>
              <span className="eyebrow">Local Project</span>
              <h2 id="project-rename-title">重命名项目</h2>
            </div>
          </header>
          <label>
            <span>项目名称</span>
            <input
              autoFocus
              value={renameLocalProjectName}
              onChange={(event) => setRenameLocalProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeRenameLocalProject();
                }
              }}
            />
          </label>
          <div className="project-rename-actions">
            <button type="button" className="secondary-button" onClick={closeRenameLocalProject} disabled={isRenamingLocalProject}>
              取消
            </button>
            <button
              type="submit"
              disabled={
                isRenamingLocalProject ||
                !renameLocalProjectNameTrimmed ||
                renameLocalProjectNameTrimmed === renameLocalProjectTarget.name
              }
            >
              {isRenamingLocalProject ? "保存中" : "保存"}
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;
  const linkLocalProjectDialog =
    activeLinkLocalProjectTarget && config && isLoggedIn(config) ? (
      <div className="project-link-backdrop">
        <section
          className="project-link-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-link-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeLinkLocalProjectRemote();
            }
          }}
        >
          <header>
            <div>
              <span className="eyebrow">Remote Task Source</span>
              <h2 id="project-link-title">关联远端任务源</h2>
            </div>
            <button
              type="button"
              className="secondary-button compact-command"
              onClick={() => void loadData()}
              disabled={isLoading || isLinkingLocalProject}
            >
              {isLoading ? "同步中" : "刷新远端"}
            </button>
          </header>
          <div className="project-link-summary">
            <strong>{activeLinkLocalProjectTarget.name}</strong>
            <span>本地项目显示名不会被远端项目名覆盖。</span>
          </div>
          <div className="project-link-list">
            {remoteProjectLinkOptions.map((option) => {
              const disabled = option.isLinkedToOther || option.isCurrent || isLinkingLocalProject;
              return (
                <button
                  key={option.project.id}
                  type="button"
                  className={`project-link-option ${option.isCurrent ? "current" : ""} ${
                    option.isLinkedToOther ? "disabled" : ""
                  }`}
                  disabled={disabled}
                  onClick={() => void handleLinkLocalProjectRemote(option.project)}
                >
                  <span className="project-link-option-main">
                    <strong>{option.projectName}</strong>
                    <span>{option.taskCount} 个当前任务</span>
                  </span>
                  <span className="project-link-option-meta">
                    {option.isCurrent
                      ? "当前关联"
                      : option.isLinkedToOther
                        ? `已关联到「${option.linkedLocalProject?.name ?? "本地项目"}」`
                        : option.isNameMatch
                          ? "名称相近"
                          : "可关联"}
                  </span>
                </button>
              );
            })}
            {isLoading && remoteProjectLinkOptions.length === 0 ? (
              <div className="project-link-empty">
                <LoaderCircle className="spin" size={18} />
                <span>正在拉取远端项目</span>
              </div>
            ) : null}
            {!isLoading && remoteProjectLinkOptions.length === 0 ? (
              <div className="project-link-empty">
                <span>没有可关联的远端项目</span>
              </div>
            ) : null}
          </div>
          <div className="project-link-actions">
            {activeLinkLocalProjectTarget.linkedWorkshopProjectId ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleUnlinkLocalProjectRemote(activeLinkLocalProjectTarget)}
                disabled={isLinkingLocalProject}
              >
                解除关联
              </button>
            ) : null}
            <button
              type="button"
              className="secondary-button"
              onClick={closeLinkLocalProjectRemote}
              disabled={isLinkingLocalProject}
            >
              关闭
            </button>
          </div>
        </section>
      </div>
    ) : null;
  const taskComposerDialog = taskComposer ? (
    <TaskComposer
      key={taskComposer.sessionId}
      busy={isCreatingTask}
      currentUsername={config?.username}
      error={taskComposerError}
      initialContent={taskComposer.content}
      initialProjectId={taskComposer.projectId}
      lockProject={taskComposer.lockProject}
      loadingProjectTagIds={loadingProjectTagIds}
      projects={projects}
      projectTags={projectTags}
      onCancel={() => {
        if (!isCreatingTask) {
          setTaskComposer(null);
          setTaskComposerError("");
          if (surface === "task-composer") {
            void window.workshopDesktop.closeWindow();
          }
        }
      }}
      onProjectChange={handleComposerProjectChange}
      onSubmit={(request) => void submitTaskCreation(request)}
    />
  ) : null;

  if (!config || !draftConfig) {
    return (
      <main className="app-shell loading-shell">
        <LoaderCircle className="spin" size={22} />
      </main>
    );
  }

  const noteWindowFocusClass = !isNoteSurface
    ? ""
    : isWindowSelected
      ? isWindowFocused
        ? "window-selected-focus"
        : "window-selected-idle"
      : "window-unselected-idle";

  if (surface === "task-composer") {
    return taskComposerDialog ?? (
      <main className="app-shell loading-shell">
        <LoaderCircle className="spin" size={22} />
      </main>
    );
  }

  if (surface === "settings") {
    return (
      <SettingsSurface
        draftConfig={draftConfig}
        error={error}
        isRemoteConnected={isLoggedIn(config)}
        isLoggingIn={isLoggingIn}
        isSavingConfig={isSavingConfig}
        isSendingCode={isSendingCode}
        isInstallingWorkshopSkill={isInstallingWorkshopSkill}
        loginCode={loginCode}
        loginCodeType={loginCodeType}
        loginReady={loginReady}
        loginTarget={loginTarget}
        sendCooldown={sendCooldown}
        updateStatus={updateStatus}
        workshopSkillStatus={workshopSkillStatus}
        onCheckForUpdates={() => void handleCheckForUpdates()}
        onCloseWindow={() => void window.workshopDesktop.closeWindow()}
        onInstallUpdate={() => void handleInstallUpdate()}
        onInstallWorkshopSkill={() => void handleInstallWorkshopSkill()}
        onLogin={(event) => void handleLogin(event)}
        onOpenManual={() => void window.workshopDesktop.openManual()}
        onLogout={() => void handleLogout()}
        onSaveConfig={(event) => void handleSaveConfig(event)}
        onSendVerification={() => void handleSendVerification()}
        setLoginCode={setLoginCode}
        setLoginCodeType={setLoginCodeType}
        setLoginTarget={setLoginTarget}
        setDraftConfig={setDraftConfig}
      />
    );
  }

  if (surface === "manual") {
    return (
      <ManualSurface onCloseWindow={() => void window.workshopDesktop.closeWindow()} />
    );
  }

  if (surface === "record") {
    const activeRecordCompletionId = activeRecord?.id || "active-record";
    const isActiveRecordCompleting = Boolean(activeRecord && recordCompletingId === activeRecordCompletionId);
    const isRecordSearchExpanded = recordSearchOpen || hasRecordSearchQuery;

    if (isProjectWorkspace && recordListContext.scopeType === "project") {
      return (
        <>
          <ProjectWorkspaceSurface
            arrangementCompact={arrangementCompact}
            arrangementMessage={arrangementMessage}
            arrangementProtected={arrangementProtected}
            busyTaskId={busyTaskId}
            closeWindow={() => void window.workshopDesktop.closeWindow()}
            completeRecord={(record) => void completeRecord(record)}
            completingRecordId={recordCompletingId}
            completingTaskIds={completingTaskIds}
            config={config}
            focusPulseVisible={focusPulseVisible}
            handleArrangeWindows={() => void handleArrangeStickyWindows()}
            handleDirectoryClick={() => {
              if (
                recordListContext.localProjectId &&
                config.localProjects.some((project) => project.id === recordListContext.localProjectId)
              ) {
                void handleLocalProjectDirectoryClick(recordListContext.localProjectId);
                return;
              }
              if (recordListContext.projectId !== undefined) {
                void handleProjectDirectoryClick(recordListContext.projectId, "record");
              }
            }}
            handleStickyAlwaysOnTop={(enabled) => void handleStickyAlwaysOnTop(enabled)}
            hasSearchQuery={hasRecordSearchQuery}
            isRecordSearchExpanded={isRecordSearchExpanded}
            message={recordMessage || taskMessage || error}
            onCreateRecord={() => void handleNewRecord()}
            onCreateTask={() => {
              if (workspaceProjectId !== undefined && !workspaceTaskCreateDisabledReason) {
                openDirectTaskComposer(workspaceProjectId, true);
              }
            }}
            onCloseSearch={closeProjectWorkspaceSearch}
            onOpenCloseMenu={() => void window.workshopDesktop.showProjectCloseMenu()}
            onExitArrangementCompact={releaseCurrentWindowArrangement}
            onOpenSearch={openProjectWorkspaceSearch}
            onOpenRecord={(record) =>
              void window.workshopDesktop.openPersonalRecord({
                noteId: record.id
              })
            }
            onOpenSettings={() => void window.workshopDesktop.openSettings()}
            onOpenTask={openTaskDetail}
            onReloadTasks={() => void loadData()}
            recordListContext={recordListContext}
            records={visibleWorkspaceRecords}
            recordsCollapsed={workspaceRecordsCollapsed}
            recordsLoaded={recordsLoaded}
            recordSearchInputRef={recordSearchInputRef}
            searchQuery={recordSearchQuery}
            setRecordsCollapsed={setWorkspaceRecordsCollapsed}
            setSearchQuery={setRecordSearchQuery}
            setTasksCollapsed={setWorkspaceTasksCollapsed}
            taskCreateDisabledReason={workspaceTaskCreateDisabledReason}
            taskSourceState={projectTaskSourceState}
            syncWarning={workspaceSyncWarning}
            taskTotalCount={workspaceTasks.length}
            tasks={visibleWorkspaceTasks}
            tasksCollapsed={workspaceTasksCollapsed}
            updateTaskState={(task, state) => void updateTaskState(task, state)}
            windowFocusClass={noteWindowFocusClass}
          />
          {taskComposerDialog}
        </>
      );
    }

    return (
      <>
        <RecordSurface
        activeRecord={activeRecord}
        arrangementCompact={arrangementCompact}
        arrangementMessage={arrangementMessage}
        arrangementProtected={arrangementProtected}
        archiveActiveRecord={() => void archiveActiveRecord()}
        archiveRecord={(record) => void archiveRecord(record)}
        assignRecordToProject={(project) => void assignRecordToProject(project)}
        closeRecordWindow={() => void closeRecordWindow()}
        completeActiveRecord={() => void completeActiveRecord()}
        completeRecord={(record) => void completeRecord(record)}
        config={config}
        createTaskFromRecord={() => void createTaskFromRecord()}
        deleteActiveRecord={() => void deleteActiveRecord()}
        focusPulseVisible={focusPulseVisible}
        handleArrangeStickyWindows={() => void handleArrangeStickyWindows()}
        handleNewRecord={() => void handleNewRecord()}
        handleLocalProjectDirectoryClick={(localProjectId) => void handleLocalProjectDirectoryClick(localProjectId)}
        handleProjectDirectoryClick={(projectId) => void handleProjectDirectoryClick(projectId, "record")}
        handleStickyAlwaysOnTop={(enabled) => void handleStickyAlwaysOnTop(enabled)}
        hasRecordSearchQuery={hasRecordSearchQuery}
        isActiveRecordCompleting={isActiveRecordCompleting}
        isRecordSearchExpanded={isRecordSearchExpanded}
        onExitArrangementCompact={releaseCurrentWindowArrangement}
        onRecordBodyChange={(nextBody) => {
          recordBodyRef.current = nextBody;
          recordDirtyRef.current = true;
          setRecordBody(nextBody);
          setRecordDirty(true);
          setRecordSaveStatus("idle");
        }}
        recordBody={recordBody}
        recordCompletingId={recordCompletingId}
        recordEditorRef={recordEditorRef}
        recordListCollapsed={recordListCollapsed}
        recordListContext={recordListContext}
        recordMessage={recordMessage}
        recordMode={recordMode}
        recordProjectCandidates={recordProjectCandidates}
        recordProjectQuery={recordProjectQuery}
        recordSaveStatus={recordSaveStatus}
        recordScopePickerOpen={recordScopePickerOpen}
        recordSearchInputRef={recordSearchInputRef}
        recordSearchQuery={recordSearchQuery}
        saveRecordNow={() => void saveRecordNow()}
        sendActiveRecordToCodex={() => void sendActiveRecordToCodex()}
        setRecordListCollapsed={setRecordListCollapsed}
        setRecordMode={setRecordMode}
        setRecordProjectQuery={setRecordProjectQuery}
        setRecordScopePickerOpen={setRecordScopePickerOpen}
        setRecordSearchOpen={setRecordSearchOpen}
        setRecordSearchQuery={setRecordSearchQuery}
        visibleRecords={visibleRecords}
        windowFocusClass={noteWindowFocusClass}
        />
        {taskComposerDialog}
      </>
    );
  }

  if (surface === "update") {
    return (
      <UpdateSurface
        updateStatus={updateStatus}
        onCheckForUpdates={() => void handleCheckForUpdates()}
        onInstallUpdate={() => void handleInstallUpdate()}
        onCloseWindow={() => void window.workshopDesktop.closeWindow()}
      />
    );
  }

  if (!isLoggedIn(config) && surface !== "home" && surface !== "tray") {
    if (surface === "sticky") {
      return (
        <StickyLoginRequiredSurface
          closeStickyWindow={() => void closeStickyWindow()}
          focusPulseVisible={focusPulseVisible}
          handleArrangeStickyWindows={() => void handleArrangeStickyWindows()}
          isSingleTaskSticky={isSingleTaskSticky}
          windowFocusClass={noteWindowFocusClass}
        />
      );
    }

    return (
      <LoginSurface
        error={error}
        isLoggingIn={isLoggingIn}
        isSavingConfig={isSavingConfig}
        isSendingCode={isSendingCode}
        loginCode={loginCode}
        loginCodeType={loginCodeType}
        loginReady={loginReady}
        loginTarget={loginTarget}
        sendCooldown={sendCooldown}
        onLogin={(event) => void handleLogin(event)}
        onSendVerification={() => void handleSendVerification()}
        setLoginCode={setLoginCode}
        setLoginCodeType={setLoginCodeType}
        setLoginTarget={setLoginTarget}
      />
    );
  }

  if (surface === "home") {
    return (
      <>
        <HomeSurface
          codexRuns={codexRuns}
          error={error || remoteSyncWarning}
          taskMessage={taskMessage}
          hasManualUpdate={config.lastSeenManualRevision !== manualRevision}
          isLoading={isLoading}
          isRemoteConnected={isLoggedIn(config)}
          localProjects={config.localProjects}
          localProjectRecordCounts={localProjectRecordCounts}
          projectRecordCounts={projectRecordCounts}
          projectLocalDirectories={config.projectLocalDirectories}
          projectTodoGroups={projectTodoGroups}
          recentTasks={recentTasks}
          updateStatus={updateStatus}
          isCreatingLocalProject={isCreatingLocalProject}
          loadData={() => void loadData()}
          hideProjectTaskPreview={hideProjectTaskPreview}
          onOpenManual={() => void window.workshopDesktop.openManual()}
          onOpenCreateTask={() => openDirectTaskComposer()}
          onOpenCreateLocalProject={() => void handleCreateLocalProject()}
          onOpenPersonalRecords={() => void window.workshopDesktop.openPersonalRecord()}
          onOpenSettings={() => void window.workshopDesktop.openSettings()}
          onOpenSticky={() => void window.workshopDesktop.openSticky()}
          onLocalProjectDirectoryClick={(localProjectId) => void handleLocalProjectDirectoryClick(localProjectId)}
          onLocalProjectWorkspace={openLocalProjectWorkspace}
          onLinkLocalProjectRemote={(project) => void openLinkLocalProjectRemote(project)}
          onProjectHover={showProjectTaskPreview}
          onProjectWorkspace={openProjectWorkspace}
          onRemoteProjectDirectoryClick={(projectId) => void handleProjectDirectoryClick(projectId, "sticky")}
          onRenameLocalProject={openRenameLocalProject}
          onUnlinkLocalProjectRemote={(project) => void handleUnlinkLocalProjectRemote(project)}
          onTaskOpen={openTaskDetail}
        />
        {renameLocalProjectDialog}
        {linkLocalProjectDialog}
        {taskComposerDialog}
      </>
    );
  }

  if (surface === "sticky") {
    const isStickyContentCollapsed = (stickyListCollapsed || arrangementCompact) && !isSingleTaskSticky;
    const stickyHeader = getStickyHeader({
      filteredTaskCount: filteredTasks.length,
      isSingleTaskSticky,
      projectFilter,
      selectedProjectName,
      selectedTask
    });
    const stickyProjectId = !isSingleTaskSticky && projectFilter !== "all" ? Number(projectFilter) : undefined;

    return (
      <StickySurface
        arrangementCompact={arrangementCompact}
        arrangementMessage={arrangementMessage}
        arrangementProtected={arrangementProtected}
        busyTaskId={busyTaskId}
        canExtractTasks={canExtractTasks}
        closeStickyWindow={() => void closeStickyWindow()}
        completingTaskIds={completingTaskIds}
        config={config}
        error={error}
        extractTaskToSticky={extractTaskToSticky}
        filteredTasks={filteredTasks}
        focusPulseVisible={focusPulseVisible}
        handleArrangeStickyWindows={() => void handleArrangeStickyWindows()}
        handleProjectDirectoryClick={(projectId) => void handleProjectDirectoryClick(projectId, "sticky")}
        handleStickyAlwaysOnTop={(enabled) => void handleStickyAlwaysOnTop(enabled)}
        isLoading={isLoading}
        isSingleTaskSticky={isSingleTaskSticky}
        isStickyContentCollapsed={isStickyContentCollapsed}
        onOpenProjectWorkspace={() =>
          void window.workshopDesktop.openPersonalRecord({
            scopeType: "project",
            projectId: Number(projectFilter),
            projectName: selectedProjectName
          })
        }
        onExitArrangementCompact={releaseCurrentWindowArrangement}
        onTaskArchive={() => handleTaskArchive()}
        openTaskDetail={openTaskDetail}
        saveTaskNoteNow={() => void saveTaskNoteNow()}
        selectedProjectName={selectedProjectName}
        selectedTask={selectedTask}
        setStickyListCollapsed={setStickyListCollapsed}
        stickyHeader={stickyHeader}
        stickyListCollapsed={stickyListCollapsed}
        stickyProjectId={stickyProjectId}
        taskMessage={selectedTaskCodexMessage || taskMessage}
        taskNoteBody={taskNoteBody}
        updateTaskNoteBody={(body) => {
          taskNoteBodyRef.current = body;
          taskNoteDirtyRef.current = true;
          setTaskNoteBody(body);
          setTaskNoteDirty(true);
        }}
        updateTaskState={(nextTask, state) => void updateTaskState(nextTask, state)}
        sendTaskToCodex={(task) => void sendTaskToCodex(task)}
        windowFocusClass={noteWindowFocusClass}
      />
    );
  }

  return (
    <>
      <TraySurface
        codexRuns={codexRuns}
        error={error || remoteSyncWarning}
        hoveredProjectId={hoveredProjectId}
        isLoading={isLoading}
        localProjects={config.localProjects}
        localProjectRecordCounts={localProjectRecordCounts}
        projectRecordCounts={projectRecordCounts}
        projectLocalDirectories={config.projectLocalDirectories}
        projectTodoGroups={projectTodoGroups}
        updateStatus={updateStatus}
        hasManualUpdate={config.lastSeenManualRevision !== manualRevision}
        hideProjectTaskPreview={hideProjectTaskPreview}
        loadData={() => void loadData()}
        onLocalProjectDirectoryClick={(localProjectId) => void handleLocalProjectDirectoryClick(localProjectId)}
        onLocalProjectWorkspace={openLocalProjectWorkspace}
        onLinkLocalProjectRemote={(project) => void openLinkLocalProjectRemote(project)}
        onOpenHome={() => void window.workshopDesktop.openHome()}
        onOpenManual={() => void window.workshopDesktop.openManual()}
        onProjectHover={showProjectTaskPreview}
        onRemoteProjectDirectoryClick={(projectId) => void handleProjectDirectoryClick(projectId, "sticky")}
        onProjectWorkspace={openProjectWorkspace}
        onRenameLocalProject={openRenameLocalProject}
        onUnlinkLocalProjectRemote={(project) => void handleUnlinkLocalProjectRemote(project)}
      />
      {renameLocalProjectDialog}
      {linkLocalProjectDialog}
    </>
  );
}
